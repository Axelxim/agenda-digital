<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use App\Libraries\Uuid;
use App\Models\UserProfileModel;
use CodeIgniter\API\ResponseTrait;
use CodeIgniter\HTTP\ResponseInterface;
use CodeIgniter\Shield\Authentication\Authenticators\Session;
use CodeIgniter\Shield\Entities\User;
use CodeIgniter\Shield\Exceptions\ValidationException;
use CodeIgniter\Shield\Models\UserModel;
use Throwable;

final class AuthController extends BaseController
{
    use ResponseTrait;

    public function register(): ResponseInterface
    {
        $input = $this->jsonInput();
        $rules = [
            'name' => [
                'label' => 'nombre',
                'rules' => 'required|string|min_length[2]|max_length[100]',
            ],
            'email' => [
                'label' => 'correo electronico',
                'rules' => 'required|max_length[254]|valid_email|is_unique[auth_identities.secret]',
            ],
            'password' => [
                'label' => 'contrasena',
                'rules' => 'required|max_byte[72]|strong_password[]',
            ],
            'password_confirmation' => [
                'label' => 'confirmacion de contrasena',
                'rules' => 'required|matches[password]',
            ],
            'device_name' => [
                'label' => 'dispositivo',
                'rules' => 'permit_empty|string|max_length[100]',
            ],
        ];

        if (! $this->validateData($input, $rules, [], config('Auth')->DBGroup)) {
            return $this->failValidationErrors($this->validator->getErrors());
        }

        $data     = $this->validator->getValidated();
        $database = db_connect(config('Auth')->DBGroup);
        $database->transBegin();

        try {
            /** @var UserModel $users */
            $users = auth()->getProvider();
            $user  = new User([
                'username' => null,
                'email'    => strtolower(trim($data['email'])),
                'password' => $data['password'],
            ]);
            if (! $users->save($user)) {
                $database->transRollback();

                return $this->failValidationErrors($users->errors());
            }

            $user = $users->findById($users->getInsertID());
            if (! $user instanceof User) {
                throw new \RuntimeException('No fue posible recuperar el usuario creado.');
            }

            $users->addToDefaultGroup($user);
            $user->activate();

            $profiles = new UserProfileModel();
            $profileId = $profiles->insert([
                'user_id'      => $user->id,
                'uuid'         => Uuid::v4(),
                'display_name' => trim($data['name']),
                'locale'       => 'es-MX',
                'timezone'     => 'America/Mexico_City',
            ]);

            if ($profileId === false) {
                throw new \RuntimeException('No fue posible crear el perfil del usuario.');
            }

            $profile = $profiles->find($user->id);
            $token   = $user->generateAccessToken($this->deviceName($data), ['sync']);

            $database->transCommit();

            return $this->respondCreated($this->authPayload($user, $profile, $token->raw_token));
        } catch (ValidationException $exception) {
            $database->transRollback();

            return $this->failValidationErrors($exception->getMessage());
        } catch (Throwable $exception) {
            $database->transRollback();
            log_message('error', 'No fue posible registrar al usuario: {message}', [
                'message' => $exception->getMessage(),
            ]);

            return $this->failServerError('No fue posible crear la cuenta.');
        }
    }

    public function login(): ResponseInterface
    {
        $input = $this->jsonInput();
        $rules = [
            'email' => [
                'label' => 'correo electronico',
                'rules' => 'required|max_length[254]|valid_email',
            ],
            'password' => [
                'label' => 'contrasena',
                'rules' => 'required|max_byte[72]',
            ],
            'device_name' => [
                'label' => 'dispositivo',
                'rules' => 'permit_empty|string|max_length[100]',
            ],
        ];

        if (! $this->validateData($input, $rules, [], config('Auth')->DBGroup)) {
            return $this->failValidationErrors($this->validator->getErrors());
        }

        $data = $this->validator->getValidated();
        /** @var Session $authenticator */
        $authenticator = auth('session')->getAuthenticator();
        $result = $authenticator->attempt([
            'email'    => strtolower(trim($data['email'])),
            'password' => $data['password'],
        ]);

        if (! $result->isOK()) {
            return $this->failUnauthorized('El correo o la contrasena no son correctos.');
        }

        /** @var User $user */
        $user    = $result->extraInfo();
        $profile = (new UserProfileModel())->find($user->id);

        if (! is_array($profile)) {
            $authenticator->logout();

            return $this->failServerError('La cuenta no tiene un perfil valido.');
        }

        $token = $user->generateAccessToken($this->deviceName($data), ['sync']);
        $authenticator->logout();

        return $this->respond($this->authPayload($user, $profile, $token->raw_token));
    }

