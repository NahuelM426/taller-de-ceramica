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

## 7 de agosto de 2026 - Rendimiento de agenda y SQLite

- Se agregaron índices para las búsquedas frecuentes por fecha, grupo, alumno,
  estado, cobertura, origen y movimientos de pendientes.
- Los índices se crean después de completar las columnas de instalaciones
  anteriores, evitando fallos durante una actualización.
- La generación periódica de agenda consulta una sola vez las fechas existentes
  de cada alumno y ejecuta inserciones únicamente para las fechas faltantes.
- Las clases canceladas, movidas o cargadas manualmente se conservan y no se
  reemplazan al completar el horizonte anual.
- Se agregaron pruebas para verificar los índices y la generación incremental.

## 7 de agosto de 2026 - Refactor gradual del calendario

- La grilla mensual, sus marcas de grupos, vacantes, feriados, navegación y
  animación se separaron en `components/calendario/CalendarioMes.tsx`.
- `app/(tabs)/calendario.tsx` conserva la carga de datos y las acciones de la
  pantalla, pero dejó de contener los detalles visuales de la grilla.
- El formulario de creación y edición de grupos se separó en
  `components/calendario/GrupoFormModal.tsx`, junto con sus campos, selectores,
  validaciones, recordatorios y confirmación de eliminación.
- El detalle de cada día se separó en
  `components/calendario/DetalleDiaModal.tsx`. Allí se presentan las personas,
  asistencia, modelos y acciones de agregar, quitar o mover, mientras la
  pantalla mantiene las operaciones y el acceso a datos.
- La carga mensual y el estado de agenda, alumnos, feriados, modelos y grupos se
  movieron a `hooks/useCalendarioData.ts`.
- La selección de personas, grupo de destino y ocupación del día quedó como
  lógica pura en `lib/calendario.ts`, con pruebas para días de uno o varios
  grupos.
- No se modificaron textos, colores, cálculos de cupos ni comportamiento visible.
