<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use App\Libraries\GoogleTokenCipher;
use App\Models\IntegracionGoogleCalendarModel;
use CodeIgniter\API\ResponseTrait;
use CodeIgniter\HTTP\ResponseInterface;
use Config\GoogleCalendar as GoogleCalendarConfig;
use DateTimeImmutable;
use DateTimeZone;
use Google\Client as GoogleClient;
use Google\Service\Calendar as CalendarService;
use Throwable;

final class GoogleCalendarController extends BaseController
{
    use ResponseTrait;

    public function estado(): ResponseInterface
    {
        $connection = $this->connectionForUser($this->userId());

        return $this->respond(['data' => [
            'connected' => is_array($connection) && ! empty($connection['token_cifrado']),
            'connectedAt' => $connection['conectado_en'] ?? null,
            'selectedCalendarIds' => $this->selectedCalendars($connection),
        ]]);
    }

    public function autorizar(): ResponseInterface
    {
        try {
            $config = $this->config();
            $this->assertConfigured($config);
            $state = bin2hex(random_bytes(32));
            $model = new IntegracionGoogleCalendarModel();
            $existing = $this->connectionForUser($this->userId());
            $data = [
                'usuario_id' => $this->userId(),
                'estado_hash' => hash('sha256', $state),
                'estado_expira_en' => gmdate('Y-m-d H:i:s', time() + 600),
            ];
            if (! is_array($existing)) {
                $data['calendarios_seleccionados'] = json_encode(['primary'], JSON_THROW_ON_ERROR);
            }
            $saved = is_array($existing)
                ? $model->update($this->userId(), $data)
                : $model->insert($data);
            if ($saved === false) {
                throw new \RuntimeException('No fue posible preparar la autorizacion.');
            }

            $client = $this->baseClient($config);
            $client->setState($state);

            return $this->respond(['data' => ['authorizationUrl' => $client->createAuthUrl()]]);
        } catch (Throwable $exception) {
            log_message('error', 'No fue posible iniciar Google Calendar: {message}', [
                'message' => $exception->getMessage(),
            ]);

            return $this->failServerError('No fue posible iniciar la conexion con Google Calendar.');
        }
    }

    public function callback(): ResponseInterface
    {
        $state = trim((string) $this->request->getGet('state'));
        $code = trim((string) $this->request->getGet('code'));
        if ($state === '' || $code === '' || $this->request->getGet('error')) {
            return $this->returnToFrontend('error');
        }

        $model = new IntegracionGoogleCalendarModel();
        $connection = $model
            ->where('estado_hash', hash('sha256', $state))
            ->where('estado_expira_en >=', gmdate('Y-m-d H:i:s'))
            ->first();
        if (! is_array($connection)) {
            return $this->returnToFrontend('expired');
        }

        try {
            $config = $this->config();
            $this->assertConfigured($config);
            $client = $this->baseClient($config);
            $token = $client->fetchAccessTokenWithAuthCode($code);
            if (isset($token['error']) || empty($token['access_token'])) {
                throw new \RuntimeException((string) ($token['error_description'] ?? $token['error'] ?? 'Token invalido'));
            }

            if (empty($token['refresh_token']) && ! empty($connection['token_cifrado'])) {
                $previous = $this->cipher()->decrypt($connection['token_cifrado'], $config->clientSecret);
                $token['refresh_token'] = $previous['refresh_token'] ?? null;
            }
            if (empty($token['refresh_token'])) {
                throw new \RuntimeException('Google no entrego acceso sin conexion. Revoca el permiso y vuelve a intentarlo.');
            }
            $token['created'] = $token['created'] ?? time();

            $model->update($connection['usuario_id'], [
                'token_cifrado' => $this->cipher()->encrypt($token, $config->clientSecret),
                'estado_hash' => null,
                'estado_expira_en' => null,
                'conectado_en' => gmdate('Y-m-d H:i:s'),
            ]);

            return $this->returnToFrontend('connected');
        } catch (Throwable $exception) {
            log_message('error', 'No fue posible completar Google Calendar: {message}', [
                'message' => $exception->getMessage(),
            ]);
            $model->update($connection['usuario_id'], ['estado_hash' => null, 'estado_expira_en' => null]);

            return $this->returnToFrontend('error');
        }
    }

