<?php

declare(strict_types=1);

namespace App\Models;

use CodeIgniter\Model;

abstract class ModeloSincronizable extends Model
{
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = false;
    protected $returnType       = 'array';
    protected $useSoftDeletes   = true;
    protected $protectFields    = true;
    protected $useTimestamps    = true;
    protected $dateFormat       = 'datetime';
    protected $createdField     = 'creado_en';
    protected $updatedField     = 'actualizado_en';
    protected $deletedField     = 'eliminado_en';
}
