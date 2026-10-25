<?php

declare(strict_types=1);

namespace App\Controllers\Api;

use CodeIgniter\HTTP\ResponseInterface;

final class NotasController extends DatosPersonalesController
{
    public function listar(): ResponseInterface
    {
        return parent::listarNotas();
    }

    public function sincronizar(): ResponseInterface
    {
        return parent::sincronizarNotasModulo();
    }
}
