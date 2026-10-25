<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use CodeIgniter\HTTP\ResponseInterface;

final class BienestarController extends DatosPersonalesController
{
    public function tratamientos(): ResponseInterface
    {
        return parent::listarTratamientos();
    }

    public function tomas(): ResponseInterface
    {
        return parent::listarTomas();
    }

    public function sincronizar(): ResponseInterface
    {
        return parent::sincronizarBienestar();
    }
}
