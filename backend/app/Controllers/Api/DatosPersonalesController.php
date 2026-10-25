<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use App\Libraries\Uuid;
use App\Models\ConfiguracionBilleteraModel;
use App\Models\GastoFijoModel;
use App\Models\MovimientoBilleteraModel;
use App\Models\NotaRapidaModel;
use App\Models\PreferenciaUsuarioModel;
use App\Models\RecordatorioEtiquetaModel;
use App\Models\TomaMedicamentoModel;
use App\Models\TratamientoMedicamentoModel;
use CodeIgniter\API\ResponseTrait;
use CodeIgniter\HTTP\ResponseInterface;
use CodeIgniter\Model;
use Throwable;

class DatosPersonalesController extends BaseController
{
    use ResponseTrait;

    private const LIMITE = 2000;

    public function listarNotas(): ResponseInterface
    {
        $notas = array_map(static fn (array $nota): array => [
            'id' => $nota['id_cliente'], 'titulo' => $nota['titulo'], 'contenido' => $nota['contenido'] ?? '',
            'creado_en' => $nota['creado_en'], 'actualizado_en' => $nota['actualizado_en'],
        ], (new NotaRapidaModel())->where('usuario_id', $this->usuarioId())->findAll());

        return $this->respuestaPrivada(['data' => ['notas' => $notas, 'servidor_en' => gmdate(DATE_ATOM)]]);
    }

    public function sincronizarNotasModulo(): ResponseInterface
    {
        $entrada = $this->entradaJson();
        if ($entrada === null || ! is_array($entrada['notas'] ?? null) || count($entrada['notas']) > self::LIMITE) {
            return $this->failValidationErrors(['notas' => 'Incluye una lista valida de notas.']);
        }
        $this->sincronizarNotas($this->usuarioId(), $entrada['notas']);

        return $this->listarNotas();
    }

    public function listarTratamientos(): ResponseInterface
    {
        $tratamientos = (new TratamientoMedicamentoModel())->where('usuario_id', $this->usuarioId())->findAll();

        return $this->respuestaPrivada(['data' => [
            'tratamientos' => array_map(fn (array $item): array => $this->formatearTratamiento($item), $tratamientos),
            'servidor_en' => gmdate(DATE_ATOM),
        ]]);
    }

    public function listarTomas(): ResponseInterface
    {
        $usuarioId = $this->usuarioId();
        $tratamientos = (new TratamientoMedicamentoModel())->where('usuario_id', $usuarioId)->findAll();
        $porId = array_column($tratamientos, 'id_cliente', 'id');
        $model = new TomaMedicamentoModel();
        $model->where('usuario_id', $usuarioId);
        $tratamientoCliente = trim((string) $this->request->getGet('tratamiento_id'));
        if ($tratamientoCliente !== '') {
            $tratamiento = array_values(array_filter($tratamientos, static fn (array $item): bool => $item['id_cliente'] === $tratamientoCliente))[0] ?? null;
            if (! is_array($tratamiento)) return $this->failNotFound('El tratamiento no existe.');
            $model->where('tratamiento_id', $tratamiento['id']);
        }
        $fecha = $this->fechaConsulta($this->request->getGet('fecha'));
        $desde = $this->fechaConsulta($this->request->getGet('desde'));
        $hasta = $this->fechaConsulta($this->request->getGet('hasta'));
        if ($fecha !== null) {
            $model->where('programada_en >=', $fecha . ' 00:00:00')->where('programada_en <', date('Y-m-d 00:00:00', strtotime($fecha . ' +1 day')));
        } else {
            if ($desde !== null) $model->where('programada_en >=', $desde . ' 00:00:00');
            if ($hasta !== null) $model->where('programada_en <', date('Y-m-d 00:00:00', strtotime($hasta . ' +1 day')));
        }
        $tomas = array_map(static fn (array $item): array => [
            'id' => $item['id_cliente'], 'tratamiento_id' => $porId[$item['tratamiento_id']] ?? '',
            'programada_en' => str_replace(' ', 'T', $item['programada_en']), 'estado' => $item['estado'],
            'registrada_en' => $item['registrada_en'] ? str_replace(' ', 'T', $item['registrada_en']) : null,
            'nota' => $item['nota'], 'actualizado_en' => $item['actualizado_en'],
        ], $model->orderBy('programada_en', 'ASC')->findAll(self::LIMITE));

        return $this->respuestaPrivada(['data' => ['tomas' => $tomas, 'servidor_en' => gmdate(DATE_ATOM)]]);
    }

