# API de Todo en Orden

Base local: `http://127.0.0.1:8080/api/v1`

Salvo autenticación, salud y el callback OAuth, las rutas requieren:

```http
Authorization: Bearer <token>
```

Las rutas de datos personales también exigen que el token tenga el alcance `sync`.
Bienestar, Billetera, Notas y Preferencias se entregan con `Cache-Control: no-store`.

## Agenda y rutinas

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/agenda` | Lista tareas y eventos |
| `POST` | `/agenda/sincronizar` | Sincroniza tareas y eventos |
| `GET` | `/rutinas` | Lista rutinas |
| `POST` | `/rutinas/sincronizar` | Sincroniza rutinas |

## Bienestar

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/bienestar/tratamientos` | Lista tratamientos y medicamentos |
| `GET` | `/bienestar/tomas` | Lista tomas; acepta `fecha`, `desde`, `hasta` y `tratamiento_id` |
| `PUT` | `/bienestar/sincronizar` | Sincroniza tratamientos y tomas |

Ejemplo: `/bienestar/tomas?fecha=2026-10-25`.

## Notas

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/notas` | Lista notas rápidas |
| `PUT` | `/notas/sincronizar` | Sincroniza notas rápidas |

## Billetera

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/billetera` | Obtiene configuración, gastos fijos y movimientos |
| `PUT` | `/billetera/sincronizar` | Sincroniza el estado de Billetera |

## Preferencias

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/preferencias` | Obtiene preferencias y recordatorios por etiqueta |
| `PUT` | `/preferencias` | Actualiza preferencias y recordatorios |

## Restauración completa

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/datos-personales` | Descarga inicial de todos los módulos |
| `PUT` | `/datos-personales` | Respaldo completo y reconciliación entre dispositivos |

Las pantallas deben utilizar sus endpoints modulares. `datos-personales` queda reservado
para la primera sincronización, recuperación de cuenta y respaldo completo.
