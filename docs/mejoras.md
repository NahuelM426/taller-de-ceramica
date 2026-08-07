# Mejoras de Taller de Cerámica

Este archivo registra cambios internos importantes de estabilidad. No reemplaza
las notas visibles de cada versión publicada.

## 7 de agosto de 2026 - Consistencia de clases pendientes

### Problema resuelto

El número de clases pendientes se modificaba desde distintos repositorios. La
agenda, la tabla auxiliar `clases` y `alumnos.pendientes` podían quedar con
valores diferentes después de revertir ausencias, cambiar un alumno de grupo,
rearmar un grupo o quitar una recuperación.

### Cambios realizados

- Se agregó `movimientos_pendientes`, un libro append-only que registra saldos
  iniciales, ausencias, recuperaciones, ajustes manuales y reversiones.
- Cada reversión apunta al movimiento exacto que deshace.
- Una misma clase admite varios ciclos de "no viene / viene" y de
  "usar / devolver recuperación" sin duplicar ni perder saldo.
- Las operaciones de agenda y saldo se realizan dentro de la misma transacción.
- Los cambios y eliminaciones de grupo limpian ausencias futuras y devuelven las
  recuperaciones canceladas sin tocar deudas anteriores legítimas.
- Al deshacer un feriado se revierte también la deuda de una ausencia que hubiera
  sido registrada en la fecha movida.
- Los ajustes manuales ahora dejan historial en lugar de sobrescribir solamente
  el contador.
- `alumnos.pendientes` se mantiene temporalmente como caché compatible, pero
  solamente el módulo central de pendientes puede actualizarlo.
- La inicialización audita que el caché coincida con la suma del libro y no
  corrige inconsistencias de manera silenciosa.

### Migración y copias de seguridad

- Al actualizar una instalación existente, el saldo visible de cada alumno se
  conserva como un único movimiento `saldo_inicial`. La migración es idempotente.
- El formato de copia de seguridad pasa a la versión 2 e incluye el libro de
  movimientos.
- Las copias de formato 1 siguen siendo aceptadas: durante la restauración se
  convierten a formato 2 creando el saldo inicial equivalente.
- Una copia con saldos inconsistentes se rechaza antes de reemplazar los datos.

### Compatibilidad de transición

Las tablas `clases` y la columna `alumnos.pendientes` no se eliminaron. Se
mantienen durante al menos una versión para reducir el riesgo de actualización
y permitir validar el cambio con datos reales antes de retirar el modelo
anterior.

### Verificación

- TypeScript: sin errores.
- ESLint: sin errores.
- Pruebas automatizadas: 23 aprobadas, incluyendo migración, idempotencia,
  ciclos de ausencia y recuperación, cambios de grupo, feriados y restauración
  de copias antiguas.

No se generó ni publicó una versión de producción como parte de este cambio.
