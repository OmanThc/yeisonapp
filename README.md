# Control de Estacionamiento Residencial — Residencias Maroa (Estacionamiento II)

Aplicación web (PWA) para registrar comprobantes de Pago Móvil, consultar la ficha
de meses sellados por residente y conciliar pagos desde el panel de la junta.

Funciona como **página web** y como **app instalable** desde Chrome (computadora y celular).

## Archivos

| Archivo | Descripción |
|---|---|
| `index.html` | Aplicación completa (interfaz + lógica) |
| `manifest.json` | Archivo PWA: nombre, iconos, modo app |
| `sw.js` | Service Worker: permite abrir la app sin conexión |
| `icons/` | Iconos de la app (192px, 512px y maskable) |
| `vercel.json` | Encabezados de caché correctos para Vercel |

## Cómo usarla localmente

Basta con abrir `index.html` en el navegador (doble clic).
Los datos se guardan en el navegador (localStorage) y la contraseña de
administración por defecto es `123456`.

## Cómo publicarla (para que sea instalable desde Chrome)

Chrome solo permite "instalar" sitios publicados con **HTTPS**.

### Opción A — Vercel (recomendada, gratis)
1. Entra a <https://vercel.com/new> e inicia sesión con GitHub.
2. Arrastra la carpeta del proyecto (o importa el repositorio de GitHub).
3. Framework preset: **Other**. No hace falta ninguna configuración extra.
4. Pulsa **Deploy**. Al terminar tendrás una URL tipo `https://tuproyecto.vercel.app`.

### Opción B — GitHub Pages
1. Sube los archivos a un repositorio en GitHub.
2. En *Settings → Pages*, elige rama `main` y carpeta `/ (raíz)`.
3. La app queda en `https://tuusuario.github.io/nombre-repo/`.

### Opción C — Firebase Hosting
1. `npm i -g firebase-tools` y `firebase init` (selecciona *Hosting*, carpeta pública `.`, SPA: **No**).
2. Copia este contenido en la carpeta, luego `firebase deploy`.

## Cómo instalarla en Chrome (una vez publicada)

- **Computadora:** abre la URL en Chrome → menú ⋮ → **Instalar aplicación…** (o el botón **📥 Instalar App** de la barra superior).
- **Android (Chrome):** abre la URL → menú ⋮ → **Agregar a pantalla de inicio** / **Instalar aplicación**.
- **iPhone/iPad (Safari):** botón Compartir → **Agregar a pantalla de inicio**.

Una instalada, la app abre con su propio icono, sin barra de navegador, y
recuerda los datos del dispositivo (almacenamiento local).
