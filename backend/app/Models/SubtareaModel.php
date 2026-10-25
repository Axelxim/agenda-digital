<?php

declare(strict_types=1);

namespace App\Models;

final class SubtareaModel extends ModeloSincronizable
{
    protected $table = 'subtareas';

    protected $allowedFields = [
        'id',
        'elemento_agenda_id',
        'id_cliente',
        'titulo',
        'completada',
        'posicion',
        'version',
        'eliminado_en',
    ];
}
