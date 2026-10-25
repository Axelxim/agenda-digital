<?php

declare(strict_types=1);

namespace Config;

use CodeIgniter\Shield\Config\AuthToken as ShieldAuthToken;

class AuthToken extends ShieldAuthToken
{
    public int $unusedTokenLifetime = YEAR;
}
