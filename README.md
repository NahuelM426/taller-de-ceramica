# Taller de Cerámica

Aplicación móvil para un taller de cerámica, creada con React Native, Expo 54,
Expo Router, TypeScript y SQLite.

## Ejecutar

```powershell
npm install
npx expo start
```

Después escaneá el QR con Expo Go o presioná `a` para abrir Android.

## Compilaciones Android

Para generar un APK instalable directamente:

```powershell
npm run build:apk
```

Para generar el Android App Bundle requerido por Google Play:

```powershell
npm run build:aab
```

El AAB se guarda como `Taller-de-Ceramica.aab`. La compilación se realiza en
Expo EAS y puede continuar en sus servidores aunque se cierre la terminal una
vez que el proyecto terminó de subirse.

Los textos, declaraciones, política y recursos gráficos de Google Play están
en `docs/google-play/` y `play-store/`.

## Funciones incluidas

- Personas con frecuencia semanal o cada 15 días.
- Grupos creados desde la vista mensual, por día, horario y cantidad de lugares.
- Edición de nombre, día, horario y capacidad de cada grupo.
- Recordatorios locales configurables por días y horas de anticipación.
- Cada aviso incluye quiénes vienen y las cantidades de modelos a preparar.
- Agenda individual generada desde una fecha inicial.
- Vista mensual con cintas de color por grupo y cantidad de personas.
- Edición manual de cada fecha: agregar, quitar o mover una persona.
- Feriados y días cerrados, con opción de mover a todos a otra fecha.
- Registro de ausencias que generan automáticamente una clase pendiente.
- Asignación de recuperaciones en otro grupo.
- Catálogo editable de modelos, sin cantidades ni control de stock.
- Elección del modelo que hará cada alumno en una fecha concreta.
- Resumen de modelos y materiales necesarios para preparar cada clase.
- Preparación resumida por cantidad: por ejemplo, `2 × Taza` y `1 × Cuenco`.
- Accesos directos desde Hoy a alumnos y próximas vacantes.
- Acceso desde el próximo grupo al día y grupo exactos en la vista mensual.
- Estado por persona: viene, no viene, modelo y materiales necesarios.
- Contador de clases pendientes con acceso directo al listado de alumnos.
- Datos persistentes en SQLite dentro del dispositivo.

## Arquitectura

- `models/`: entidades del dominio (`Alumno`, `Grupo`, `AgendaAlumno`,
  `Clase`, `Modelo`, `Molde` y `Feriado`).
- `repositories/`: operaciones de lectura y escritura separadas por entidad.
- `database/`: conexión SQLite, esquema, datos iniciales, migraciones y
  mantenimiento de la agenda recurrente.
- `lib/`: reglas de presentación, vacantes y notificaciones.
- `app/`: pantallas y navegación; no contiene consultas SQL.

`lib/db.ts` se conserva únicamente como fachada de compatibilidad. El código
nuevo debe importar el repositorio específico.

Los archivos `index.html`, `styles.css` y `app.js` corresponden únicamente a la
primera maqueta web y no participan de la aplicación Expo.
