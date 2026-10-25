<?php

declare(strict_types=1);

namespace App\Models;

final class RutinaModel extends ModeloSincronizable
{
    protected $table = 'rutinas';

    protected $allowedFields = [
        'id',
        'usuario_id',
        'id_cliente',
        'nombre',
        'color',
        'hora_inicio_predeterminada',
        'hora_fin_predeterminada',
        'activa',
        'version',
        'eliminado_en',
    ];
}