    public function sincronizarBienestar(): ResponseInterface
    {
        $entrada = $this->entradaJson();
        if ($entrada === null || ! is_array($entrada['tratamientos'] ?? null) || ! is_array($entrada['tomas'] ?? null)
            || count($entrada['tratamientos']) > self::LIMITE || count($entrada['tomas']) > self::LIMITE) {
            return $this->failValidationErrors(['bienestar' => 'Incluye tratamientos y tomas validos.']);
        }
        $usuarioId = $this->usuarioId();
        $db = db_connect(config('Auth')->DBGroup);
        $db->transBegin();
        try {
            $mapa = $this->sincronizarTratamientos($usuarioId, $entrada['tratamientos']);
            $this->sincronizarTomas($usuarioId, $entrada['tomas'], $mapa);
            if (is_array($entrada['preferencias'] ?? null)) $this->guardarPreferencias($usuarioId, $entrada['preferencias']);
            if ($db->transStatus() === false) throw new \RuntimeException('La base de datos rechazo los cambios.');
            $db->transCommit();
            return $this->listarTratamientos();
        } catch (Throwable $exception) {
            $db->transRollback();
            return $this->failServerError('No fue posible sincronizar Bienestar.');
        }
    }

    public function listarBilletera(): ResponseInterface
    {
        $usuarioId = $this->usuarioId();
        $configuracion = (new ConfiguracionBilleteraModel())->find($usuarioId);
        $gastos = (new GastoFijoModel())->where('usuario_id', $usuarioId)->findAll();
        $gastosPorId = array_column($gastos, 'id_cliente', 'id');
        $movimientos = (new MovimientoBilleteraModel())->where('usuario_id', $usuarioId)->orderBy('fecha', 'DESC')->findAll(self::LIMITE);

        return $this->respuestaPrivada(['data' => ['billetera' => [
            'configuracion' => [
                'monto_sueldo' => (float) ($configuracion['monto_sueldo'] ?? 0),
                'periodicidad_pago' => $configuracion['periodicidad_pago'] ?? 'quincenal',
                'primera_fecha_pago' => $configuracion['primera_fecha_pago'] ?? date('Y-m-d'),
                'moneda' => $configuracion['moneda'] ?? 'MXN', 'actualizado_en' => $configuracion['actualizado_en'] ?? null,
            ],
            'gastos_fijos' => array_map(static fn (array $item): array => [
                'id' => $item['id_cliente'], 'nombre' => $item['nombre'], 'monto' => (float) $item['monto'], 'categoria' => $item['categoria'],
                'dia_vencimiento' => (int) $item['dia_vencimiento'], 'frecuencia_meses' => (int) $item['frecuencia_meses'],
                'primer_vencimiento' => $item['primer_vencimiento'], 'inicio_seguimiento' => $item['inicio_seguimiento'],
                'hora_recordatorio' => substr($item['hora_recordatorio'], 0, 5), 'activo' => (bool) $item['activo'],
                'creado_en' => $item['creado_en'], 'actualizado_en' => $item['actualizado_en'],
            ], $gastos),
            'movimientos' => array_map(static fn (array $item): array => [
                'id' => $item['id_cliente'], 'naturaleza' => $item['naturaleza'], 'tipo' => $item['tipo'],
                'descripcion' => $item['descripcion'], 'monto' => (float) $item['monto'], 'categoria' => $item['categoria'],
                'fecha' => $item['fecha'], 'gasto_fijo_id' => $item['gasto_fijo_id'] ? ($gastosPorId[$item['gasto_fijo_id']] ?? null) : null,
                'periodo_gasto_fijo' => $item['periodo_gasto_fijo'], 'creado_en' => $item['creado_en'], 'actualizado_en' => $item['actualizado_en'],
            ], $movimientos),
        ], 'servidor_en' => gmdate(DATE_ATOM)]]);
    }

