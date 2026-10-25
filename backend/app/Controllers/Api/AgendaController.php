<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use App\Libraries\Uuid;
use App\Models\ElementoAgendaModel;
use App\Models\RutinaModel;
use App\Models\SubtareaModel;
use CodeIgniter\API\ResponseTrait;
use CodeIgniter\HTTP\ResponseInterface;
use DateTimeImmutable;
use DateTimeZone;
use Throwable;

final class AgendaController extends BaseController
{
    use ResponseTrait;

    private const LIMITE_CAMBIOS = 500;

    public function listar(): ResponseInterface
    {
        $desde = $this->normalizarDesde($this->request->getGet('desde'));
        if ($desde === false) {
            return $this->failValidationErrors([
                'desde' => 'La fecha desde no tiene un formato valido.',
            ]);
        }

        $usuarioId = $this->usuarioId();
        $elementosModel = new ElementoAgendaModel();
        $elementosModel->withDeleted()->where('usuario_id', $usuarioId);

        if (is_string($desde)) {
            $elementosModel->where('actualizado_en >', $desde);
        }

        $elementos = $elementosModel
            ->orderBy('actualizado_en', 'ASC')
            ->findAll(self::LIMITE_CAMBIOS);

        $subtareasPorElemento = $this->subtareasPorElemento(array_column($elementos, 'id'));
        $elementos = array_map(
            fn (array $elemento): array => $this->formatearElemento(
                $elemento,
                $subtareasPorElemento[$elemento['id']] ?? [],
            ),
            $elementos,
        );

        return $this->respond([
            'data' => [
                'elementos'  => $elementos,
                'servidor_en'=> gmdate(DATE_ATOM),
                'hay_mas'    => count($elementos) === self::LIMITE_CAMBIOS,
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
        $elementos = is_array($entrada) ? ($entrada['elementos'] ?? null) : null;

        if (! is_array($elementos)) {
            return $this->failValidationErrors([
                'elementos' => 'Incluye una lista de elementos para sincronizar.',
            ]);
        }
        if (count($elementos) > self::LIMITE_CAMBIOS) {
            return $this->failValidationErrors([
                'elementos' => 'Solo se permiten 500 cambios por solicitud.',
            ]);
        }

        $usuarioId = $this->usuarioId();
        $baseDatos = db_connect(config('Auth')->DBGroup);
        $baseDatos->transBegin();
        $sincronizados = [];
        $conflictos = [];

        try {
            foreach ($elementos as $indice => $elemento) {
                if (! is_array($elemento)) {
                    $baseDatos->transRollback();

                    return $this->failValidationErrors([
                        "elementos.{$indice}" => 'El elemento debe ser un objeto.',
                    ]);
                }

                $resultado = $this->guardarElemento($usuarioId, $elemento, $indice);
                if (isset($resultado['errores'])) {
                    $baseDatos->transRollback();

                    return $this->failValidationErrors($resultado['errores']);
                }
                if (isset($resultado['conflicto'])) {
                    $conflictos[] = $resultado['conflicto'];
                    continue;
                }

                $sincronizados[] = $resultado['elemento'];
            }

            if ($baseDatos->transStatus() === false) {
                throw new \RuntimeException('La base de datos rechazo uno de los cambios.');
            }

            $baseDatos->transCommit();

            return $this->respond([
                'data' => [
                    'sincronizados' => $sincronizados,
                    'conflictos'    => $conflictos,
                    'servidor_en'   => gmdate(DATE_ATOM),
                ],
            ]);
        } catch (Throwable $exception) {
            $baseDatos->transRollback();
            log_message('error', 'No fue posible sincronizar la agenda: {message}', [
                'message' => $exception->getMessage(),
            ]);

            return $this->failServerError('No fue posible sincronizar la agenda.');
        }
    }

    private function guardarElemento(int $usuarioId, array $entrada, int $indice): array
    {
        $idCliente = trim((string) ($entrada['id_cliente'] ?? ''));
        if ($idCliente === '' || mb_strlen($idCliente) > 100) {
            return ['errores' => [
                "elementos.{$indice}.id_cliente" => 'El identificador del telefono es obligatorio.',
            ]];
        }

        $model = new ElementoAgendaModel();
        $existente = $model->withDeleted()
            ->where('usuario_id', $usuarioId)
            ->where('id_cliente', $idCliente)
            ->first();
        $versionBase = max(0, (int) ($entrada['version_base'] ?? 0));

        if (is_array($existente) && $versionBase !== (int) $existente['version']) {
            return ['conflicto' => $this->formatearElemento(
                $existente,
                $this->subtareasPorElemento([$existente['id']])[$existente['id']] ?? [],
            )];
        }

        $eliminado = filter_var($entrada['eliminado'] ?? false, FILTER_VALIDATE_BOOL);
        if ($eliminado) {
            if (! is_array($existente)) {
                return ['elemento' => [
                    'id_cliente' => $idCliente,
                    'eliminado'  => true,
                    'version'    => 0,
                ]];
            }

            $version = (int) $existente['version'] + 1;
            $model->update($existente['id'], ['version' => $version]);
            $model->delete($existente['id']);
            $eliminado = $model->withDeleted()->find($existente['id']);

            return ['elemento' => $this->formatearElemento($eliminado, [])];
        }

        $datos = $this->validarElemento($entrada, $indice);
        if (isset($datos['errores'])) {
            return $datos;
        }

        $erroresRelacion = $this->validarRelaciones($usuarioId, $datos, $indice);
        if ($erroresRelacion !== []) {
            return ['errores' => $erroresRelacion];
        }

        $id = is_array($existente) ? $existente['id'] : Uuid::v4();
        $version = is_array($existente) ? (int) $existente['version'] + 1 : 1;
        $registro = [
            ...$datos,
            'id'          => $id,
            'usuario_id'  => $usuarioId,
            'id_cliente'  => $idCliente,
            'version'     => $version,
            'eliminado_en'=> null,
        ];

        if (is_array($existente)) {
            $model->update($id, $registro);
        } else {
            $model->insert($registro);
        }

        $subtareas = $this->guardarSubtareas($id, $entrada['subtareas'] ?? [], $indice);
        if (isset($subtareas['errores'])) {
            return $subtareas;
        }

        $guardado = $model->withDeleted()->find($id);

        return ['elemento' => $this->formatearElemento($guardado, $subtareas['subtareas'])];
    }

    private function validarElemento(array $entrada, int $indice): array
    {
        $datos = [
            'titulo'           => trim((string) ($entrada['titulo'] ?? '')),
            'tipo'             => $entrada['tipo'] ?? 'tarea',
            'fecha_programada' => $this->valorOpcional($entrada, 'fecha_programada'),
            'hora_inicio'      => $this->horaOpcional($entrada, 'hora_inicio'),
            'hora_fin'         => $this->horaOpcional($entrada, 'hora_fin'),
            'duracion_minutos' => isset($entrada['duracion_minutos']) ? max(0, (int) $entrada['duracion_minutos']) : null,
            'color'            => $this->valorOpcional($entrada, 'color'),
            'rutina_id'        => $this->valorOpcional($entrada, 'rutina_id'),
            'prioridad'        => $entrada['prioridad'] ?? 'media',
            'estado'           => $entrada['estado'] ?? 'pendiente',
            'etiqueta'         => $this->valorOpcional($entrada, 'etiqueta'),
            'favorita'         => filter_var($entrada['favorita'] ?? false, FILTER_VALIDATE_BOOL) ? 1 : 0,
            'repeticion'       => $this->repeticionEnEspanol((string) ($entrada['repeticion'] ?? 'ninguna')),
            'serie_id'         => $this->valorOpcional($entrada, 'serie_id'),
            'fecha_ocurrencia' => $this->valorOpcional($entrada, 'fecha_ocurrencia'),
            'padre_id'         => $this->valorOpcional($entrada, 'padre_id'),
        ];

        $excepciones = $entrada['excepciones_repeticion'] ?? [];
        $datos['excepciones_repeticion'] = json_encode(
            is_array($excepciones) ? array_values($excepciones) : [],
            JSON_THROW_ON_ERROR,
        );

        $validation = service('validation');
        $validation->reset();
        $validation->setRules([
            'titulo'             => 'required|string|max_length[255]',
            'tipo'               => 'required|in_list[tarea,evento]',
            'fecha_programada'   => 'permit_empty|valid_date[Y-m-d]',
            'hora_inicio'        => 'permit_empty|regex_match[/^([01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?$/]',
            'hora_fin'           => 'permit_empty|regex_match[/^([01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?$/]',
            'color'              => 'permit_empty|regex_match[/^#[0-9a-fA-F]{6}$/]',
            'prioridad'          => 'required|in_list[baja,media,alta]',
            'estado'             => 'required|in_list[pendiente,completada,vencida,ignorada]',
            'etiqueta'           => 'permit_empty|string|max_length[30]',
            'repeticion'         => 'required|in_list[ninguna,diaria,semanal,mensual]',
            'fecha_ocurrencia'   => 'permit_empty|valid_date[Y-m-d]',
        ]);

        if (! $validation->run($datos)) {
            return ['errores' => array_combine(
                array_map(
                    static fn (string $campo): string => "elementos.{$indice}.{$campo}",
                    array_keys($validation->getErrors()),
                ),
                array_values($validation->getErrors()),
            )];
        }

        return $datos;
    }

    private function guardarSubtareas(string $elementoId, mixed $entradas, int $indiceElemento): array
    {
        if (! is_array($entradas)) {
            return ['errores' => [
                "elementos.{$indiceElemento}.subtareas" => 'Las subtareas deben enviarse como una lista.',
            ]];
        }

        $model = new SubtareaModel();
        $resultado = [];
        $identificadoresRecibidos = [];
        foreach ($entradas as $indice => $entrada) {
            if (! is_array($entrada)) {
                return ['errores' => [
                    "elementos.{$indiceElemento}.subtareas.{$indice}" => 'La subtarea debe ser un objeto.',
                ]];
            }

            $idCliente = trim((string) ($entrada['id_cliente'] ?? ''));
            $identificadoresRecibidos[] = $idCliente;
            $titulo = trim((string) ($entrada['titulo'] ?? ''));
            if ($idCliente === '' || mb_strlen($idCliente) > 100 || ($titulo === '' && empty($entrada['eliminado']))) {
                return ['errores' => [
                    "elementos.{$indiceElemento}.subtareas.{$indice}" => 'La subtarea necesita identificador y titulo.',
                ]];
            }

            $existente = $model->withDeleted()
                ->where('elemento_agenda_id', $elementoId)
                ->where('id_cliente', $idCliente)
                ->first();
            $versionBase = max(0, (int) ($entrada['version_base'] ?? 0));
            if (is_array($existente) && $versionBase !== (int) $existente['version']) {
                $resultado[] = $existente;
                continue;
            }

            if (filter_var($entrada['eliminado'] ?? false, FILTER_VALIDATE_BOOL)) {
                if (is_array($existente)) {
                    $model->update($existente['id'], ['version' => (int) $existente['version'] + 1]);
                    $model->delete($existente['id']);
                    $resultado[] = $model->withDeleted()->find($existente['id']);
                }
                continue;
            }

            $id = is_array($existente) ? $existente['id'] : Uuid::v4();
            $registro = [
                'id'                => $id,
                'elemento_agenda_id'=> $elementoId,
                'id_cliente'        => $idCliente,
                'titulo'            => $titulo,
                'completada'        => filter_var($entrada['completada'] ?? false, FILTER_VALIDATE_BOOL) ? 1 : 0,
                'posicion'          => max(0, (int) ($entrada['posicion'] ?? $indice)),
                'version'           => is_array($existente) ? (int) $existente['version'] + 1 : 1,
                'eliminado_en'      => null,
            ];
            is_array($existente) ? $model->update($id, $registro) : $model->insert($registro);
            $resultado[] = $model->withDeleted()->find($id);
        }

        $existentes = $model->where('elemento_agenda_id', $elementoId)->findAll();
        foreach ($existentes as $existente) {
            if (in_array($existente['id_cliente'], $identificadoresRecibidos, true)) {
                continue;
            }
            $model->update($existente['id'], ['version' => (int) $existente['version'] + 1]);
            $model->delete($existente['id']);
        }

        return ['subtareas' => $resultado];
    }

    private function validarRelaciones(int $usuarioId, array $datos, int $indice): array
    {
        $errores = [];
        if ($datos['rutina_id'] !== null) {
            $rutina = (new RutinaModel())
                ->where('id', $datos['rutina_id'])
                ->where('usuario_id', $usuarioId)
                ->first();
            if (! is_array($rutina)) {
                $errores["elementos.{$indice}.rutina_id"] = 'La rutina no existe o no pertenece al usuario.';
            }
        }

        if ($datos['padre_id'] !== null) {
            $padre = (new ElementoAgendaModel())
                ->where('id', $datos['padre_id'])
                ->where('usuario_id', $usuarioId)
                ->first();
            if (! is_array($padre)) {
                $errores["elementos.{$indice}.padre_id"] = 'La tarea principal no existe o no pertenece al usuario.';
            }
        }

        return $errores;
    }

    private function subtareasPorElemento(array $elementoIds): array
    {
        if ($elementoIds === []) {
            return [];
        }

        $subtareas = (new SubtareaModel())
            ->withDeleted()
            ->whereIn('elemento_agenda_id', $elementoIds)
            ->orderBy('posicion', 'ASC')
            ->findAll();

        $agrupadas = [];
        foreach ($subtareas as $subtarea) {
            $agrupadas[$subtarea['elemento_agenda_id']][] = $subtarea;
        }

        return $agrupadas;
    }

    private function formatearElemento(array $elemento, array $subtareas): array
    {
        $elemento['favorita'] = (bool) $elemento['favorita'];
        $elemento['excepciones_repeticion'] = $this->decodificarLista($elemento['excepciones_repeticion'] ?? null);
        $elemento['eliminado'] = ! empty($elemento['eliminado_en']);
        $elemento['subtareas'] = array_map(static function (array $subtarea): array {
            $subtarea['completada'] = (bool) $subtarea['completada'];
            $subtarea['eliminado'] = ! empty($subtarea['eliminado_en']);

            return $subtarea;
        }, $subtareas);

        return $elemento;
    }

    private function decodificarLista(mixed $valor): array
    {
        if (is_array($valor)) {
            return $valor;
        }
        if (! is_string($valor) || $valor === '') {
            return [];
        }

        $decodificado = json_decode($valor, true);

        return is_array($decodificado) ? $decodificado : [];
    }

    private function valorOpcional(array $entrada, string $campo): ?string
    {
        $valor = trim((string) ($entrada[$campo] ?? ''));

        return $valor !== '' ? $valor : null;
    }

    private function horaOpcional(array $entrada, string $campo): ?string
    {
        $valor = $this->valorOpcional($entrada, $campo);

        return $valor !== null && strlen($valor) === 5 ? $valor . ':00' : $valor;
    }

    private function repeticionEnEspanol(string $repeticion): string
    {
        return [
            'none'    => 'ninguna',
            'daily'   => 'diaria',
            'weekly'  => 'semanal',
            'monthly' => 'mensual',
        ][$repeticion] ?? $repeticion;
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
