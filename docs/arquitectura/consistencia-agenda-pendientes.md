# Propuesta de consistencia de agenda y pendientes

Estado: primera etapa implementada el 7 de agosto de 2026.

La implementación conserva `clases` y `alumnos.pendientes` durante la etapa de
transición. Los cambios nuevos ya se registran en `movimientos_pendientes` y el
contador compatible se actualiza exclusivamente desde ese libro. El detalle de
lo incorporado está en [`docs/mejoras.md`](../mejoras.md).

Fecha del análisis: 7 de agosto de 2026.

## Conclusión

La aplicación no tiene actualmente una única fuente de verdad para las clases
pendientes. El saldo visible se guarda en `alumnos.pendientes`, parte del
historial se guarda en `clases` y la asistencia real se guarda en
`agenda_alumnos`.

La corrección propuesta es:

1. mantener `agenda_alumnos` como fuente de verdad del calendario y sus cupos;
2. reemplazar gradualmente `clases` por un libro de movimientos de pendientes;
3. calcular el saldo desde esos movimientos;
4. conservar temporalmente `alumnos.pendientes` solo como caché compatible,
   hasta que todas las pantallas consulten el saldo calculado.

No se recomienda intentar calcular los pendientes únicamente desde el estado
de la agenda: una clase habitual movida a otra fecha queda hoy como `ausente`
en su fecha original, pero correctamente no genera deuda.

## Responsabilidad actual de cada tabla

| Tabla | Uso actual | Problema |
| --- | --- | --- |
| `agenda_alumnos` | Fechas, grupo que ocupa, asistencia, modelo, coberturas y movimientos | El estado `ausente` puede significar ausencia real o clase trasladada |
| `clases` | Registros parciales de ausencias y recuperaciones | No representa todos los cambios y no tiene una relación directa con la fila de agenda |
| `alumnos.pendientes` | Saldo mostrado y editable manualmente | Es un contador mutable sin historial ni forma segura de reconstruirlo |

`claseRepository` no tiene consumidores en la interfaz actual. La tabla
`clases` funciona como estado interno auxiliar, no como historial visible.

## Invariantes que deben garantizarse

1. Marcar dos veces la misma ausencia debe generar como máximo un pendiente.
2. Revertir una ausencia debe revertir exactamente el movimiento que creó.
3. Asignar una recuperación debe consumir un pendiente una sola vez.
4. Quitar esa recuperación debe devolver exactamente ese pendiente.
5. Mover una clase para cubrir otra fecha no debe crear una deuda.
6. Cambiar de grupo debe liberar las fechas futuras del grupo anterior.
7. Cancelar una ausencia futura debe revertir su pendiente, pero nunca una
   deuda anterior legítima.
8. Un ajuste manual debe quedar registrado, no sobrescribir silenciosamente el
   saldo.
9. Toda operación debe actualizar agenda y pendientes dentro de una única
   transacción.

## Caminos actuales con riesgo de divergencia

### Cambio de grupo desde edición

`alumnoRepository.editar` resta las ausencias futuras y elimina las filas
regulares de `agenda_alumnos`, pero no elimina los registros de ausencia de
`clases`. `alumnoRepository.fijarEnGrupo` sí elimina esos registros. Dos caminos
para la misma acción dejan resultados distintos.

### Rearmado de un grupo

`rearmarAgendaRegularGrupo` resta ausencias futuras y regenera la agenda, pero
no limpia las ausencias equivalentes de `clases`.

### Eliminación de un grupo

La eliminación devuelve recuperaciones programadas y cancela la agenda, pero
no define explícitamente qué ocurre con ausencias regulares futuras que ya
sumaron pendientes.

### Reversión dependiente de una fila auxiliar

`revertirAusencia` cambia la agenda nuevamente a `programada`, pero solo resta
el pendiente si encuentra una fila coincidente en `clases`. Si esa fila falta,
la agenda se corrige y el saldo queda sin corregir.

### Ajustes manuales

`actualizarPendientes` reemplaza directamente el contador. Después de un ajuste
manual ya no existe una relación comprobable entre el saldo, `clases` y la
agenda.

### Migraciones de agenda

Las migraciones existentes corrigen fechas, grupos, estados y coberturas en
`agenda_alumnos`, sin una operación equivalente sobre `clases` o el contador.

## Modelo propuesto

Agregar una tabla append-only llamada `movimientos_pendientes`:

