<?php

declare(strict_types=1);

namespace App\Models;

use CodeIgniter\Model;

final class HorarioRutinaModel extends Model
{
    protected $table         = 'horarios_rutina';
    protected $returnType    = 'array';
    protected $useTimestamps = true;
    protected $createdField  = 'creado_en';
    protected $updatedField  = 'actualizado_en';
    protected $allowedFields = [
        'rutina_id',
        'dia_semana',
        'hora_inicio',
        'hora_fin',
    ];
}
