# Próximos pasos en Google Play Console

## Mientras se verifica la cuenta

1. Esperar el correo de aprobación de identidad.
2. Verificar el teléfono de contacto.
3. Publicar `politica-privacidad.html` en una URL pública.
4. Tomar al menos dos capturas reales de la aplicación en un teléfono.

## Crear la aplicación

1. Crear una aplicación llamada **Taller de Cerámica**.
2. Elegir aplicación, idioma Español (Latinoamérica) y precio Gratis.
3. Confirmar que el paquete del primer AAB sea `com.nahuel.tallerdeceramica`.
4. Completar la ficha usando `ficha-play-store.md`.
5. Subir `icono-512.png`, `grafico-funciones-1024x500.png` y las capturas reales.
6. Completar contenido, clasificación, público, anuncios, acceso y privacidad.

## Primera prueba interna

1. Abrir **Pruebas > Prueba interna**.
2. Crear una versión y habilitar Play App Signing con una clave generada por Google.
3. Subir `Taller-de-Ceramica.aab`.
4. Agregar el Gmail de la profesora como verificadora.
5. Publicar la prueba y compartirle el enlace de instalación.

## Actualizaciones

Cada nuevo AAB debe usar un `android.versionCode` superior al anterior. La versión preparada actualmente es `1.0.2` con código `3`.

Antes de futuras publicaciones hay que revisar nuevamente Seguridad de datos si se agregan anuncios, analítica, sincronización, cuentas o cualquier servicio que transmita información fuera del dispositivo.
