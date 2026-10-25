# API de usuarios

Base: `/api/v1/auth`

Todas las solicitudes y respuestas usan `Content-Type: application/json`.

## Registrar una cuenta

`POST /register`

```json
{
  "name": "Nombre de la persona",
  "email": "persona@ejemplo.com",
  "password": "una-contrasena-segura",
  "password_confirmation": "una-contrasena-segura",
  "device_name": "Android - com.todoenorden.app"
}
```

## Iniciar sesion

`POST /login`

```json
{
  "email": "persona@ejemplo.com",
  "password": "una-contrasena-segura",
  "device_name": "PC de casa"
}
```

El registro y el inicio de sesion regresan el usuario y un token que solo se muestra al crearlo:

```json
{
  "data": {
    "user": {
      "id": "00000000-0000-4000-8000-000000000000",
      "name": "Nombre de la persona",
      "email": "persona@ejemplo.com",
      "locale": "es-MX",
      "timezone": "America/Mexico_City"
    },
    "token": "token-sin-cifrar",
    "token_type": "Bearer"
  }
}
```

## Rutas protegidas

Enviar el token en cada solicitud:

```http
Authorization: Bearer token-sin-cifrar
```

- `GET /me`: devuelve el perfil actual.
- `PATCH /me`: permite cambiar `name`, `locale` o `timezone`.
- `POST /logout`: revoca el token del dispositivo actual.
- `POST /logout-all`: revoca todos los tokens de la cuenta.

Los tokens se guardan mediante Shield como hashes SHA-256. La API nunca puede recuperar un token anterior en texto plano.