    public function sincronizarBilletera(): ResponseInterface
    {
        $entrada = $this->entradaJson();
        if ($entrada === null || ! is_array($entrada['configuracion'] ?? null) || ! is_array($entrada['gastos_fijos'] ?? null)
            || ! is_array($entrada['movimientos'] ?? null) || count($entrada['gastos_fijos']) > self::LIMITE || count($entrada['movimientos']) > self::LIMITE) {
            return $this->failValidationErrors(['billetera' => 'Incluye configuracion, gastos y movimientos validos.']);
        }
        $usuarioId = $this->usuarioId();
        $db = db_connect(config('Auth')->DBGroup);
        $db->transBegin();
        try {
            $this->guardarConfiguracionBilletera($usuarioId, $entrada['configuracion']);
            $gastos = $this->sincronizarGastos($usuarioId, $entrada['gastos_fijos']);
            $this->sincronizarMovimientos($usuarioId, $entrada['movimientos'], $gastos);
            if ($db->transStatus() === false) throw new \RuntimeException('La base de datos rechazo los cambios.');
            $db->transCommit();
            return $this->listarBilletera();
        } catch (Throwable $exception) {
            $db->transRollback();
            return $this->failServerError('No fue posible sincronizar Billetera.');
        }
    }

    public function listarPreferencias(): ResponseInterface
    {
        $usuarioId = $this->usuarioId();
        $preferencias = (new PreferenciaUsuarioModel())->find($usuarioId);
        $recordatorios = array_map(static fn (array $item): array => [
            'etiqueta' => $item['etiqueta'], 'activo' => (bool) $item['activo'],
            'minutos_anticipacion' => json_decode($item['minutos_anticipacion'] ?: '[]', true) ?: [],
            'aviso_al_vencer' => (bool) $item['aviso_al_vencer'], 'hora_sin_horario' => substr($item['hora_sin_horario'], 0, 5),
            'actualizado_en' => $item['actualizado_en'],
        ], (new RecordatorioEtiquetaModel())->where('usuario_id', $usuarioId)->findAll());

        return $this->respuestaPrivada(['data' => [
            'preferencias' => ['modo_avanzado' => (bool) ($preferencias['modo_avanzado'] ?? false), 'bienestar_activo' => (bool) ($preferencias['bienestar_activo'] ?? false)],
            'recordatorios_etiqueta' => $recordatorios, 'servidor_en' => gmdate(DATE_ATOM),
        ]]);
    }

    public function sincronizarPreferencias(): ResponseInterface
    {
        $entrada = $this->entradaJson();
        if ($entrada === null || ! is_array($entrada['preferencias'] ?? null) || ! is_array($entrada['recordatorios_etiqueta'] ?? null)) {
            return $this->failValidationErrors(['preferencias' => 'Incluye preferencias y recordatorios validos.']);
        }
        $usuarioId = $this->usuarioId();
        $this->guardarPreferencias($usuarioId, $entrada['preferencias']);
        $this->sincronizarRecordatoriosEtiqueta($usuarioId, $entrada['recordatorios_etiqueta']);

        return $this->listarPreferencias();
    }

