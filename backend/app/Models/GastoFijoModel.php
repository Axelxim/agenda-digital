<?php

declare(strict_types=1);

namespace App\Models;

final class GastoFijoModel extends ModeloSincronizable
{
    protected $table = 'gastos_fijos';

    protected $allowedFields = [
        'id',
        'usuario_id',
        'id_cliente',
        'nombre',
        'monto',
        'categoria',
        'dia_vencimiento',
        'frecuencia_meses',
        'primer_vencimiento',
        'inicio_seguimiento',
        'hora_recordatorio',
        'activo',
        'version',
        'eliminado_en',
    ];
}
