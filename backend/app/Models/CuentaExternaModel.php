<?php

declare(strict_types=1);

namespace App\Models;

use CodeIgniter\Model;

final class CuentaExternaModel extends Model
{
    protected $table = 'cuentas_externas';
    protected $returnType = 'array';
    protected $useTimestamps = true;
    protected $createdField = 'creado_en';
    protected $updatedField = 'actualizado_en';
    protected $allowedFields = ['usuario_id', 'proveedor', 'proveedor_id', 'correo'];
}
