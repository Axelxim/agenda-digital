<?php

declare(strict_types=1);

namespace App\Models;

use CodeIgniter\Model;

final class RecordatorioEtiquetaModel extends Model
{
    protected $table         = 'recordatorios_etiqueta';
    protected $returnType    = 'array';
    protected $useTimestamps = true;
    protected $createdField  = 'creado_en';
    protected $updatedField  = 'actualizado_en';
    protected $allowedFields = [
        'usuario_id',
        'etiqueta',
        'activo',
        'minutos_anticipacion',
        'aviso_al_vencer',
        'hora_sin_horario',
    ];
}
