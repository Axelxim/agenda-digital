<?php

declare(strict_types=1);

namespace App\Models;

use CodeIgniter\Model;

final class IntegracionGoogleCalendarModel extends Model
{
    protected $table = 'integraciones_google_calendar';
    protected $primaryKey = 'usuario_id';
    protected $returnType = 'array';
    protected $useTimestamps = true;
    protected $createdField = 'creado_en';
    protected $updatedField = 'actualizado_en';
    protected $allowedFields = [
        'usuario_id',
        'token_cifrado',
        'estado_hash',
        'estado_expira_en',
        'calendarios_seleccionados',
        'conectado_en',
    ];
}
