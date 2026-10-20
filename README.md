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
| `firebase-messaging-sw.js` | Service Worker de Firebase para notificaciones push |
| `icons/` | Iconos de la app (192px, 512px y maskable) |
| `vercel.json` | Encabezados de caché correctos para Vercel |

## Cómo usarla localmente

Basta con abrir `index.html` en el navegador (doble clic).
Los datos se guardan en el navegador (localStorage) y la contraseña de
administración por defecto es `123456`.

## Servidor: Firebase (Firestore)

La app sincroniza los pagos con el proyecto `yeison-app-84d5d` de Firebase.
Todos los dispositivos ven los mismos datos; si no hay internet, guarda en
local y sincroniza al reconectar.

### Colecciones usadas en Firestore

| Colección | Qué guarda |
|---|---|
| `pagos` | Los pagos reportados por los residentes |
| `configuracion` | Nombre de la app, colores, cuota y personalización de la ficha (se cambia en el Panel Admin → **⚙️ Configuración de la Página**) |
| `suscripciones` | (Opcional) Tokens de notificaciones si se configura VAPID |
| `fichas` | Historial de fichas descargadas/compartidas por la junta |

### Reglas de seguridad (obligatorio publicarlas)
En **Firebase Console → Firestore Database → Reglas**, pega esto y pulsa **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /pagos/{pagoId} {
      allow read, write: if true;
    }
    match /configuracion/{docId} {
      allow read, write: if true;
    }
    match /suscripciones/{docId} {
      allow read, write: if true;
    }
    match /fichas/{docId} {
      allow read, write: if true;
    }
  }
}
```

> ⚠️ Con `allow read, write: if true` cualquier persona con la URL podría
> leer/borrar datos. Es aceptable para uso interno de la junta. Para mayor
> seguridad, activa **Firebase Authentication** (correo/contraseña) y cambia
> la regla a `if request.auth != null`.

### Nota sobre el modo de prueba
Si la base fue creada en **modo de prueba (test mode)**, las escrituras dejan
de funcionar a los **30 días**. Publica las reglas de arriba antes de esa fecha.

## Panel del Administrador

Además de **Conciliación de Pagos** e **Historial por Cliente**, el panel tiene:

### 🧾 Fichas y Registro (solo junta)
La consulta de ficha es **exclusiva del administrador** (ya no aparece para los
residentes en el menú de inicio). Desde esta pestaña la junta puede:

- Buscar un residente por **nombre, apartamento o puesto**.
- Ver la **ficha sellada** con los 12 meses (cancelado / pendiente / por pagar).
- **Registrar el pago** manualmente desde el botón "➕ Registrar Pago Manual".
- **Descargar la ficha como imagen PNG** para enviársela al cliente por WhatsApp.
- **Imprimir** la ficha.
- Ver el **📤 Historial de Fichas Compartidas** (queda registro de cada descarga).

### ⚙️ Configuración de la Página
Desde aquí se puede:

- Cambiar el **nombre del edificio**, el **subtítulo** y la **letra del logo**.
- Ajustar la **cuota mensual** (el monto del reporte se calcula solo).
- Elegir **colores** (principal, acento y tarjetón) o usar paletas rápidas.
- **Personalizar la ficha**: colores de fondo, texto, sello *cancelado* y sello
  *pendiente*, además de **imágenes propias** (fondo de la ficha, imagen del
  mes cancelado y del mes pendiente).
- **Guardar** los cambios (se publican en Firestore para todos los dispositivos).
- Activar **notificaciones** de pagos y ver el **estado de instalación** de la app.

## Notificaciones cuando alguien paga

- **Con la app abierta:** la junta recibe una alerta interna (aviso) al instante,
  aunque el dispositivo esté en la pantalla del residente. Se activan una vez en
  **Configuración → 🔔 Notificaciones de Pagos → Activar Notificaciones**.
- **Con la app cerrada (segundo plano):** hace falta la mensajería push de Firebase.
  Pasos:
  1. **Firebase Console → ⚙️ Configuración del proyecto → Cloud Messaging → Web Push certificates → Generate key pair.**
  2. Copia la **clave pública VAPID**.
  3. En `index.html`, pega la clave en la constante `VAPID_PUBLIC_KEY` (busca esa línea).
  4. Vuelve a publicar. Al pulsar "Activar Notificaciones", el dispositivo se registra.
  5. Para **enviar** la notificación cuando entra un pago, se requiere una función
     de servidor (Cloud Function) que detecte el nuevo documento `pagos` y envíe el
     mensaje. Con la clave configurada, la app ya muestra avisos en primer plano.

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

### Si dice "no se puede instalar"
1. Abre la **URL raíz** (ej. `https://tu-app.vercel.app/`), no un enlace con
   subcarpeta ni un archivo local (`file://`). Debe ser **https**.
2. Usa **Chrome** en Android/escritorio. En iPhone hay que usar **Safari**.
3. Espera a que la página cargue por completo (unos segundos) y **recarga**.
4. Revisa en el Panel Admin → **⚙️ Configuración → 📱 Instalar como App → 🔍 Diagnóstico**:
   manifest e iconos deben salir en ✅.
5. Si entraste desde un enlace compartido en Facebook/Instagram/WhatsApp, el
   navegador interno no permite instalar: abre el menú y elige "Abrir en Chrome".
6. En Chrome de escritorio, si antes se abrió con errores, borra los datos del
   sitio (candado en la barra de direcciones → Cookies y datos del sitio → Eliminar).

> Tras cada actualización, el Service Worker `sw.js` usa **red primero** para el
> HTML, así los cambios llegan solos sin que el usuario borre caché.