    public function listar(): ResponseInterface
    {
        $usuarioId = $this->usuarioId();
        $preferencias = (new PreferenciaUsuarioModel())->find($usuarioId);
        $configuracion = (new ConfiguracionBilleteraModel())->find($usuarioId);
        $tratamientos = (new TratamientoMedicamentoModel())->where('usuario_id', $usuarioId)->findAll();
        $tratamientosPorId = array_column($tratamientos, 'id_cliente', 'id');
        $gastos = (new GastoFijoModel())->where('usuario_id', $usuarioId)->findAll();
        $gastosPorId = array_column($gastos, 'id_cliente', 'id');

        return $this->respuestaPrivada(['data' => [
            'preferencias' => [
                'modo_avanzado'   => (bool) ($preferencias['modo_avanzado'] ?? false),
                'bienestar_activo'=> (bool) ($preferencias['bienestar_activo'] ?? false),
                'actualizado_en'  => $preferencias['actualizado_en'] ?? null,
            ],
            'recordatorios_etiqueta' => array_map(static fn (array $item): array => [
                'etiqueta' => $item['etiqueta'],
                'activo' => (bool) $item['activo'],
                'minutos_anticipacion' => json_decode($item['minutos_anticipacion'] ?: '[]', true) ?: [],
                'aviso_al_vencer' => (bool) $item['aviso_al_vencer'],
                'hora_sin_horario' => substr($item['hora_sin_horario'], 0, 5),
                'actualizado_en' => $item['actualizado_en'],
            ], (new RecordatorioEtiquetaModel())->where('usuario_id', $usuarioId)->findAll()),
            'notas' => array_map(static fn (array $nota): array => [
                'id'         => $nota['id_cliente'],
                'titulo'     => $nota['titulo'],
                'contenido'  => $nota['contenido'] ?? '',
                'creado_en'  => $nota['creado_en'],
                'actualizado_en' => $nota['actualizado_en'],
            ], (new NotaRapidaModel())->where('usuario_id', $usuarioId)->findAll()),
            'bienestar' => [
                'tratamientos' => array_map(fn (array $item): array => $this->formatearTratamiento($item), $tratamientos),
                'tomas' => array_map(static fn (array $item): array => [
                    'id'              => $item['id_cliente'],
                    'tratamiento_id'  => $tratamientosPorId[$item['tratamiento_id']] ?? '',
                    'programada_en'   => str_replace(' ', 'T', $item['programada_en']),
                    'estado'          => $item['estado'],
                    'registrada_en'   => $item['registrada_en'] ? str_replace(' ', 'T', $item['registrada_en']) : null,
                    'nota'            => $item['nota'],
                    'actualizado_en'  => $item['actualizado_en'],
                ], (new TomaMedicamentoModel())->where('usuario_id', $usuarioId)->findAll()),
            ],
            'billetera' => [
                'configuracion' => [
                    'monto_sueldo'       => (float) ($configuracion['monto_sueldo'] ?? 0),
                    'periodicidad_pago'  => $configuracion['periodicidad_pago'] ?? 'quincenal',
                    'primera_fecha_pago' => $configuracion['primera_fecha_pago'] ?? date('Y-m-d'),
                    'moneda'             => $configuracion['moneda'] ?? 'MXN',
                    'actualizado_en'      => $configuracion['actualizado_en'] ?? null,
                ],
                'gastos_fijos' => array_map(static fn (array $item): array => [
                    'id'                  => $item['id_cliente'],
                    'nombre'              => $item['nombre'],
                    'monto'               => (float) $item['monto'],
                    'categoria'           => $item['categoria'],
                    'dia_vencimiento'     => (int) $item['dia_vencimiento'],
                    'frecuencia_meses'    => (int) $item['frecuencia_meses'],
                    'primer_vencimiento'  => $item['primer_vencimiento'],
                    'inicio_seguimiento'  => $item['inicio_seguimiento'],
                    'hora_recordatorio'   => substr($item['hora_recordatorio'], 0, 5),
                    'activo'              => (bool) $item['activo'],
                    'creado_en'           => $item['creado_en'],
                    'actualizado_en'      => $item['actualizado_en'],
                ], $gastos),
                'movimientos' => array_map(static fn (array $item): array => [
                    'id'                   => $item['id_cliente'],
                    'naturaleza'           => $item['naturaleza'],
                    'tipo'                 => $item['tipo'],
                    'descripcion'          => $item['descripcion'],
                    'monto'                => (float) $item['monto'],
                    'categoria'            => $item['categoria'],
                    'fecha'                => $item['fecha'],
                    'gasto_fijo_id'        => $item['gasto_fijo_id'] ? ($gastosPorId[$item['gasto_fijo_id']] ?? null) : null,
                    'periodo_gasto_fijo'   => $item['periodo_gasto_fijo'],
                    'creado_en'            => $item['creado_en'],
                    'actualizado_en'       => $item['actualizado_en'],
                ], (new MovimientoBilleteraModel())->where('usuario_id', $usuarioId)->findAll()),
            ],
            'servidor_en' => gmdate(DATE_ATOM),
        ]]);
    }

