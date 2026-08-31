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

### Corrección de reapertura del modelo

- El parámetro `alumnoId` recibido desde la pantalla Hoy ahora se consume una
  sola vez después de abrir el modelo de esa persona.
- Mover una clase, marcar un feriado, deshacerlo o volver al calendario ya no
  vuelve a abrir automáticamente el modelo del último contacto consultado.

### Preparación de la versión 1.0.3

- La versión pública de la aplicación se actualizó a `1.0.3` y el código de
  compilación Android a `4`, listo para generar un nuevo AAB en Google Play.
- TypeScript, lint y las 28 pruebas automatizadas fueron verificados antes de
  preparar la compilación.
- En esta etapa no se generó ni publicó el AAB.

### Corrección del empaquetado AAB en Windows

- El script `build-aab.ps1` ahora ejecuta EAS en modo sin VCS sobre su copia de
  preparación, evitando el clon temporal que podía fallar con `EPERM` dentro de
  `AppData\Local\Temp`.
- La variable `EAS_NO_VCS` se restaura al finalizar, incluso si la compilación
  falla, para no modificar permanentemente la terminal del usuario.
- La consulta del AAB terminado se ejecuta nuevamente desde el repositorio real
  y con el entorno restaurado, evitando que los avisos del modo sin VCS
  contaminen la respuesta JSON de Expo.

### Reajuste del patrón mensual

- El calendario permite elegir `Reajuste` junto a feriado y compromiso, usando
  el mismo selector de fecha y una confirmación específica.
- A diferencia de los otros motivos, el reajuste cambia desde la fecha elegida
  el turno habitual completo del grupo: primera/tercera o segunda/cuarta semana.
  Por ejemplo, `1/15 → 8/22` continúa como `13/27` el mes siguiente.
- La fecha elegida debe coincidir con el día de la semana del grupo y la función
  solo está disponible para grupos de dos clases por mes.
- El tipo `reajuste` tiene etiquetas y colores propios en el mes, el detalle del
  día y la agenda de próximas clases.
- El cambio de patrón, la regeneración de la agenda y su historial se guardan en
  una sola transacción. Si un alumno tiene un conflicto no se aplica ningún
  cambio parcial y se informa el problema.
- Al reajustar o deshacer se conservan modelos, materiales, recuperaciones y
  movimientos manuales; tampoco se generan ausencias ni clases pendientes.
- La tabla `reajustes_grupo` permite restaurar el patrón anterior de forma
  segura. Si hubo un cambio posterior incompatible, el deshacer se cancela sin
  modificar la agenda.
- La tabla `feriados` se migra de forma transaccional para aceptar el nuevo tipo
  sin perder feriados ni compromisos existentes.
- Las copias usan el formato 3 para incluir el historial, y siguen aceptando los
  formatos 1 y 2 anteriores.
- Las pruebas cubren ambos turnos mensuales, continuidad, reversión, conflictos,
  pendientes, datos asignados, migración SQLite y copia/restauración.

### Reajustes con filas canceladas

- `Reajuste` diferencia una clase activa de una fila cancelada invisible. Las
  canceladas que ocupan una nueva fecha se archivan dentro de la transacción,
  conservando su identificador, referencias e historial.
- Al deshacer el reajuste, esas filas canceladas recuperan su fecha original. Un
  conflicto activo real continúa cancelando toda la operación.

### Confirmación visible de Reajuste

- `Reajuste` continúa apareciendo junto a `Feriado` y `Compromiso`, sin nuevas
  condiciones ni filtros.
- Después de elegir la nueva fecha se guarda temporalmente la operación y se
  mantiene oculto el detalle del día mientras se muestra una confirmación propia.
- Cancelar vuelve al detalle original sin aplicar cambios. Confirmar reutiliza la
  operación de reajuste existente, reprograma notificaciones y recarga el mes.
- Durante el guardado los botones quedan deshabilitados y un bloqueo inmediato
  evita ejecutar dos veces el reajuste por un doble toque.
- Ante un error la confirmación permanece abierta y permite reintentar o cancelar.

### Calendario mensual compartible

- La cabecera del calendario incorpora un botón para generar un PNG del mes
  visible y compartirlo con el menú nativo de Android, incluido WhatsApp.
- La imagen utiliza un componente separado y solamente recibe grupos activos:
  no contiene alumnos, vacantes, modelos, movimientos, ausencias ni controles.
- Las fechas se calculan con la regla habitual del grupo. Los semanales aparecen
  cada semana y los de dos veces por mes respetan el turno actualmente guardado,
  omitiendo la quinta aparición.
- La vista previa adapta la altura de las celdas a meses de cuatro, cinco o seis
  filas, admite varias cintas por día y agrega una leyenda de colores.
- El diseño compartible incluye el logo del taller, compacta la grilla mensual
  y destaca con mayor tamaño la leyenda de grupos, días y horarios.