```sql
CREATE TABLE movimientos_pendientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alumno_id INTEGER NOT NULL,
  agenda_id INTEGER,
  delta INTEGER NOT NULL CHECK(delta != 0),
  tipo TEXT NOT NULL CHECK(tipo IN (
    'saldo_inicial',
    'ausencia',
    'recuperacion',
    'ajuste_manual',
    'reversion'
  )),
  clave TEXT NOT NULL UNIQUE,
  revierte_movimiento_id INTEGER UNIQUE,
  fecha TEXT NOT NULL,
  creado_en TEXT NOT NULL,
  FOREIGN KEY (alumno_id) REFERENCES alumnos(id),
  FOREIGN KEY (agenda_id) REFERENCES agenda_alumnos(id),
  FOREIGN KEY (revierte_movimiento_id) REFERENCES movimientos_pendientes(id)
);
```

Reglas del libro:

- ausencia real: `delta = +1`;
- recuperación asignada: `delta = -1`;
- quitar o revertir: nuevo movimiento opuesto con `tipo = 'reversion'`;
- ajuste manual: diferencia entre el saldo solicitado y el saldo actual;
- mover una clase: ningún movimiento;
- `clave` hace idempotente cada operación;
- una misma fila de agenda admite varios ciclos de cambio, por ejemplo
  `ausencia:agenda:123:ciclo:1` y `ausencia:agenda:123:ciclo:2`;
- cada reversión referencia por `revierte_movimiento_id` exactamente el
  movimiento que deshace.

El saldo se obtiene con:

```sql
SELECT COALESCE(SUM(delta), 0)
FROM movimientos_pendientes
WHERE alumno_id = ?;
```

La aplicación debe impedir una recuperación si el saldo calculado es menor que
uno. No debe corregir saldos negativos con `MAX(0, ...)`, porque eso ocultaría
un error de consistencia.

## Migración segura implementada

No es posible reconstruir con certeza el saldo actual usando `clases`: existen
ajustes manuales y caminos que pueden haber dejado filas desincronizadas. Para
no cambiar lo que ve la profesora:

1. crear `movimientos_pendientes` sin borrar columnas ni tablas;
2. insertar para cada alumno un único `saldo_inicial` cuyo `delta` sea el valor
   actual de `alumnos.pendientes`, si es mayor que cero;
3. empezar a escribir todos los cambios nuevos en el libro;
4. durante una versión, actualizar también `alumnos.pendientes` en la misma
   transacción y comprobar que coincide con `SUM(delta)`;
5. agregar una auditoría al iniciar que detenga la inicialización si encuentra
   diferencias, sin modificar datos silenciosamente;
6. cuando la versión haya sido validada con una copia real, dejar de escribir
   en `clases` y pasar las lecturas al saldo calculado;
7. conservar `clases` como `clases_legacy` durante al menos una versión de
   respaldo antes de retirarla.

## Consultas de auditoría previas

Duplicados en el historial auxiliar:

```sql
SELECT alumno_id, grupo_id, fecha, estado, COUNT(*) AS cantidad
FROM clases
GROUP BY alumno_id, grupo_id, fecha, estado
HAVING COUNT(*) > 1;
```

Ausencias auxiliares sin una ausencia equivalente en la agenda:

```sql
SELECT c.*
FROM clases c
LEFT JOIN agenda_alumnos ag
  ON ag.alumno_id = c.alumno_id
 AND ag.grupo_id = c.grupo_id
 AND ag.fecha = c.fecha
 AND ag.estado = 'ausente'
WHERE c.estado = 'ausente' AND ag.id IS NULL;
```

Referencias de cobertura u origen inexistentes, que `foreign_key_check` no
detecta porque esas columnas todavía no tienen claves foráneas declaradas:

```sql
SELECT ag.id, ag.cubre_agenda_id, ag.origen_agenda_id
FROM agenda_alumnos ag
LEFT JOIN agenda_alumnos cobertura ON cobertura.id = ag.cubre_agenda_id
LEFT JOIN agenda_alumnos origen ON origen.id = ag.origen_agenda_id
WHERE (ag.cubre_agenda_id IS NOT NULL AND cobertura.id IS NULL)
   OR (ag.origen_agenda_id IS NOT NULL AND origen.id IS NULL);
```

## Criterios verificados en la primera implementación

- las pruebas existentes y las nuevas continúan pasando (23 pruebas);
- se agregan pruebas de idempotencia y reversión del libro;
- una migración repetida no duplica movimientos;
- el saldo visible antes y después de migrar es idéntico para cada alumno;
- copia, restauración y deshacer incluyen la tabla nueva;
- una inconsistencia provoca un error visible de auditoría y nunca una
  corrección silenciosa;
- TypeScript y ESLint continúan sin errores;
- no se elimina `clases` ni `alumnos.pendientes` en la primera versión.
