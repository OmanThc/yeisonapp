# 🚀 AUTOMATIZACIÓN — Cómo se actualiza todo solo

Esta guía explica cómo hacer que **cada cambio se publique automáticamente**
en Vercel y Firebase sin tener que subir archivos a mano.

---

## El flujo

```
Yo edito el código en esta carpeta
        │
        │  git add + commit + push   (lo hace el agente)
        ▼
   GitHub (el repositorio)
        │
        ├──────────────► Vercel se actualiza SOLO en cada push
        │
        └──────────────► Firebase (si se usa Firebase Hosting / reglas)
```

**La regla de oro:** si el proyecto está en GitHub y Vercel está conectado a
ese repositorio, entonces **cualquier push publica la web automáticamente**.
No hay que hacer nada más.

---

## Configuración inicial (una sola vez)

### 1. Instalar herramientas en la Mac
- Command Line Tools (da `git`): `xcode-select --install`
- Homebrew: ver https://brew.sh
- GitHub CLI: `brew install gh`
- Firebase CLI (opcional): `brew install firebase-cli`

### 2. Iniciar sesión en GitHub
```
gh auth login
```
Elegir: **GitHub.com** → **HTTPS** → **Login with a web browser**.
Copiar el código que muestra y pegarlo en el navegador.

### 3. Conectar esta carpeta con el repositorio
```
cd "/Volumes/REP PROMO 1/andres /Verificacion de estacionamiento"
git init
git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
git branch -M main
git add .
git commit -m "Versión inicial"
git push -u origin main
```

### 4. Conectar Vercel al repositorio
1. Entra a https://vercel.com/new
2. Elige **Import Git Repository** y selecciona tu repo.
3. Framework Preset: **Other**. Root Directory: **./**
4. **Deploy**.
5. ✅ A partir de aquí, **cada push actualiza la web sola**.

### 5. (Opcional) Desplegar reglas de Firebase
```
firebase login
firebase use yeison-app-84d5d
firebase deploy --only firestore:rules
```

---

## A partir de ahora

Cada vez que pidas un cambio al agente:

1. El agente edita los archivos en esta carpeta.
2. El agente ejecuta `git add . && git commit && git push`.
3. **Vercel detecta el push y publica la nueva versión en ~1 minuto.**
4. Los datos (pagos, configuración) ya se sincronizan solos vía Firestore.

---

## Notas importantes

- **Los archivos `._*` y `.DS_Store`** son basura del disco y están en
  `.gitignore` para que no molesten. Si aparecen, se ignoran.
- **Service Worker:** `sw.js` usa red-primero para el HTML, así los cambios
  llegan a los usuarios sin que tengan que borrar caché.
- **Datos en Firebase:** la app escribe directamente en Firestore, por lo que
  el contenido (pagos, configuración) se actualiza al instante en todos los
  dispositivos, sin necesidad de "publicar" nada.
- **Reglas de Firebase:** solo cambian si tú lo pides; se despliegan con
  `firebase deploy --only firestore:rules`.