- El archivo se crea temporalmente con un nombre como
  `calendario-septiembre-2026.png`, sin solicitar acceso a fotos o almacenamiento.
- Abrir la vista previa no inicia el menú externo. Compartir requiere tocar el
  botón y solo se habilita después del layout y de que el logo termine de cargar.
- La altura de todas las fechas crece según el día con más grupos, de modo que
  ninguna cinta se omite, se superpone o invade la fila siguiente.

### Selector de motivo de movimiento

- Se reemplazó la pregunta nativa de Android por una ventana propia con las
  opciones Feriado, Compromiso y Reajuste en vertical.
- La ventana se puede cerrar sin elegir mediante la X, el botón Volver, el fondo
  oscuro o el botón Atrás de Android.
- Al elegir un motivo se abre el selector de fecha existente. No se modificaron
  repositorios ni reglas de fechas, pendientes o movimientos.

### Logo y calendario compartible

- El logo de la aplicación ahora muestra correctamente “Menudo Cerámica”.
- La vista previa permite desmarcar grupos para excluirlos tanto del calendario
  compartido como de su leyenda.
- El botón Compartir respeta el área segura inferior de Android y ya no queda
  detrás de los botones de navegación del teléfono.

### Compilación Android local

- Se agregó `npm run build:aab:local` para generar el AAB firmado sin consumir
  compilaciones mensuales de EAS.
- El comando usa el JDK de Android Studio, el Android SDK local y las credenciales
  descargadas desde EAS, sin guardar contraseñas en el repositorio.
- `credentials.json` y las claves `.jks` permanecen excluidos de Git.
## Movimientos cuando hay varios grupos el mismo día

- Al tocar una fecha con dos o más grupos, primero se elige cuál se quiere ver.
- El detalle muestra únicamente las personas del grupo seleccionado.
- Feriado, Compromiso y Reajuste se guardan por fecha y grupo, por lo que mover uno no modifica al resto.
- Se puede volver al selector desde el detalle para revisar otro grupo del mismo día.
- Las copias anteriores siguen siendo compatibles; sus movimientos de día completo se restauran como registros generales.

### Reajuste hacia una fecha anterior

- Un grupo de dos veces por mes ahora puede reajustarse tanto hacia una fecha
  posterior como hacia una fecha anterior, siempre dentro de fechas futuras.
- Por ejemplo, el turno 08/09 y 22/09 puede reajustarse al 01/09 para continuar
  el 15/09 y mantener desde allí el patrón de primera y tercera semana.
- La fecha debe ser distinta, coincidir con el día semanal del grupo y no puede
  estar ocupada por otra clase del alumno.
- El cambio conserva su transacción, historial y opción de deshacer. Ante un
  conflicto no se modifica ninguna clase parcialmente.
- En el mes de transición se cuentan las clases habituales que ya quedaron
  antes de la fecha reajustada. Así, al mover 20/10 al 13/10 y conservar la
  clase del 06/10, no se genera una tercera clase el 27/10.
- Las personas agregadas a esa clase como recuperación también se trasladan a
  la nueva fecha, conservando modelo, materiales y movimientos de pendientes.
  Al deshacer el reajuste vuelven a la fecha original.

### Limpieza del calendario al eliminar grupos

- Al eliminar un grupo se quitan del calendario sus marcas de Reajuste,
  Feriado y Compromiso.
- Las marcas generales y las pertenecientes a otros grupos no se modifican.
- Los movimientos antiguos vinculados a grupos que ya estaban eliminados
  también dejan de mostrarse al actualizar la aplicación.
- Los reajustes creados por versiones anteriores como movimientos generales
  se vinculan con su historial; si el grupo ya no está activo, tampoco se
  muestran como cuadros sueltos sin cinta de color.
# Corrección de la transición mensual del reajuste

- Un reajuste hacia una fecha anterior del mismo mes conserva como máximo las dos clases reales de ese mes. Por ejemplo, al mover el 15 al 8 se mantienen el 1 y el 8, sin crear el 22.
- La generación incremental consulta también las clases anteriores del mes para no volver a crear una tercera fecha al abrir nuevamente la aplicación.
- Se repara una agenda ya afectada cancelando la tercera fecha incorrecta y las vistas dejan de mostrar grupos teóricos vacíos con cantidad 0.
# Calendario limpio y modelos múltiples

- El calendario mensual deja de colorear o rotular los días con “Feriado”, “Compromiso” o “Reajuste”.
- Un grupo movido ya no se abre desde la fecha original. En la fecha de destino, al final de su detalle, aparece **Deshacer cambio** para restaurarlo.
- Cada persona puede tener varios modelos asignados en una misma clase. El selector permite marcar o desmarcar todas las opciones necesarias.
- Los modelos múltiples se incluyen en la preparación de la clase, las notificaciones y las copias de seguridad.
- Los modelos únicos guardados por versiones anteriores se migran automáticamente sin perder información.
# Pagos mensuales de alumnos

