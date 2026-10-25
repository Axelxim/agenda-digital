<?php

declare(strict_types=1);

namespace App\Models;

use CodeIgniter\Model;

final class ConfiguracionBilleteraModel extends Model
{
    protected $table            = 'configuracion_billetera';
    protected $primaryKey       = 'usuario_id';
    protected $useAutoIncrement = false;
    protected $returnType       = 'array';
    protected $useTimestamps    = true;
    protected $createdField     = 'creado_en';
    protected $updatedField     = 'actualizado_en';
    protected $allowedFields    = [
        'usuario_id',
        'monto_sueldo',
        'periodicidad_pago',
        'primera_fecha_pago',
        'moneda',
        'version',
    ];
}
