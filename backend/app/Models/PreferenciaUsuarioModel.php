<?php

declare(strict_types=1);

namespace App\Models;

use CodeIgniter\Model;

final class PreferenciaUsuarioModel extends Model
{
    protected $table            = 'preferencias_usuario';
    protected $primaryKey       = 'usuario_id';
    protected $useAutoIncrement = false;
    protected $returnType       = 'array';
    protected $useTimestamps    = true;
    protected $createdField     = 'creado_en';
    protected $updatedField     = 'actualizado_en';
    protected $allowedFields    = ['usuario_id', 'modo_avanzado', 'bienestar_activo'];
}