    public function calendarios(): ResponseInterface
    {
        try {
            [$service, $connection] = $this->serviceForUser($this->userId());
            $selected = $this->selectedCalendars($connection);
            $entries = [];
            $pageToken = null;
            do {
                $list = $service->calendarList->listCalendarList(['pageToken' => $pageToken]);
                foreach ($list->getItems() as $calendar) {
                    $id = (string) $calendar->getId();
                    $primary = $calendar->getPrimary() === true;
                    $entries[] = [
                        'id' => $id,
                        'name' => (string) ($calendar->getSummaryOverride() ?: $calendar->getSummary() ?: 'Calendario'),
                        'color' => (string) ($calendar->getBackgroundColor() ?: '#2563eb'),
                        'primary' => $primary,
                        'selected' => in_array($id, $selected, true) || ($primary && in_array('primary', $selected, true)),
                        'accessRole' => (string) $calendar->getAccessRole(),
                    ];
                }
                $pageToken = $list->getNextPageToken();
            } while ($pageToken);

            return $this->respond(['data' => ['calendars' => $entries]]);
        } catch (Throwable $exception) {
            return $this->calendarFailure($exception);
        }
    }

    public function seleccionarCalendarios(): ResponseInterface
    {
        $input = $this->request->getJSON(true);
        $ids = is_array($input) ? ($input['calendarIds'] ?? null) : null;
        if (! is_array($ids) || count($ids) > 50) {
            return $this->failValidationErrors(['calendarIds' => 'Incluye una lista valida de calendarios.']);
        }
        $ids = array_values(array_unique(array_filter(array_map(
            static fn ($id): string => mb_substr(trim((string) $id), 0, 255),
            $ids,
        ))));
        $connection = $this->connectionForUser($this->userId());
        if (! is_array($connection) || empty($connection['token_cifrado'])) {
            return $this->failUnauthorized('Google Calendar no esta conectado.');
        }
        (new IntegracionGoogleCalendarModel())->update($this->userId(), [
            'calendarios_seleccionados' => json_encode($ids, JSON_THROW_ON_ERROR),
        ]);

        return $this->respond(['data' => ['selectedCalendarIds' => $ids]]);
    }

    public function eventos(): ResponseInterface
    {
        $from = $this->dateParameter('from');
        $to = $this->dateParameter('to');
        if (! $from || ! $to || $to <= $from || $to->diff($from)->days > 400) {
            return $this->failValidationErrors(['range' => 'El rango de fechas no es valido.']);
        }

        try {
            [$service, $connection] = $this->serviceForUser($this->userId());
            $events = [];
            foreach ($this->selectedCalendars($connection) as $calendarId) {
                $pageToken = null;
                do {
                    $result = $service->events->listEvents($calendarId, [
                        'timeMin' => $from->setTime(0, 0)->format(DATE_RFC3339),
                        'timeMax' => $to->setTime(0, 0)->format(DATE_RFC3339),
                        'singleEvents' => true,
                        'orderBy' => 'startTime',
                        'showDeleted' => false,
                        'maxResults' => 2500,
                        'pageToken' => $pageToken,
                    ]);
                    foreach ($result->getItems() as $event) {
                        $start = $event->getStart();
                        $end = $event->getEnd();
                        $events[] = [
                            'id' => (string) $event->getId(),
                            'calendarId' => $calendarId,
                            'title' => (string) ($event->getSummary() ?: 'Evento'),
                            'description' => $event->getDescription(),
                            'location' => $event->getLocation(),
                            'startDateTime' => $start?->getDateTime(),
                            'endDateTime' => $end?->getDateTime(),
                            'startDate' => $start?->getDate(),
                            'endDate' => $end?->getDate(),
                            'status' => (string) $event->getStatus(),
                            'htmlLink' => $event->getHtmlLink(),
                        ];
                    }
                    $pageToken = $result->getNextPageToken();
                } while ($pageToken);
            }

            return $this->respond(['data' => ['events' => $events]]);
        } catch (Throwable $exception) {
            return $this->calendarFailure($exception);
        }
    }

