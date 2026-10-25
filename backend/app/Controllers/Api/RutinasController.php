<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use App\Libraries\Uuid;
use App\Models\HorarioRutinaModel;
use App\Models\RutinaModel;
use CodeIgniter\API\ResponseTrait;
use CodeIgniter\HTTP\ResponseInterface;
use DateTimeImmutable;
use DateTimeZone;
use Throwable;

final class RutinasController extends BaseController
{
    use ResponseTrait;

    private const LIMITE_CAMBIOS = 200;

    public function listar(): ResponseInterface
    {
        $desde = $this->normalizarDesde($this->request->getGet('desde'));
        if ($desde === false) {
            return $this->failValidationErrors([
                'desde' => 'La fecha desde no tiene un formato valido.',
            ]);
        }

        $model = new RutinaModel();
        $model->withDeleted()->where('usuario_id', $this->usuarioId());
        if (is_string($desde)) {
            $model->where('actualizado_en >', $desde);
        }

        $rutinas = $model->orderBy('actualizado_en', 'ASC')->findAll(self::LIMITE_CAMBIOS);
        $horariosPorRutina = $this->horariosPorRutina(array_column($rutinas, 'id'));
        $rutinas = array_map(
            fn (array $rutina): array => $this->formatearRutina(
                $rutina,
                ! empty($rutina['eliminado_en']) ? [] : ($horariosPorRutina[$rutina['id']] ?? []),
            ),
            $rutinas,
        );

        return $this->respond([
            'data' => [
                'rutinas'     => $rutinas,
                'servidor_en' => gmdate(DATE_ATOM),
                'hay_mas'     => count($rutinas) === self::LIMITE_CAMBIOS,
            ],
        ]);
    }

    public function sincronizar(): ResponseInterface
    {
        try {
            $entrada = $this->request->getJSON(true);
        } catch (Throwable) {
            return $this->failValidationErrors(['json' => 'El cuerpo JSON no es valido.']);
        }
        $rutinas = is_array($entrada) ? ($entrada['rutinas'] ?? null) : null;
        if (! is_array($rutinas)) {
            return $this->failValidationErrors([
                'rutinas' => 'Incluye una lista de rutinas para sincronizar.',
            ]);
        }
        if (count($rutinas) > self::LIMITE_CAMBIOS) {
            return $this->failValidationErrors([
                'rutinas' => 'Solo se permiten 200 cambios por solicitud.',
            ]);
        }

        $usuarioId = $this->usuarioId();
        $baseDatos = db_connect(config('Auth')->DBGroup);
        $baseDatos->transBegin();
        $sincronizadas = [];
        $conflictos = [];

        try {
            foreach ($rutinas as $indice => $rutina) {
                if (! is_array($rutina)) {
                    $baseDatos->transRollback();

                    return $this->failValidationErrors([
                        "rutinas.{$indice}" => 'La rutina debe ser un objeto.',
                    ]);
                }

                $resultado = $this->guardarRutina($usuarioId, $rutina, $indice);
                if (isset($resultado['errores'])) {
                    $baseDatos->transRollback();

                    return $this->failValidationErrors($resultado['errores']);
                }
                if (isset($resultado['conflicto'])) {
                    $conflictos[] = $resultado['conflicto'];
                    continue;
                }

                $sincronizadas[] = $resultado['rutina'];
            }

            if ($baseDatos->transStatus() === false) {
                throw new \RuntimeException('La base de datos rechazo uno de los cambios.');
            }

            $baseDatos->transCommit();

            return $this->respond([
                'data' => [
                    'sincronizadas' => $sincronizadas,
                    'conflictos'    => $conflictos,
                    'servidor_en'   => gmdate(DATE_ATOM),
                ],
            ]);
        } catch (Throwable $exception) {
            $baseDatos->transRollback();
            log_message('error', 'No fue posible sincronizar las rutinas: {message}', [
                'message' => $exception->getMessage(),
            ]);

            return $this->failServerError('No fue posible sincronizar las rutinas.');
        }
    }

    private function guardarRutina(int $usuarioId, array $entrada, int $indice): array
    {
        $idCliente = trim((string) ($entrada['id_cliente'] ?? ''));
        if ($idCliente === '' || mb_strlen($idCliente) > 100) {
            return ['errores' => [
                "rutinas.{$indice}.id_cliente" => 'El identificador del telefono es obligatorio.',
            ]];
        }

        $model = new RutinaModel();
        $existente = $model->withDeleted()
            ->where('usuario_id', $usuarioId)
            ->where('id_cliente', $idCliente)
            ->first();
        $versionBase = max(0, (int) ($entrada['version_base'] ?? 0));
        if (is_array($existente) && $versionBase !== (int) $existente['version']) {
            return ['conflicto' => $this->formatearRutina(
                $existente,
                $this->horariosPorRutina([$existente['id']])[$existente['id']] ?? [],
            )];
        }

        if (filter_var($entrada['eliminada'] ?? false, FILTER_VALIDATE_BOOL)) {
            if (! is_array($existente)) {
                return ['rutina' => [
                    'id_cliente' => $idCliente,
                    'eliminada'  => true,
                    'version'    => 0,
                ]];
            }

            $model->update($existente['id'], ['version' => (int) $existente['version'] + 1]);
            $model->delete($existente['id']);

            return ['rutina' => $this->formatearRutina(
                $model->withDeleted()->find($existente['id']),
                [],
            )];
        }

        $datos = $this->validarRutina($entrada, $indice);
        if (isset($datos['errores'])) {
            return $datos;
        }

        $id = is_array($existente) ? $existente['id'] : Uuid::v4();
        $registro = [
            ...$datos,
            'id'          => $id,
            'usuario_id'  => $usuarioId,
            'id_cliente'  => $idCliente,
            'version'     => is_array($existente) ? (int) $existente['version'] + 1 : 1,
            'eliminado_en'=> null,
        ];
        is_array($existente) ? $model->update($id, $registro) : $model->insert($registro);

        $horarios = $this->guardarHorarios($id, $entrada['horarios'] ?? [], $indice);
        if (isset($horarios['errores'])) {
            return $horarios;
        }

        return ['rutina' => $this->formatearRutina(
            $model->withDeleted()->find($id),
            $horarios['horarios'],
        )];
    }

