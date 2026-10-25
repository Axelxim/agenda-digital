<?php

namespace App\Controllers\Api;

use App\Controllers\BaseController;
use CodeIgniter\HTTP\ResponseInterface;

final class HealthController extends BaseController
{
    public function index(): ResponseInterface
    {
        return $this->response->setJSON([
            'data' => [
                'status'    => 'ok',
                'service'   => 'todo-en-orden-api',
                'version'   => 'v1',
                'timestamp' => gmdate('c'),
            ],
        ]);
    }
}
