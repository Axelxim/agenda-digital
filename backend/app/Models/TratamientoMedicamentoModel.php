<?php

declare(strict_types=1);

namespace App\Models;

final class TratamientoMedicamentoModel extends ModeloSincronizable
{
    protected $table = 'tratamientos_medicamentos';

    protected $allowedFields = [
        'id',
        'usuario_id',
        'id_cliente',
        'nombre_tratamiento',
        'nombre_medicamento',
        'dosis',
        'indicaciones',
        'fecha_inicio',
        'fecha_fin',
        'continuo',
        'dias_programados',
        'horas_programadas',
        'color',
        'seguimiento_estricto',
        'inventario_activo',
        'cantidad_inventario',
        'unidades_por_toma',
        'unidad_inventario',
        'umbral_inventario_bajo',
        'estado',
        'version',
        'eliminado_en',
    ];
}
