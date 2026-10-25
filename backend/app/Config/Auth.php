<?php

declare(strict_types=1);

namespace Config;

use CodeIgniter\Shield\Config\Auth as ShieldAuth;

class Auth extends ShieldAuth
{
    public string $defaultAuthenticator = 'tokens';

    public array $authenticationChain = ['tokens'];

    public array $validFields = ['email'];

    public bool $allowRegistration = true;

    public bool $allowMagicLinkLogins = false;
}