    public function sincronizar(): ResponseInterface
    {
        try {
            $entrada = $this->request->getJSON(true);
        } catch (Throwable) {
            return $this->failValidationErrors(['json' => 'El cuerpo JSON no es valido.']);
        }
        if (! is_array($entrada)) return $this->failValidationErrors(['datos' => 'Los datos son obligatorios.']);

        foreach (['recordatorios_etiqueta', 'notas', 'tratamientos', 'tomas', 'gastos_fijos', 'movimientos'] as $coleccion) {
            if (! isset($entrada[$coleccion]) || ! is_array($entrada[$coleccion]) || count($entrada[$coleccion]) > self::LIMITE) {
                return $this->failValidationErrors([$coleccion => 'La coleccion es invalida o demasiado grande.']);
            }
        }

        $usuarioId = $this->usuarioId();
        $db = db_connect(config('Auth')->DBGroup);
        $db->transBegin();
        try {
            $preferencias = is_array($entrada['preferencias'] ?? null) ? $entrada['preferencias'] : [];
            $this->guardarPreferencias($usuarioId, $preferencias);
            $this->sincronizarRecordatoriosEtiqueta($usuarioId, $entrada['recordatorios_etiqueta']);
            $this->sincronizarNotas($usuarioId, $entrada['notas']);
            $tratamientos = $this->sincronizarTratamientos($usuarioId, $entrada['tratamientos']);
            $this->sincronizarTomas($usuarioId, $entrada['tomas'], $tratamientos);
            $configuracion = is_array($entrada['configuracion_billetera'] ?? null) ? $entrada['configuracion_billetera'] : [];
            $this->guardarConfiguracionBilletera($usuarioId, $configuracion);
            $gastos = $this->sincronizarGastos($usuarioId, $entrada['gastos_fijos']);
            $this->sincronizarMovimientos($usuarioId, $entrada['movimientos'], $gastos);
            if ($db->transStatus() === false) throw new \RuntimeException('La base de datos rechazo los cambios.');
            $db->transCommit();
            return $this->listar();
        } catch (Throwable $exception) {
            $db->transRollback();
            log_message('error', 'Error sincronizando datos personales: {message}', ['message' => $exception->getMessage()]);
            return $this->failServerError('No fue posible sincronizar los datos personales.');
        }
    }

    private function sincronizarNotas(int $usuarioId, array $entradas): void
    {
        $model = new NotaRapidaModel();
        $ids = [];
        foreach ($entradas as $item) {
            if (! is_array($item) || trim((string) ($item['id'] ?? '')) === '') continue;
            $idCliente = substr(trim((string) $item['id']), 0, 100);
            $ids[] = $idCliente;
            $this->guardarSincronizable($model, $usuarioId, $idCliente, [
                'titulo' => substr(trim((string) ($item['title'] ?? '')), 0, 255),
                'contenido' => (string) ($item['content'] ?? ''),
            ]);
        }
        $this->eliminarAusentes($model, $usuarioId, $ids);
    }

    private function sincronizarRecordatoriosEtiqueta(int $usuarioId, array $entradas): void
    {
        $model = new RecordatorioEtiquetaModel();
        $etiquetas = [];
        foreach ($entradas as $item) {
            if (! is_array($item) || trim((string) ($item['label'] ?? '')) === '') continue;
            $etiqueta = substr(trim((string) $item['label']), 0, 30);
            $etiquetas[] = $etiqueta;
            $existente = $model->where('usuario_id', $usuarioId)->where('etiqueta', $etiqueta)->first();
            $datos = [
                'usuario_id' => $usuarioId,
                'etiqueta' => $etiqueta,
                'activo' => ! empty($item['enabled']) ? 1 : 0,
                'minutos_anticipacion' => json_encode(array_values($item['advanceMinutes'] ?? []), JSON_THROW_ON_ERROR),
                'aviso_al_vencer' => ($item['duePromptEnabled'] ?? true) ? 1 : 0,
                'hora_sin_horario' => $this->hora($item['dateOnlyTime'] ?? null),
            ];
            is_array($existente) ? $model->update($existente['id'], $datos) : $model->insert($datos);
        }
        foreach ($model->where('usuario_id', $usuarioId)->findAll() as $existente) {
            if (! in_array($existente['etiqueta'], $etiquetas, true)) $model->delete($existente['id']);
        }
    }

