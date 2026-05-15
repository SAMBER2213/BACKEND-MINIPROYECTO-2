# BACKEND

Backend del planificador de estudio migrado a **Node.js con TypeScript**, usando **Firebase Authentication** para usuarios y **Cloud Firestore** como base de datos NoSQL.

## Scripts

```bash
npm install
npm run dev
npm run build
npm start
```

## Variables de entorno

Copia `.env.example` a `.env` y configura Firebase:

```env
PORT=8000
FIREBASE_PROJECT_ID=tu-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@tu-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nTU_LLAVE_PRIVADA\n-----END PRIVATE KEY-----\n"
FIREBASE_WEB_API_KEY=tu_web_api_key
```

También puedes usar `FIREBASE_SERVICE_ACCOUNT_BASE64` con el JSON del service account codificado en Base64.

## Rutas conservadas

Todas las rutas principales se mantienen bajo `/api/`:

- `GET /api/health/`
- `POST /api/auth/registro/`
- `POST /api/auth/login/`
- `GET /api/hoy/`
- `GET|POST /api/actividades/`
- `GET|PUT|DELETE /api/actividades/:actividadId/`
- `GET|POST /api/actividades/:actividadId/subtareas/`
- `PUT|DELETE /api/actividades/:actividadId/subtareas/:subtareaId/`
- `GET|PUT /api/limite/`
- `GET /api/carga/:fecha/`

El frontend puede seguir enviando `X-Usuario-Id`. También se admite `Authorization: Bearer <idToken>`.
