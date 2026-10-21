/**
 * api/notificar.js  ·  Función serverless de Vercel
 * ---------------------------------------------------------------------------
 * Envía los avisos push (Firebase Cloud Messaging) a los dispositivos
 *SUSCRITOS cuando se registra un pago nuevo.
 *
 * ¿Por qué una función? El SDK web de Firebase SÍ obtiene un token de push
 * (getToken) pero NO puede enviar mensajes: el envío del FCM exige un
 * servidor con credenciales de Google. Esta función usa una cuenta de
 * servicio de Google (clave privada guardada como variable de entorno
 * cifrada en Vercel) para:
 *
 *   1. Firmar un JWT y obtener un access token de Google.
 *   2. Leer las colecciones `suscripciones` (tokens FCM) y `pagos`.
 *   3. Enviar el aviso FCM v1 a cada token registrado.
 *   4. Marcar los pagos ya avisados para no repetir el aviso.
 *
 * La app llama a POST /api/notificar justo después de subir un pago a
 * Firestore. No recibe parámetros: la función decide qué avisar leyendo
 * la nube, así que no puede usarse para enviar spam a discretion.
 */

const crypto = require('crypto');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'yeison-app-84d5d';
const DB = '(default)';
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DB}/documents`;
const FCM = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore';
const MAX_AVISOS = 10;              // máximo de pagos avisados por llamada
const LIMITE_LLAMADAS = 20;         // por minuto y por instancia (evita abuso)

// ---------------------------------------------------------------------------
// Token de acceso de Google (JWT firmado con la clave de la cuenta de servicio)
// ---------------------------------------------------------------------------
let tokenCache = { token: null, expira: 0 };

function claveServicio() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (!b64) throw new Error('Falta la variable de entorno FIREBASE_SERVICE_ACCOUNT_B64');
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

async function tokenAcceso() {
  if (tokenCache.token && Date.now() < tokenCache.expira) return tokenCache.token;

  const key = claveServicio();
  const b64u = (s) => Buffer.from(s).toString('base64url');
  const ahora = Math.floor(Date.now() / 1000);
  const base = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + b64u(JSON.stringify({
    iss: key.client_email,
    scope: SCOPE,
    aud: key.token_uri,
    iat: ahora,
    exp: ahora + 3600
  }));
  const firma = crypto.sign('RSA-SHA256', Buffer.from(base), key.private_key).toString('base64url');

  const r = await fetch(key.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: base + '.' + firma
    })
  });
  const d = await r.json();
  if (!d.access_token) throw new Error('Google no devolvió token: ' + JSON.stringify(d).slice(0, 200));

  tokenCache = { token: d.access_token, expira: Date.now() + ((d.expires_in || 3600) - 120) * 1000 };
  return tokenCache.token;
}

// ---------------------------------------------------------------------------
// Utilidades de Firestore (API REST: no hace falta instalar dependencias)
// ---------------------------------------------------------------------------
function valorCampo(campo) {
  if (!campo || typeof campo !== 'object') return undefined;
  if ('stringValue' in campo) return campo.stringValue;
  if ('integerValue' in campo) return Number(campo.integerValue);
  if ('doubleValue' in campo) return campo.doubleValue;
  if ('booleanValue' in campo) return campo.booleanValue;
  if ('timestampValue' in campo) return campo.timestampValue;
  if ('nullValue' in campo) return null;
  return undefined;
}

function aCampos(objeto) {
  const campos = {};
  for (const [clave, v] of Object.entries(objeto)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string') campos[clave] = { stringValue: v };
    else if (typeof v === 'number') campos[clave] = Number.isInteger(v) ? { integerValue: v } : { doubleValue: v };
    else if (typeof v === 'boolean') campos[clave] = { booleanValue: v };
    else if (v instanceof Date) campos[clave] = { timestampValue: v.toISOString() };
  }
  return campos;
}

async function listarDocumentos(token, coleccion) {
  const documentos = [];
  let url = `${FIRESTORE}/${encodeURIComponent(coleccion)}?pageSize=300`;
  while (url) {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) throw new Error(`Firestore ${coleccion}: HTTP ${r.status} ${(await r.text()).slice(0, 180)}`);
    const d = await r.json();
    documentos.push(...(d.documents || []));
    url = d.nextPageToken
      ? `${FIRESTORE}/${encodeURIComponent(coleccion)}?pageSize=300&pageToken=${encodeURIComponent(d.nextPageToken)}`
      : null;
  }
  return documentos;
}

async function guardarDocumento(token, coleccion, id, objeto) {
  const mascaras = Object.keys(objeto)
    .map((ruta) => `updateMask.fieldPaths=${encodeURIComponent(ruta)}`)
    .join('&');
  const r = await fetch(
    `${FIRESTORE}/${encodeURIComponent(coleccion)}/${encodeURIComponent(id)}?${mascaras}`,
    {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: aCampos(objeto) })
    }
  );
  if (!r.ok) throw new Error(`Escritura ${coleccion}/${id}: HTTP ${r.status} ${(await r.text()).slice(0, 180)}`);
}

async function borrarDocumento(token, coleccion, id) {
  const r = await fetch(`${FIRESTORE}/${encodeURIComponent(coleccion)}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + token }
  });
  if (!r.ok && r.status !== 404) throw new Error(`Borrado ${coleccion}/${id}: HTTP ${r.status}`);
}