    private function sincronizarTratamientos(int $usuarioId, array $entradas): array
    {
        $model = new TratamientoMedicamentoModel();
        $ids = [];
        $mapa = [];
        foreach ($entradas as $item) {
            if (! is_array($item) || trim((string) ($item['id'] ?? '')) === '') continue;
            $idCliente = substr(trim((string) $item['id']), 0, 100);
            $ids[] = $idCliente;
            $schedule = is_array($item['schedule'] ?? null) ? $item['schedule'] : [];
            $guardado = $this->guardarSincronizable($model, $usuarioId, $idCliente, [
                'nombre_tratamiento' => $this->textoOpcional($item['treatmentName'] ?? null, 150),
                'nombre_medicamento' => substr(trim((string) ($item['name'] ?? 'Medicamento')), 0, 150),
                'dosis' => substr(trim((string) ($item['dose'] ?? 'Dosis indicada')), 0, 100),
                'indicaciones' => $this->textoOpcional($item['instructions'] ?? null),
                'fecha_inicio' => $this->fecha($item['startDate'] ?? null),
                'fecha_fin' => ! empty($item['continuous']) ? null : $this->fecha($item['endDate'] ?? null, true),
                'continuo' => ! empty($item['continuous']) ? 1 : 0,
                'dias_programados' => json_encode(array_values($schedule['days'] ?? []), JSON_THROW_ON_ERROR),
                'horas_programadas' => json_encode(array_values($schedule['times'] ?? []), JSON_THROW_ON_ERROR),
                'color' => preg_match('/^#[0-9a-f]{6}$/i', (string) ($item['color'] ?? '')) ? $item['color'] : '#22c55e',
                'seguimiento_estricto' => ! empty($item['strictTracking']) ? 1 : 0,
                'inventario_activo' => ! empty($item['stockEnabled']) ? 1 : 0,
                'cantidad_inventario' => max(0, (float) ($item['stockQuantity'] ?? 0)),
                'unidades_por_toma' => max(0.001, (float) ($item['doseUnits'] ?? 1)),
                'unidad_inventario' => substr(trim((string) ($item['stockUnit'] ?? 'tabletas')), 0, 40),
                'umbral_inventario_bajo' => max(0, (float) ($item['lowStockThreshold'] ?? 5)),
                'estado' => in_array($item['status'] ?? '', ['active', 'paused', 'finished'], true) ? $item['status'] : 'active',
            ]);
            $mapa[$idCliente] = $guardado['id'];
        }
        $this->eliminarAusentes($model, $usuarioId, $ids);
        return $mapa;
    }

    private function sincronizarTomas(int $usuarioId, array $entradas, array $tratamientos): void
    {
        $model = new TomaMedicamentoModel();
        $ids = [];
        foreach ($entradas as $item) {
            if (! is_array($item) || empty($item['id']) || ! isset($tratamientos[$item['treatmentId'] ?? ''])) continue;
            $idCliente = substr((string) $item['id'], 0, 100);
            $programadaEn = $this->fechaHora($item['scheduledAt'] ?? null);
            $mismaToma = $model->withDeleted()
                ->where('usuario_id', $usuarioId)
                ->where('tratamiento_id', $tratamientos[$item['treatmentId']])
                ->where('programada_en', $programadaEn)
                ->first();
            if (is_array($mismaToma)) $idCliente = $mismaToma['id_cliente'];
            if (in_array($idCliente, $ids, true)) continue;
            $ids[] = $idCliente;
            $estado = in_array($item['status'] ?? '', ['pending', 'taken', 'postponed', 'skipped', 'missed'], true) ? $item['status'] : 'pending';
            $this->guardarSincronizable($model, $usuarioId, $idCliente, [
                'tratamiento_id' => $tratamientos[$item['treatmentId']],
                'programada_en' => $programadaEn,
                'estado' => $estado,
                'registrada_en' => $this->fechaHora($item['recordedAt'] ?? null, true),
                'nota' => $this->textoOpcional($item['note'] ?? null),
            ]);
        }
        $this->eliminarAusentes($model, $usuarioId, $ids);
    }

