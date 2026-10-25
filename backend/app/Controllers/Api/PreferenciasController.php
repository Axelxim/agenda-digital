<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use CodeIgniter\HTTP\ResponseInterface;

final class PreferenciasController extends DatosPersonalesController
{
    public function listar(): ResponseInterface
    {
        return parent::listarPreferencias();
    }

    public function actualizar(): ResponseInterface
    {
        return parent::sincronizarPreferencias();
    }
}