// ---------------------------------------------------------------------------
// Traza de la función: el plan Hobby de Vercel no guarda logs, así que cada
// llamada deja su registro en la colección `notificaciones_debug` de Firestore.
// ---------------------------------------------------------------------------
async function logServidor(token, evento, extra) {
  try {
    const campos = {
      evento: String(evento),
      cuando: new Date().toISOString(),
      origen: 'servidor',
      suscriptores: '',
      enviados: '',
      fallos: '',
      pendientes: '',
      errores: '',
      mensaje: ''
    };
    for (const [k, v] of Object.entries(extra || {})) {
      if (v === null || v === undefined) continue;
      const clave = String(k).slice(0, 60);
      if (!(clave in campos)) continue;
      campos[clave] = typeof v === 'object' ? JSON.stringify(v).slice(0, 800) : String(v).slice(0, 800);
    }
    await guardarDocumento(token, 'notificaciones_debug', 'srv_ultimo', campos);
  } catch (e) { /* la traza nunca debe romper el envío */ }
}

// Lee el cuerpo de la petición (Vercel lo entrega ya parseado o como string)
function leerCuerpo(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') return resolve(JSON.stringify(req.body));
    if (typeof req.body === 'string' && req.body) return resolve(req.body);
    let datos = '';
    req.on('data', (trozo) => { datos += trozo; });
    req.on('end', () => resolve(datos));
    req.on('error', () => resolve(''));
  });
}