    public function me(): ResponseInterface
    {
        $user = auth('tokens')->user();

        return $this->respond(['data' => $this->userData($user)]);
    }

    public function updateProfile(): ResponseInterface
    {
        $input = $this->jsonInput();
        $rules = [
            'name' => [
                'label' => 'nombre',
                'rules' => 'if_exist|required|string|min_length[2]|max_length[100]',
            ],
            'locale' => [
                'label' => 'idioma',
                'rules' => 'if_exist|required|regex_match[/^[a-z]{2}(?:-[A-Z]{2})?$/]',
            ],
            'timezone' => [
                'label' => 'zona horaria',
                'rules' => 'if_exist|required|timezone|max_length[64]',
            ],
        ];

        if ($input === [] || ! $this->validateData($input, $rules)) {
            $errors = $input === []
                ? ['profile' => 'Incluye al menos un dato para actualizar.']
                : $this->validator->getErrors();

            return $this->failValidationErrors($errors);
        }

        $data    = $this->validator->getValidated();
        $user    = auth('tokens')->user();
        $changes = [];

        if (array_key_exists('name', $data)) {
            $changes['display_name'] = trim($data['name']);
        }
        if (array_key_exists('locale', $data)) {
            $changes['locale'] = $data['locale'];
        }
        if (array_key_exists('timezone', $data)) {
            $changes['timezone'] = $data['timezone'];
        }

        $profiles = new UserProfileModel();
        if (! $profiles->update($user->id, $changes)) {
            return $this->failValidationErrors($profiles->errors());
        }

        return $this->respond(['data' => $this->userData($user)]);
    }

    public function logout(): ResponseInterface
    {
        $user     = auth('tokens')->user();
        $rawToken = $this->bearerToken();

        if ($rawToken !== '') {
            $user->revokeAccessToken($rawToken);
        }

        return $this->respondDeleted(['message' => 'Sesion cerrada en este dispositivo.']);
    }

    public function logoutAll(): ResponseInterface
    {
        auth('tokens')->user()->revokeAllAccessTokens();

        return $this->respondDeleted(['message' => 'Sesion cerrada en todos los dispositivos.']);
    }

    private function jsonInput(): array
    {
        $input = $this->request->getJSON(true);

        return is_array($input) ? $input : [];
    }

    private function deviceName(array $data): string
    {
        $name = trim((string) ($data['device_name'] ?? ''));

        return $name !== '' ? $name : 'Todo en Orden - com.todoenorden.app';
    }

    private function authPayload(User $user, array $profile, string $rawToken): array
    {
        return [
            'data' => [
                'user'       => $this->formatUser($user, $profile),
                'token'      => $rawToken,
                'token_type' => 'Bearer',
            ],
        ];
    }

    private function userData(User $user): array
    {
        $profile = (new UserProfileModel())->find($user->id);

        return $this->formatUser($user, is_array($profile) ? $profile : []);
    }

    private function formatUser(User $user, array $profile): array
    {
        return [
            'id'       => $profile['uuid'] ?? null,
            'name'     => $profile['display_name'] ?? '',
            'email'    => $user->email,
            'locale'   => $profile['locale'] ?? 'es-MX',
            'timezone' => $profile['timezone'] ?? 'America/Mexico_City',
        ];
    }

    private function bearerToken(): string
    {
        $authorization = $this->request->getHeaderLine('Authorization');

        return preg_match('/^Bearer\s+(.+)$/i', $authorization, $matches) === 1
            ? trim($matches[1])
            : '';
    }
}
