<?php

declare(strict_types=1);

namespace App\Models;

final class MovimientoBilleteraModel extends ModeloSincronizable
{
    protected $table = 'movimientos_billetera';

    protected $allowedFields = [
        'id',
        'usuario_id',
        'id_cliente',
        'naturaleza',
        'tipo',
        'descripcion',
        'monto',
        'categoria',
        'fecha',
        'gasto_fijo_id',
        'periodo_gasto_fijo',
        'version',
        'eliminado_en',
    ];
}
