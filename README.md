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

Hay dos formas de publicarlas. **Opción A (recomendada, sin copiar a mano):**

#### Opción A — Firebase CLI (sin errores de formato)

```bash
# 1. Instalar la CLI (una sola vez)
npm install -g firebase-tools

# 2. Autorizar tu cuenta de Google
firebase login

# 3. Publicar las reglas (desde esta carpeta)
firebase deploy --only firestore:rules --project yeison-app-84d5d
```

El archivo `.firebaserc` ya deja `yeison-app-84d5d` como proyecto por defecto,
así que también sirve: `firebase deploy --only firestore:rules`.

#### Opción B — Firebase Console (manual)

En **Firebase Console → Firestore Database → Reglas**, borra todo el contenido,
pega el bloque de abajo y pulsa **Publish**:

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

> 💡 **Importante:** el editor de reglas de Firebase **no acepta comentarios
> `//`**. Si copias el bloque con comentarios da `Parse error`. Por eso el
> bloque de arriba va limpio, y el archivo `firestore.rules` del repo también.

> ⚠️ Con `allow read, write: if true` cualquier persona con la URL podría
> leer/borrar datos. Es aceptable para uso interno de la junta. Para mayor
> seguridad, activa **Firebase Authentication** (correo/contraseña) y cambia
> la regla a `if request.auth != null`.

### Nota sobre el modo de prueba
Si la base fue creada en **modo de prueba (test mode)**, las escrituras dejan
de funcionar a los **30 días**. Publica las reglas de arriba antes de esa fecha.
Las reglas ya están publicadas (verificado el 21/10/2026).

## Sincronización en tiempo real (entre dispositivos)

La app **escucha** Firestore en vivo (`onSnapshot`) en las 3 colecciones, así que
todo cambio se refleja **al instante en todos los dispositivos**, sin recargar la
página ni volver a iniciar sesión:

| Colección | Qué se sincroniza en vivo |
|---|---|
| `pagos` | Pagos nuevos, **ediciones** (monto, estado, meses, comprobante) y **borrados** |
| `configuracion/general` | Nombre de la app, colores, cuota, datos bancarios y ficha |
| `fichas` | Historial de fichas descargadas/compartidas |

La etiqueta superior muestra el estado:

- `🔄 En vivo — Sincronizado` → conectado y escuchando cambios.
- `⚠️ Nube sin permisos…` → las reglas de Firestore no están publicadas.

### Detalles importantes

- **Borrado lógico.** Al eliminar un pago se marca con `eliminado: true` en la nube
  en vez de borrarse el documento. Así ningún otro dispositivo lo "resucita" al
  volver a sincronizar. La app oculta esos registros automáticamente.
- **Datos de ejemplo.** Los 3 pagos de demostración (Carlos E. Mendoza y
  Ana Gómez Rondón) que se ven la primera vez en un dispositivo nuevo **nunca se
  suben a la nube**: si la nube ya tiene pagos reales, mandan los de la nube.
- **Sin conexión.** Si el dispositivo no tiene internet, la app guarda en local y
  sube el cambio al reconectar (Firestore persiste la caché en el navegador).

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
- Editar los **🏦 Datos Bancarios** del Pago Móvil (banco, teléfono, RIF, titular,
  cuenta y una nota). Se muestran al residente y traen un botón para
  **enviarlos por WhatsApp**.
- Ajustar la **cuota mensual** (el monto del reporte se calcula solo).
- Elegir **colores** (principal, acento y tarjetón) o usar paletas rápidas.
- **Personalizar la ficha**: colores de fondo, texto, sello *cancelado* y sello
  *pendiente*, además de **imágenes propias** (fondo de la ficha, imagen del
  mes cancelado y del mes pendiente).
- **Guardar** los cambios (se publican en Firestore para todos los dispositivos).
- Activar **notificaciones** de pagos y ver el **estado de instalación** de la app.

### ✏️ Modificar un pago
Cada pago de la **Conciliación** tiene un botón **✏️ Editar** (también disponible
desde el recibo y desde el Historial por Cliente) que permite cambiar:

- Nombre, apartamento y puesto del residente.
- Año de la cuota, monto y fecha.
- Estado (Pendiente / Aprobado / Rechazado).
- Los **meses** que cancela (selección individual).
- El **comprobante** (reemplazarlo por otra imagen o quitarlo).

## Notificaciones cuando alguien paga (push real)

Ya está **completo**: los avisos llegan **también con la app cerrada**.

### Cómo funciona

1. **El dispositivo se suscribe.** Al pulsar *Configuración → 🔔 Notificaciones de Pagos →
   Activar Notificaciones*, el navegador obtiene un token push de Firebase
   (`getToken()`) y lo guarda en la colección `suscripciones` de Firestore.
   No hace falta pegar una clave VAPID: el SDK usa el certificado web push del
   propio proyecto.
2. **Se avisa al crear un pago.** Al subir un pago a Firestore, la app hace un
   `POST` a la función serverless `api/notificar` (Vercel).
3. **El servidor envía el push.** `api/notificar.js` firma un JWT con una
   **cuenta de servicio de Google**, lee `suscripciones` y `pagos` en Firestore y
   envía el aviso por **FCM v1** a cada token. Guarda en `notificaciones_enviadas`
   los pagos ya avisados para no repetirlos.
4. **El aviso aparece.** `sw.js` (el único *service worker* registrado) escucha el
   evento `push` y muestra la notificación del sistema, aunque la app esté
   cerrada. Al tocarla, se abre la app.

### Configurar el servidor (ya está hecho, esto es la guía)

- Cuenta de servicio: `firebase-push@yeison-app-84d5d.iam.gserviceaccount.com`
  con los roles `roles/cloudmessaging.editor` y `roles/datastore.user`.
- Su clave privada se guarda **cifrada** en Vercel como variable de entorno
  `FIREBASE_SERVICE_ACCOUNT_B64` (base64 del JSON de la cuenta de servicio).
  **Nunca** se sube al repositorio.
- La función está en `api/notificar.js` y se despliega sola con cada `git push`.

### Probarlo

- *Aviso en la App* → muestra el aviso dentro de la app (prueba rápida).
- *Push Real (app cerrada)* → el servidor envía un push de verdad a todos los
  dispositivos suscritos. Cierra la app antes de pulsarlo para comprobarlo.

### Notas

- La cuenta de servicio se puede borrar con
  `gcloud iam service-accounts delete firebase-push@yeison-app-84d5d.iam.gserviceaccount.com`
  y la variable de entorno con `vercel env rm FIREBASE_SERVICE_ACCOUNT_B64`.
- Si se cambia de proyecto de Firebase, hay que rehacer la clave y la variable
  de entorno, y actualizar `PROJECT_ID` en `api/notificar.js`.
- Avisos por dispositivo: cada uno se suscribe por separado. Si un token deja de
  servir, el servidor lo borra solo de `suscripciones`.

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