// ---------------------------------------------------------------------------
// Envío del push
// ---------------------------------------------------------------------------
async function enviarPush(token, fcmToken, aviso) {
  const datos = {};
  for (const [k, v] of Object.entries(aviso.data || {})) datos[k] = String(v);

  const r = await fetch(FCM, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        notification: { title: aviso.titulo, body: aviso.cuerpo },
        data: datos,
        webpush: {
          fcmOptions: { link: aviso.enlace || '/' },
          notification: {
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            tag: aviso.data.id || 'pago-nuevo'
          }
        }
      }
    })
  });
  const texto = await r.text();
  if (!r.ok) {
    const error = new Error(`FCM HTTP ${r.status}: ${texto.slice(0, 200)}`);
    error.codigo = r.status;
    error.cuerpo = texto;
    throw error;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Lógica principal
// ---------------------------------------------------------------------------
// Límite de llamadas por minuto (protección básica contra abuso del endpoint)
let llamadas = [];
function exceededLimite() {
  const ahora = Date.now();
  llamadas = llamadas.filter((t) => ahora - t < 60000);
  if (llamadas.length >= LIMITE_LLAMADAS) return true;
  llamadas.push(ahora);
  return false;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Método no permitido (usa POST)' });
    return;
  }

  if (exceededLimite()) {
    res.status(429).json({ ok: false, error: 'Demasiadas llamadas, intenta en un momento' });
    return;
  }

  const seco = new URL(req.url || '/', 'https://x.vercel.app').searchParams.get('seco') === '1';

  // Cuerpo opcional: solo lo usa el botón "Push Real (app cerrada)".
  let cuerpo = {};
  try {
    const bruto = await leerCuerpo(req);
    if (bruto) cuerpo = JSON.parse(bruto);
  } catch (e) { /* cuerpo inválido: se ignora */ }

  try {
    const token = await tokenAcceso();

    // 1) DispositivosSUSCRITOS (tokens FCM)
    const suscripciones = await listarDocumentos(token, 'suscripciones');
    const tokens = [];
    for (const doc of suscripciones) {
      const t = valorCampo(doc.fields && doc.fields.token) || doc.name.split('/').pop();
      if (t && typeof t === 'string' && t.length > 20 && !tokens.includes(t)) tokens.push(t);
    }

    // 2) Aviso de prueba: no toca Firestore, solo comprueba el push real
    if (cuerpo && cuerpo.prueba === true) {
      if (!tokens.length) {
        await logServidor(token, 'prueba_sin_suscriptores', { suscriptores: 0 });
        res.status(200).json({ ok: true, enviados: 0, motivo: 'no hay dispositivos suscritos' });
        return;
      }
      const aviso = {
        titulo: '🧪 Aviso de prueba',
        cuerpo: 'Así llega el aviso cuando se registra un pago, incluso con la app cerrada.',
        enlace: '/?vista=admin',
        data: { id: 'prueba_' + Date.now(), tipo: 'prueba' }
      };
      const resultados = await Promise.allSettled(tokens.map((t) => enviarPush(token, t, aviso)));
      const ok = resultados.filter((r) => r.status === 'fulfilled').length;
      const errores = resultados
        .filter((r) => r.status === 'rejected')
        .map((r) => String((r.reason && (r.reason.cuerpo || r.reason.message)) || '').slice(0, 200));
      await logServidor(token, 'prueba_enviada', { suscriptores: tokens.length, enviados: ok, errores });
      res.status(200).json({ ok: true, prueba: true, suscriptores: tokens.length, enviados: ok });
      return;
    }

    // 3) Pagos ya avisados + marca de arranque
    const registroAvisos = await listarDocumentos(token, 'notificaciones_enviadas');
    const yaAvisados = new Set(
      registroAvisos
        .filter((d) => !d.name.endsWith('/_config'))
        .map((d) => d.name.split('/').pop())
    );

    const docCfg = registroAvisos.find((d) => d.name.endsWith('/_config'));
    let desde = docCfg ? Number(valorCampo(docCfg.fields && docCfg.fields.desde)) || 0 : 0;
    if (!docCfg) {
      desde = Date.now();
      await guardarDocumento(token, 'notificaciones_enviadas', '_config', {
        desde, creado: new Date().toISOString()
      });
    }

    // 4) Pagos pendientes de aviso (los más antiguos se procesan primero)
    //    - no deben llevar `eliminado`
    //    - no se han avisado antes
    //    - son posteriores a la marca de arranque
    //    - son recientes (máx. 6 h) para no generar avalanchas de avisos
    const ventanaMs = 6 * 60 * 60 * 1000;
    const ahoraMs = Date.now();
    const pagos = (await listarDocumentos(token, 'pagos'))
      .map((d) => ({ id: d.name.split('/').pop(), campos: d.fields || {} }))
      .filter((p) => !valorCampo(p.campos.eliminado) && !yaAvisados.has(p.id))
      .filter((p) => {
        const ts = Number(String(p.id).replace(/^pago_/, ''));
        if (!Number.isFinite(ts)) return true;
        return ts >= desde && ts >= ahoraMs - ventanaMs;
      })
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));

    const aAvisar = pagos.slice(0, MAX_AVISOS);

    if (!tokens.length) {
      await logServidor(token, 'sin_suscriptores', { pendientes: aAvisar.length, ids: aAvisar.map((p) => p.id) });
      res.status(200).json({ ok: true, enviados: 0, motivo: 'no hay dispositivos suscritos', pendientes: aAvisar.length });
      return;
    }

    if (seco) {
      await logServidor(token, 'modo_seco', { suscriptores: tokens.length, pendientes: aAvisar.map((p) => p.id) });
      res.status(200).json({
        ok: true, seco: true, suscriptores: tokens.length,
        pendientes: aAvisar.map((p) => p.id)
      });
      return;
    }

    let enviados = 0, fallos = 0;
    for (const pago of aAvisar) {
      const nombre = valorCampo(pago.campos.nombre) || 'Residente';
      const apto = valorCampo(pago.campos.apartamento) || '';
      const puesto = valorCampo(pago.campos.puesto) || '';
      const monto = Number(valorCampo(pago.campos.monto) || 0);
      const aviso = {
        titulo: '💳 Nuevo pago reportado',
        cuerpo: `${nombre}${apto ? ` — Apto ${apto}` : ''}${puesto ? ` · Puesto ${puesto}` : ''} — $${monto.toFixed(2)}`,
        enlace: '/?vista=admin',
        data: { id: pago.id, nombre, monto, tipo: 'pago_nuevo' }
      };

      const resultados = await Promise.allSettled(tokens.map((t) => enviarPush(token, t, aviso)));
      let entregados = 0;
      for (let i = 0; i < resultados.length; i++) {
        const resul = resultados[i];
        if (resul.status === 'fulfilled') { enviados++; entregados++; continue; }
        fallos++;
        const err = resul.reason || {};
        const cuerpo = String(err.cuerpo || err.message || '');
        // Token inválido o desuscrito: se limpia la suscripción
        if (/UNREGISTERED|INVALID_ARGUMENT|404/.test(cuerpo) || err.codigo === 404) {
          try { await borrarDocumento(token, 'suscripciones', tokens[i]); } catch (e) { /* silencioso */ }
        }
      }

      // Solo se marca como avisado si el aviso llegó a algún dispositivo.
      // Si falló todo, el pago queda pendiente y se reintenta más tarde.
      if (entregados > 0) {
        await guardarDocumento(token, 'notificaciones_enviadas', pago.id, {
          enviado: true, fecha: new Date().toISOString(), nombre, monto
        });
      }
    }

    await logServidor(token, 'avivos_enviados', {
      suscriptores: tokens.length,
      avisos: aAvisar.length,
      enviados,
      fallos,
      quedan: Math.max(0, pagos.length - aAvisar.length)
    });

    res.status(200).json({
      ok: true, suscriptores: tokens.length, avisos: aAvisar.length,
      enviados, fallos, quedan: Math.max(0, pagos.length - aAvisar.length)
    });
  } catch (e) {
    const mensaje = String(e && e.message ? e.message : e);
    try { await logServidor(await tokenAcceso(), 'error', { mensaje }); } catch (e2) { /* silencioso */ }
    res.status(500).json({ ok: false, error: mensaje });
  }
};
