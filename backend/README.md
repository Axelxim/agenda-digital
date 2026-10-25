# API de Todo en Orden

Backend REST de la agenda, construido con CodeIgniter 4 y preparado para MySQL.

## Desarrollo local

1. Copia `.env.example` como `.env` y configura la base de datos local.
2. Instala las dependencias con `composer install`.
3. Inicia la API con `php spark serve`.
4. Comprueba `GET http://localhost:8080/api/v1/health`.

## Pruebas

Ejecuta `composer test` desde esta carpeta.

## Seguridad

El archivo `.env` no se guarda en Git. Las credenciales de MySQL solo deben existir en el servidor; las aplicaciones Android, web y Windows consumirán la API por HTTPS.
