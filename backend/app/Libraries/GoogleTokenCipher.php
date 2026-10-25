<?php

declare(strict_types=1);

namespace App\Libraries;

use RuntimeException;

final class GoogleTokenCipher
{
    private const CIPHER = 'aes-256-gcm';
    private const CONTEXT = 'todo-en-orden/google-calendar/v1';

    public function encrypt(array $token, string $secret): string
    {
        $iv = random_bytes(12);
        $tag = '';
        $plain = json_encode($token, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
        $encrypted = openssl_encrypt(
            $plain,
            self::CIPHER,
            $this->key($secret),
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
            self::CONTEXT,
        );
        if (! is_string($encrypted)) {
            throw new RuntimeException('No fue posible proteger el token de Google.');
        }

        return base64_encode($iv . $tag . $encrypted);
    }

    public function decrypt(string $payload, string $secret): array
    {
        $decoded = base64_decode($payload, true);
        if (! is_string($decoded) || strlen($decoded) < 29) {
            throw new RuntimeException('El token de Google almacenado no es valido.');
        }
        $iv = substr($decoded, 0, 12);
        $tag = substr($decoded, 12, 16);
        $encrypted = substr($decoded, 28);
        $plain = openssl_decrypt(
            $encrypted,
            self::CIPHER,
            $this->key($secret),
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
            self::CONTEXT,
        );
        if (! is_string($plain)) {
            throw new RuntimeException('No fue posible abrir el token de Google.');
        }
        $token = json_decode($plain, true, 512, JSON_THROW_ON_ERROR);
        if (! is_array($token)) {
            throw new RuntimeException('El token de Google no tiene un formato valido.');
        }

        return $token;
    }

    private function key(string $secret): string
    {
        if ($secret === '' || $secret === 'PEGA_AQUI_EL_SECRETO') {
            throw new RuntimeException('El secreto de Google Calendar no esta configurado.');
        }

        return hash_hmac('sha256', self::CONTEXT, $secret, true);
    }
}
