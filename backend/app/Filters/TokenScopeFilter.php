<?php

declare(strict_types=1);

namespace App\Filters;

use CodeIgniter\HTTP\RequestInterface;
use CodeIgniter\HTTP\ResponseInterface;
use CodeIgniter\Filters\FilterInterface;

final class TokenScopeFilter implements FilterInterface
{
    public function before(RequestInterface $request, $arguments = null): ?ResponseInterface
    {
        $usuario = auth('tokens')->user();
        $alcances = is_array($arguments) ? $arguments : [];
        if ($usuario !== null && ($alcances === [] || array_reduce(
            $alcances,
            static fn (bool $permitido, string $alcance): bool => $permitido || $usuario->tokenCan($alcance),
            false,
        ))) {
            return null;
        }

        return service('response')->setStatusCode(403)->setJSON([
            'status' => 403,
            'error' => 403,
            'messages' => ['scope' => 'El dispositivo no tiene permiso para sincronizar estos datos.'],
        ]);
    }

    public function after(RequestInterface $request, ResponseInterface $response, $arguments = null): void
    {
    }
}