- El control de pagos se guarda por alumno y por mes, conservando el historial.
- En Alumnos se muestra un aviso con la cantidad de personas que todavía no pagaron.
- Se agregó el filtro **No pagaron**, junto al filtro de pendientes.
- Cada pago permite registrar cuota paga o impaga y si corresponde a 2 o 4 clases.
- Las copias de seguridad incluyen el historial de pagos y siguen aceptando copias anteriores.

## Recordatorio de pagos y clases extra pagadas

- En **Alumnos** se puede activar o desactivar un recordatorio mensual y elegir
  el día (del 1 al 28) y la hora exacta del aviso.
- La notificación informa cuántos alumnos todavía no pagaron y muestra sus
  nombres. Al registrar un pago se reprograma para mantener la lista actualizada.
- Los créditos de clases extra pagadas de versiones anteriores se conservan en
  la base y en los respaldos, pero ya no se cargan ni se ofrecen desde la interfaz.
- La migración agrega los contadores sin perder pagos existentes y las copias de
  seguridad anteriores continúan restaurándose con cero extras utilizadas.
- La pantalla de Alumnos permite alternar entre **Este mes** y **Mes siguiente**,
  para registrar por adelantado un pago recibido durante los últimos días del mes.
- El formulario de pago ya no muestra importes, tarifas ni clases extra; solamente
  registra el estado y la cantidad de clases mensuales pagadas.

## Cierre mensual y extras a cobrar

- Al comenzar un mes nuevo, las clases de una cuota paga que no llegaron a
  utilizarse en el mes anterior se suman automáticamente como pendientes.
- El cierre es idempotente: volver a abrir la aplicación no duplica el saldo y
  una ausencia que ya generó un pendiente no vuelve a contarse.
- Al agregar una persona a una fecha se puede elegir **Clase extra a cobrar**.
  La persona queda programada sin consumir un crédito de extra pagada.
- La clase se identifica en Hoy, en el detalle del calendario y en Alumnos. El
  filtro **Extras a cobrar** permite encontrar rápidamente a quienes las deben.
- La cuota mensual registra solamente si pagó y si corresponde a 2 o 4 clases;
  ya no permite cargar clases extra por adelantado.
- Las copias de seguridad conservan este estado y siguen aceptando copias de
  versiones anteriores.

## Preparación de la versión 1.0.10

- La versión pública se actualizó a `1.0.10` con `versionCode` 11 para Google Play.
- La versión de Expo y la configuración nativa de Android quedaron sincronizadas
  para generar el mismo AAB tanto con EAS como con la compilación local.
- Las compilaciones remotas regeneran Android desde `app.json` y la compilación
  local ejecuta Prebuild antes de Gradle, evitando versiones, íconos o permisos
  nativos desactualizados.
- El flujo visible de extras queda unificado en **Agregar persona > Clase extra a
  cobrar**. Se retiraron la carga de extras desde Pago, el uso de extras pagadas y
  su filtro del selector.
- Los créditos antiguos se conservan internamente para no perder datos al actualizar
  o restaurar copias de seguridad, pero no pueden cargarse ni consumirse desde la interfaz.
- Las clases extra ya agendadas como **a cobrar** pueden saldarse junto con la
  cuota mensual o por separado mediante **Cobrar solo extras**. Cobrar una deuda
  no crea créditos de extras para fechas futuras ni altera la cuota cuando se usa
  la acción separada.
# Pendientes y cobros de clases extra

- Una clase extra ya pagada que luego se marca como **No viene** queda registrada como una **extra a favor** del alumno.
- Si una clase extra ya pagada se quita de la fecha, también queda como **extra a favor**, aunque se haya cobrado sola y no junto con la cuota.
- Las clases extra a cobrar que finalmente no se usan dejan de aparecer como deuda mientras están marcadas como ausencia.
- Al agregar una persona a una fecha se puede elegir **Recupera una clase extra pendiente**, separada de las recuperaciones habituales.
- En **Alumnos**, el filtro **Con pendientes** permite separar clases habituales y extras a favor.
- El filtro **No pagaron** permite separar cuotas mensuales y extras a cobrar.
- Los respaldos guardan esta distinción y las copias anteriores continúan siendo compatibles.

## Preparación de la versión 1.0.11

- La versión pública se actualizó a `1.0.11` con `versionCode` 12 para Google Play.
- En Alumnos se reorganizaron las acciones: editar queda arriba, cargar pendientes
  junto al nombre y los pagos en la zona inferior de la tarjeta.
- Los saldos de clases habituales y extras a favor se muestran juntos debajo del
  nombre para identificar rápidamente lo que el taller debe a cada alumno.
- Una clase extra pagada que se cancela conserva el crédito a favor, incluso si
  se había cobrado por separado.
