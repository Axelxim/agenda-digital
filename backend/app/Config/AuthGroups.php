<?php

declare(strict_types=1);

namespace Config;

use CodeIgniter\Shield\Config\AuthGroups as ShieldAuthGroups;

class AuthGroups extends ShieldAuthGroups
{
    public string $defaultGroup = 'user';

    public array $groups = [
        'admin' => [
            'title'       => 'Administrador',
            'description' => 'Administra la plataforma.',
        ],
        'user' => [
            'title'       => 'Usuario',
            'description' => 'Usa y sincroniza su agenda personal.',
        ],
    ];

    public array $permissions = [
        'admin.access' => 'Acceder a la administracion de la plataforma.',
    ];

    public array $matrix = [
        'admin' => ['admin.access'],
        'user'  => [],
    ];
}