    public function desconectar(): ResponseInterface
    {
        $connection = $this->connectionForUser($this->userId());
        if (is_array($connection) && ! empty($connection['token_cifrado'])) {
            try {
                $config = $this->config();
                $token = $this->cipher()->decrypt($connection['token_cifrado'], $config->clientSecret);
                $client = $this->baseClient($config);
                $client->revokeToken($token['refresh_token'] ?? $token['access_token'] ?? null);
            } catch (Throwable $exception) {
                log_message('notice', 'Google no confirmo la revocacion: {message}', ['message' => $exception->getMessage()]);
            }
            (new IntegracionGoogleCalendarModel())->delete($this->userId());
        }

        return $this->respondDeleted(['message' => 'Google Calendar fue desconectado.']);
    }

    private function serviceForUser(int $userId): array
    {
        $connection = $this->connectionForUser($userId);
        if (! is_array($connection) || empty($connection['token_cifrado'])) {
            throw new \RuntimeException('Google Calendar no esta conectado.');
        }
        $config = $this->config();
        $this->assertConfigured($config);
        $token = $this->cipher()->decrypt($connection['token_cifrado'], $config->clientSecret);
        $client = $this->baseClient($config);
        $client->setAccessToken($token);

        if ($client->isAccessTokenExpired()) {
            $refreshToken = (string) ($token['refresh_token'] ?? '');
            if ($refreshToken === '') {
                throw new \RuntimeException('La conexion con Google Calendar expiro.');
            }
            $refreshed = $client->fetchAccessTokenWithRefreshToken($refreshToken);
            if (isset($refreshed['error']) || empty($refreshed['access_token'])) {
                throw new \RuntimeException('Google Calendar requiere que vuelvas a conectarlo.');
            }
            $token = array_merge($token, $refreshed, ['refresh_token' => $refreshToken, 'created' => time()]);
            (new IntegracionGoogleCalendarModel())->update($userId, [
                'token_cifrado' => $this->cipher()->encrypt($token, $config->clientSecret),
            ]);
        }

        return [new CalendarService($client), $connection];
    }

    private function baseClient(GoogleCalendarConfig $config): GoogleClient
    {
        $client = new GoogleClient();
        $client->setClientId($config->clientId);
        $client->setClientSecret($config->clientSecret);
        $client->setRedirectUri($config->redirectUri);
        $client->setScopes([$config->scope]);
        $client->setAccessType('offline');
        $client->setIncludeGrantedScopes(true);
        $client->setPrompt('consent');

        return $client;
    }

    private function connectionForUser(int $userId): ?array
    {
        $connection = (new IntegracionGoogleCalendarModel())->find($userId);

        return is_array($connection) ? $connection : null;
    }

    private function selectedCalendars(?array $connection): array
    {
        if (! is_array($connection)) return [];
        $decoded = json_decode((string) ($connection['calendarios_seleccionados'] ?? '[]'), true);

        return is_array($decoded)
            ? array_values(array_filter($decoded, static fn ($id): bool => is_string($id) && $id !== ''))
            : [];
    }

    private function dateParameter(string $name): ?DateTimeImmutable
    {
        $value = (string) $this->request->getGet($name);
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value, new DateTimeZone('UTC'));

        return $date && $date->format('Y-m-d') === $value ? $date : null;
    }

    private function returnToFrontend(string $result): ResponseInterface
    {
        $separator = str_contains($this->config()->frontendReturnUri, '?') ? '&' : '?';

        return redirect()->to($this->config()->frontendReturnUri . $separator . 'google_calendar=' . rawurlencode($result));
    }

    private function calendarFailure(Throwable $exception): ResponseInterface
    {
        log_message('error', 'Google Calendar fallo: {message}', ['message' => $exception->getMessage()]);
        if (str_contains($exception->getMessage(), 'no esta conectado') || str_contains($exception->getMessage(), 'expiro')) {
            return $this->failUnauthorized($exception->getMessage());
        }

        return $this->failServerError('No fue posible consultar Google Calendar.');
    }

    private function assertConfigured(GoogleCalendarConfig $config): void
    {
        if ($config->clientId === '' || $config->clientSecret === '' || $config->clientSecret === 'PEGA_AQUI_EL_SECRETO' || $config->redirectUri === '') {
            throw new \RuntimeException('Google Calendar no esta configurado en el servidor.');
        }
    }

    private function config(): GoogleCalendarConfig
    {
        return config('GoogleCalendar');
    }

    private function cipher(): GoogleTokenCipher
    {
        return new GoogleTokenCipher();
    }

    private function userId(): int
    {
        return (int) auth('tokens')->user()->id;
    }
}
