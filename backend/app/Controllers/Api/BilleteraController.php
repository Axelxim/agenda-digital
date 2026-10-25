<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use CodeIgniter\HTTP\ResponseInterface;

final class BilleteraController extends DatosPersonalesController
{
    public function listar(): ResponseInterface
    {
        return parent::listarBilletera();
    }

    public function sincronizar(): ResponseInterface
    {
        return parent::sincronizarBilletera();
    }
}
