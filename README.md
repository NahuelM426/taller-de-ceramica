# Taller de Cerámica

Aplicación móvil de gestión para talleres de cerámica, desarrollada para organizar alumnos, grupos, clases, recuperaciones, pagos y la preparación de modelos y materiales desde un único lugar.

## Capturas de la aplicación

<p align="center">
  <img src="./docs/screenshots/agenda.jpg" alt="Pantalla principal de agenda del taller" width="220" />
  <img src="./docs/screenshots/calendario.jpg" alt="Vista mensual del calendario del taller" width="220" />
  <img src="./docs/screenshots/alumnos.jpg" alt="Pantalla de alumnos y seguimiento de pagos" width="220" />
</p>

<p align="center">
  <img src="./docs/screenshots/modelos.jpg" alt="Catálogo de modelos de cerámica" width="220" />
  <img src="./docs/screenshots/compartir-calendario.jpg" alt="Vista previa para compartir el calendario del taller" width="220" />
</p>

## Sobre el proyecto

El objetivo de la aplicación es reemplazar anotaciones y controles dispersos por una herramienta móvil simple para la operación cotidiana de un taller.

Permite administrar grupos recurrentes, controlar asistencia, gestionar ausencias y recuperaciones, registrar el seguimiento de pagos, reorganizar clases por feriados o compromisos y anticipar qué modelos y materiales deben prepararse para cada encuentro.

Además, incorpora una vista para compartir el calendario mensual del taller y accesos rápidos para revisar vacantes y la agenda próxima.

## Funcionalidades principales

- Gestión de alumnos con frecuencia semanal o dos clases por mes.
- Creación y edición de grupos por día, horario y capacidad.
- Agenda general del taller con próximas clases y vacantes.
- Agenda individual generada automáticamente desde una fecha inicial.
- Vista mensual de clases y grupos con indicadores visuales.
- Registro de ausencias con generación automática de clases pendientes.
- Asignación de recuperaciones en otros grupos.
- Reprogramación de una clase individual por feriado o compromiso.
- Gestión de feriados y días cerrados con traslado de grupos completos.
- Reajuste del patrón futuro para grupos de dos clases por mes con historial y restauración segura.
- Seguimiento de pagos por alumno y recordatorios de cobro.
- Catálogo editable de modelos de cerámica.
- Elección del modelo que realizará cada alumno en una fecha concreta.
- Resumen automático de modelos y materiales necesarios para preparar cada clase.
- Recordatorios locales configurables por días y horas de anticipación.
- Accesos rápidos a alumnos, próximas vacantes y clases pendientes.
- Persistencia local de datos con SQLite.

## Tecnologías

- React Native
- Expo SDK 54
- Expo Router
- TypeScript
- SQLite
- Expo EAS para compilaciones Android

## Arquitectura

El proyecto separa responsabilidades para mantener la lógica de negocio y el acceso a datos fuera de las pantallas:

- `models/`: entidades del dominio como alumnos, grupos, clases, modelos y feriados.
- `repositories/`: operaciones de lectura y escritura por entidad.
- `database/`: conexión SQLite, esquema, migraciones y mantenimiento de agendas recurrentes.
- `lib/`: reglas de presentación, vacantes, pagos y notificaciones.
- `app/`: pantallas y navegación de la aplicación.

`lib/db.ts` se mantiene únicamente como fachada de compatibilidad; el código nuevo utiliza repositorios específicos.

## Decisiones de diseño

- Funcionamiento local para reducir dependencias externas.
- Persistencia SQLite dentro del dispositivo.
- Separación entre interfaz, reglas de negocio y acceso a datos.
- Gestión segura de cambios en agendas recurrentes mediante historial y restauración.
- Notificaciones orientadas a la operación real del taller.
- Interfaz pensada para uso rápido en el día a día del taller.

## Ejecutar el proyecto

```powershell
npm install
npx expo start
```

Luego se puede escanear el QR con Expo Go o presionar `a` para abrir Android.

## Compilaciones Android

APK instalable:

```powershell
npm run build:apk
```

Android App Bundle para Google Play:

```powershell
npm run build:aab
```

Los textos, declaraciones, política y recursos gráficos de Google Play se encuentran en `docs/google-play/` y `play-store/`.

## Estado

Proyecto funcional en desarrollo continuo, orientado a Android y preparado para distribución mediante Expo EAS / Google Play.
