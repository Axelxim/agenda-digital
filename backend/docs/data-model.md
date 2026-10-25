# Modelo de datos de Todo en Orden

Todas las tablas funcionales pertenecen a un usuario mediante `usuario_id`. Los identificadores `id` son UUID públicos del servidor; `id_cliente` conserva el identificador con el que el registro nació en el teléfono.

Los registros sincronizables tienen `version`, `actualizado_en` y `eliminado_en`. Un elemento eliminado conserva temporalmente su fila con `eliminado_en` para que la eliminación pueda propagarse a otros dispositivos.

## Cuenta y preferencias

- `users`: cuenta base administrada por Shield.
- `user_profiles`: nombre, UUID público, idioma y zona horaria.
- `preferencias_usuario`: modo avanzado y activación de Bienestar.
- `recordatorios_etiqueta`: configuración de alarmas invasivas para cada etiqueta.

## Agenda

- `elementos_agenda`: tareas y eventos. Guarda fecha, horario, prioridad, estado, etiqueta y repetición.
- `subtareas`: pasos del modo avanzado asociados a una tarea.
- `rutinas`: definición de una actividad recurrente.
- `horarios_rutina`: días y horarios particulares de cada rutina.

Los cumpleaños y calendarios del dispositivo no se almacenan aquí: siguen perteneciendo al calendario de Android.

## Notas

- `notas_rapidas`: notas que después pueden convertirse en tarea o evento.

## Bienestar

- `tratamientos_medicamentos`: medicamento, tratamiento, horario, inventario y estado.
- `tomas_medicamentos`: cada toma generada y su estado: pendiente, tomada, pospuesta, omitida o perdida.

## Billetera

- `configuracion_billetera`: sueldo, periodicidad de pago y moneda.
- `gastos_fijos`: compromisos mensuales o bimestrales y sus recordatorios.
- `movimientos_billetera`: ingresos, gastos variables y pagos de gastos fijos.

## Relaciones principales

```text
users
 ├─ user_profiles
 ├─ preferencias_usuario
 ├─ recordatorios_etiqueta
 ├─ rutinas ───────────────── horarios_rutina
 ├─ elementos_agenda ──────── subtareas
 ├─ notas_rapidas
 ├─ tratamientos_medicamentos ── tomas_medicamentos
 ├─ configuracion_billetera
 ├─ gastos_fijos ──────────── movimientos_billetera
 └─ movimientos_billetera
```
