# API de sincronización

Las rutas requieren el encabezado `Authorization: Bearer <token>` y solo trabajan con los registros del usuario autenticado.

## Descargar agenda

```http
GET /api/v1/agenda?desde=2026-10-25T10:00:00Z
```

Sin `desde`, devuelve la primera página de datos. Con `desde`, devuelve registros modificados o eliminados después de ese momento. La respuesta incluye `servidor_en`; ese valor puede guardarse como cursor para la siguiente consulta.

## Subir agenda

```http
POST /api/v1/agenda/sincronizar
Content-Type: application/json

{
  "elementos": [
    {
      "id_cliente": "uuid-del-telefono",
      "version_base": 0,
      "titulo": "Entregar proyecto",
      "tipo": "tarea",
      "fecha_programada": "2026-10-26",
      "hora_inicio": "12:00",
      "prioridad": "alta",
      "estado": "pendiente",
      "repeticion": "ninguna",
      "subtareas": []
    }
  ]
}
```

Para eliminar un registro se envían `id_cliente`, `version_base` y `eliminado: true`. Si `version_base` ya no coincide con el servidor, el registro aparece en `conflictos` y no se sobrescribe.

## Descargar rutinas

```http
GET /api/v1/rutinas?desde=2026-10-25T10:00:00Z
```

## Subir rutinas

```http
POST /api/v1/rutinas/sincronizar
Content-Type: application/json

{
  "rutinas": [
    {
      "id_cliente": "rutina-telefono-1",
      "version_base": 0,
      "nombre": "Gimnasio",
      "color": "#2563eb",
      "hora_inicio_predeterminada": "07:00",
      "hora_fin_predeterminada": "09:00",
      "activa": true,
      "horarios": [
        { "dia_semana": 1, "hora_inicio": "07:00", "hora_fin": "09:00" }
      ]
    }
  ]
}
```

`dia_semana` usa `0` para domingo y `6` para sábado, igual que la aplicación.
