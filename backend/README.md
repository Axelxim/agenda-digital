# API de Todo en Orden

Backend REST de la agenda, construido con CodeIgniter 4 y preparado para MySQL.

## Desarrollo local

1. Copia `.env.example` como `.env` y configura la base de datos local.
2. Instala las dependencias con `composer install`.
3. Inicia la API con `php spark serve`.
4. Comprueba `GET http://localhost:8080/api/v1/health`.

5. Crea las tablas con `php spark migrate --all`.

## Usuarios

La API usa CodeIgniter Shield y tokens Bearer revocables. Los endpoints disponibles son:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `PATCH /api/v1/auth/me`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/logout-all`

Consulta el contrato completo en `docs/auth-api.md`.

## Pruebas

Ejecuta `composer test` desde esta carpeta.

## Seguridad

El archivo `.env` no se guarda en Git. Las credenciales de MySQL solo deben existir en el servidor; las aplicaciones Android, web y Windows consumirán la API por HTTPS.