    private function guardarConfiguracionBilletera(int $usuarioId, array $item): void
    {
        $model = new ConfiguracionBilleteraModel();
        $datos = [
            'usuario_id' => $usuarioId,
            'monto_sueldo' => max(0, (float) ($item['salaryAmount'] ?? 0)),
            'periodicidad_pago' => ($item['paySchedule'] ?? '') === 'biweekly' ? 'catorcenal' : 'quincenal',
            'primera_fecha_pago' => $this->fecha($item['firstPayDate'] ?? null),
            'moneda' => 'MXN',
        ];
        $model->find($usuarioId) ? $model->update($usuarioId, $datos) : $model->insert($datos);
    }

    private function sincronizarGastos(int $usuarioId, array $entradas): array
    {
        $model = new GastoFijoModel();
        $ids = [];
        $mapa = [];
        foreach ($entradas as $item) {
            if (! is_array($item) || empty($item['id'])) continue;
            $idCliente = substr((string) $item['id'], 0, 100);
            $ids[] = $idCliente;
            $guardado = $this->guardarSincronizable($model, $usuarioId, $idCliente, [
                'nombre' => substr(trim((string) ($item['name'] ?? '')), 0, 150),
                'monto' => max(0, (float) ($item['amount'] ?? 0)),
                'categoria' => substr((string) ($item['category'] ?? 'Otros'), 0, 80),
                'dia_vencimiento' => min(31, max(1, (int) ($item['dueDay'] ?? 1))),
                'frecuencia_meses' => (int) ($item['frequencyMonths'] ?? 1) === 2 ? 2 : 1,
                'primer_vencimiento' => $this->fecha($item['firstDueDate'] ?? null),
                'inicio_seguimiento' => $this->fecha($item['trackingStartDate'] ?? null),
                'hora_recordatorio' => $this->hora($item['reminderTime'] ?? null),
                'activo' => ($item['active'] ?? true) ? 1 : 0,
            ]);
            $mapa[$idCliente] = $guardado['id'];
        }
        $this->eliminarAusentes($model, $usuarioId, $ids);
        return $mapa;
    }

    private function sincronizarMovimientos(int $usuarioId, array $entradas, array $gastos): void
    {
        $model = new MovimientoBilleteraModel();
        $ids = [];
        foreach ($entradas as $item) {
            if (! is_array($item) || empty($item['id'])) continue;
            $idCliente = substr((string) $item['id'], 0, 100);
            $ids[] = $idCliente;
            $gastoCliente = $item['fixedExpenseId'] ?? null;
            $this->guardarSincronizable($model, $usuarioId, $idCliente, [
                'naturaleza' => ($item['kind'] ?? '') === 'income' ? 'ingreso' : 'gasto',
                'tipo' => ['extra-income' => 'ingreso_extra', 'fixed-expense' => 'gasto_fijo'][$item['type'] ?? ''] ?? 'gasto_variable',
                'descripcion' => substr(trim((string) ($item['description'] ?? '')), 0, 255),
                'monto' => max(0, (float) ($item['amount'] ?? 0)),
                'categoria' => substr((string) ($item['category'] ?? 'Otros'), 0, 80),
                'fecha' => $this->fecha($item['date'] ?? null),
                'gasto_fijo_id' => is_string($gastoCliente) ? ($gastos[$gastoCliente] ?? null) : null,
                'periodo_gasto_fijo' => $this->textoOpcional($item['fixedPeriod'] ?? null, 7),
            ]);
        }
        $this->eliminarAusentes($model, $usuarioId, $ids);
    }

    private function guardarPreferencias(int $usuarioId, array $item): void
    {
        $model = new PreferenciaUsuarioModel();
        $datos = ['usuario_id' => $usuarioId, 'modo_avanzado' => ! empty($item['advancedMode']) ? 1 : 0, 'bienestar_activo' => ! empty($item['wellnessEnabled']) ? 1 : 0];
        $model->find($usuarioId) ? $model->update($usuarioId, $datos) : $model->insert($datos);
    }