    private function validarRutina(array $entrada, int $indice): array
    {
        $datos = [
            'nombre'                     => trim((string) ($entrada['nombre'] ?? '')),
            'color'                      => trim((string) ($entrada['color'] ?? '#2563eb')),
            'hora_inicio_predeterminada' => $this->normalizarHora($entrada['hora_inicio_predeterminada'] ?? ''),
            'hora_fin_predeterminada'    => $this->normalizarHora($entrada['hora_fin_predeterminada'] ?? ''),
            'activa'                     => filter_var($entrada['activa'] ?? true, FILTER_VALIDATE_BOOL) ? 1 : 0,
        ];

        $validation = service('validation');
        $validation->reset();
        $validation->setRules([
            'nombre'                     => 'required|string|max_length[150]',
            'color'                      => 'required|regex_match[/^#[0-9a-fA-F]{6}$/]',
            'hora_inicio_predeterminada' => 'required|regex_match[/^([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d$/]',
            'hora_fin_predeterminada'    => 'required|regex_match[/^([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d$/]',
        ]);

        if (! $validation->run($datos)) {
            return ['errores' => array_combine(
                array_map(
                    static fn (string $campo): string => "rutinas.{$indice}.{$campo}",
                    array_keys($validation->getErrors()),
                ),
                array_values($validation->getErrors()),
            )];
        }

        if ($datos['hora_fin_predeterminada'] <= $datos['hora_inicio_predeterminada']) {
            return ['errores' => [
                "rutinas.{$indice}.hora_fin_predeterminada" => 'La hora de fin debe ser posterior a la hora de inicio.',
            ]];
        }

        return $datos;
    }

    private function guardarHorarios(string $rutinaId, mixed $entradas, int $indiceRutina): array
    {
        if (! is_array($entradas)) {
            return ['errores' => [
                "rutinas.{$indiceRutina}.horarios" => 'Los horarios deben enviarse como una lista.',
            ]];
        }

        $normalizados = [];
        foreach ($entradas as $indice => $entrada) {
            if (! is_array($entrada)) {
                return ['errores' => [
                    "rutinas.{$indiceRutina}.horarios.{$indice}" => 'El horario debe ser un objeto.',
                ]];
            }
            $dia = (int) ($entrada['dia_semana'] ?? -1);
            $inicio = $this->normalizarHora($entrada['hora_inicio'] ?? '');
            $fin = $this->normalizarHora($entrada['hora_fin'] ?? '');
            if ($dia < 0 || $dia > 6 || ! $this->horaValida($inicio) || ! $this->horaValida($fin) || $fin <= $inicio) {
                return ['errores' => [
                    "rutinas.{$indiceRutina}.horarios.{$indice}" => 'El dia o el intervalo del horario no es valido.',
                ]];
            }
            if (isset($normalizados[$dia])) {
                return ['errores' => [
                    "rutinas.{$indiceRutina}.horarios.{$indice}.dia_semana" => 'No puede repetirse el mismo dia.',
                ]];
            }
            $normalizados[$dia] = [
                'rutina_id'  => $rutinaId,
                'dia_semana' => $dia,
                'hora_inicio'=> $inicio,
                'hora_fin'   => $fin,
            ];
        }

        $model = new HorarioRutinaModel();
        $model->where('rutina_id', $rutinaId)->delete();
        foreach ($normalizados as $horario) {
            $model->insert($horario);
        }

        return ['horarios' => array_values($normalizados)];
    }

    private function horariosPorRutina(array $rutinaIds): array
    {
        if ($rutinaIds === []) {
            return [];
        }

        $horarios = (new HorarioRutinaModel())
            ->whereIn('rutina_id', $rutinaIds)
            ->orderBy('dia_semana', 'ASC')
            ->findAll();
        $agrupados = [];
        foreach ($horarios as $horario) {
            $agrupados[$horario['rutina_id']][] = $horario;
        }

        return $agrupados;
    }

    private function formatearRutina(array $rutina, array $horarios): array
    {
        $rutina['activa'] = (bool) $rutina['activa'];
        $rutina['eliminada'] = ! empty($rutina['eliminado_en']);
        $rutina['horarios'] = $horarios;

        return $rutina;
    }

    private function normalizarHora(mixed $valor): string
    {
        $hora = trim((string) $valor);

        return strlen($hora) === 5 ? $hora . ':00' : $hora;
    }

    private function horaValida(string $hora): bool
    {
        return preg_match('/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/', $hora) === 1;
    }

    private function normalizarDesde(mixed $valor): string|false|null
    {
        if ($valor === null || trim((string) $valor) === '') {
            return null;
        }

        try {
            return (new DateTimeImmutable((string) $valor))
                ->setTimezone(new DateTimeZone('UTC'))
                ->format('Y-m-d H:i:s');
        } catch (Throwable) {
            return false;
        }
    }

    private function usuarioId(): int
    {
        return (int) auth('tokens')->user()->id;
    }
}
