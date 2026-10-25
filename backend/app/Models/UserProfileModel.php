<?php

declare(strict_types=1);

namespace App\Models;

use CodeIgniter\Model;

final class UserProfileModel extends Model
{
    protected $table         = 'user_profiles';
    protected $primaryKey    = 'user_id';
    protected $returnType    = 'array';
    protected $useTimestamps = true;
    protected $allowedFields = [
        'user_id',
        'uuid',
        'display_name',
        'avatar_url',
        'locale',
        'timezone',
    ];
}