    private function guardarSincronizable(Model $model, int $usuarioId, string $idCliente, array $datos): array
    {
        $existente = $model->withDeleted()->where('usuario_id', $usuarioId)->where('id_cliente', $idCliente)->first();
        $registro = [...$datos, 'usuario_id' => $usuarioId, 'id_cliente' => $idCliente, 'eliminado_en' => null, 'version' => is_array($existente) ? (int) $existente['version'] + 1 : 1];
        if (is_array($existente)) {
            $model->update($existente['id'], $registro);
            return [...$existente, ...$registro];
        }
        $registro['id'] = Uuid::v4();
        $model->insert($registro);
        return $registro;
    }

    private function eliminarAusentes(Model $model, int $usuarioId, array $ids): void
    {
        foreach ($model->where('usuario_id', $usuarioId)->findAll() as $existente) {
            if (! in_array($existente['id_cliente'], $ids, true)) $model->delete($existente['id']);
        }
    }

    private function formatearTratamiento(array $item): array
    {
        return [
            'id' => $item['id_cliente'], 'nombre_tratamiento' => $item['nombre_tratamiento'], 'nombre_medicamento' => $item['nombre_medicamento'],
            'dosis' => $item['dosis'], 'indicaciones' => $item['indicaciones'], 'fecha_inicio' => $item['fecha_inicio'], 'fecha_fin' => $item['fecha_fin'],
            'continuo' => (bool) $item['continuo'], 'dias_programados' => json_decode($item['dias_programados'] ?: '[]', true) ?: [],
            'horas_programadas' => json_decode($item['horas_programadas'] ?: '[]', true) ?: [], 'color' => $item['color'],
            'seguimiento_estricto' => (bool) $item['seguimiento_estricto'], 'inventario_activo' => (bool) $item['inventario_activo'],
            'cantidad_inventario' => (float) $item['cantidad_inventario'], 'unidades_por_toma' => (float) $item['unidades_por_toma'],
            'unidad_inventario' => $item['unidad_inventario'], 'umbral_inventario_bajo' => (float) $item['umbral_inventario_bajo'],
            'estado' => $item['estado'], 'creado_en' => $item['creado_en'], 'actualizado_en' => $item['actualizado_en'],
        ];
    }

    private function fecha(mixed $valor, bool $opcional = false): ?string
    {
        $texto = substr(trim((string) $valor), 0, 10);
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $texto)) return $texto;
        return $opcional ? null : date('Y-m-d');
    }

    private function fechaHora(mixed $valor, bool $opcional = false): ?string
    {
        $texto = trim((string) $valor);
        if ($texto === '') return $opcional ? null : date('Y-m-d H:i:s');
        $tiempo = strtotime($texto);
        return $tiempo === false ? ($opcional ? null : date('Y-m-d H:i:s')) : date('Y-m-d H:i:s', $tiempo);
    }

    private function hora(mixed $valor): string
    {
        $texto = trim((string) $valor);
        return preg_match('/^([01]\d|2[0-3]):[0-5]\d/', $texto) ? substr($texto, 0, 5) . ':00' : '09:00:00';
    }

    private function textoOpcional(mixed $valor, ?int $limite = null): ?string
    {
        $texto = trim((string) $valor);
        if ($texto === '') return null;
        return $limite ? substr($texto, 0, $limite) : $texto;
    }

    private function entradaJson(): ?array
    {
        try {
            $entrada = $this->request->getJSON(true);
            return is_array($entrada) ? $entrada : null;
        } catch (Throwable) {
            return null;
        }
    }

    private function fechaConsulta(mixed $valor): ?string
    {
        $texto = trim((string) $valor);
        return preg_match('/^\d{4}-\d{2}-\d{2}$/', $texto) ? $texto : null;
    }

    private function respuestaPrivada(array $datos): ResponseInterface
    {
        return $this->respond($datos)
            ->setHeader('Cache-Control', 'no-store, private, max-age=0')
            ->setHeader('Pragma', 'no-cache');
    }

    private function usuarioId(): int
    {
        return (int) auth('tokens')->user()->id;
    }
}
