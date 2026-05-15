# StudySync — Backend

Backend del proyecto **Salón de Estudio Colaborativo en Tiempo Real**.

## Arquitectura

```
backend/
├── main-api/          # REST API principal (Express + Firebase)
│   ├── src/
│   │   ├── config/    # Firebase, Swagger
│   │   ├── controllers/  # Lógica de negocio
│   │   ├── middleware/   # Auth, manejo errores
│   │   └── routes/    # Endpoints documentados con Swagger
│   └── package.json
│
└── realtime-server/   # Servidor tiempo real (Socket.io + WebRTC)
    ├── src/
    │   ├── config/    # Firebase
    │   ├── handlers/  # chat, webrtc, rooms
    │   └── types.ts   # Tipos compartidos
    └── package.json
```

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| REST API | Node.js + TypeScript + Express |
| Tiempo real | Socket.io (WebSockets) |
| Signaling P2P | WebRTC via Socket.io |
| Auth | Firebase Authentication |
| Base de datos | Firestore (NoSQL) |
| Documentación | Swagger / OpenAPI 3.0 |
| Deploy | Render |

---

## Configuración inicial

### 1. Clonar y entrar al repo
```bash
git clone <tu-repo>
cd backend
```

### 2. Firebase

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Crea un proyecto (o usa uno existente)
3. Activa **Authentication** → habilita Email/Password y Google
4. Activa **Firestore** → crea base de datos
5. Ve a **Project Settings > Service Accounts** → "Generate new private key"
6. Descarga el JSON con las credenciales

### 3. Variables de entorno

```bash
# main-api
cd main-api
cp .env.example .env
# Edita .env con tus credenciales de Firebase

# realtime-server
cd ../realtime-server
cp .env.example .env
# Mismas credenciales Firebase
```

### 4. Instalar dependencias y arrancar

```bash
# Terminal 1 - Main API (puerto 3001)
cd main-api
npm install
npm run dev

# Terminal 2 - Realtime Server (puerto 3002)
cd realtime-server
npm install
npm run dev
```

### 5. Ver documentación Swagger

Abre tu navegador en: **http://localhost:3001/api/docs**

---

## Endpoints REST (Main API)

### Health
| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/api/health` | ❌ | Estado del servidor |

### Users
| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/api/users/me` | ✅ | Mi perfil |
| POST | `/api/users/profile` | ✅ | Crear/actualizar perfil |
| PUT | `/api/users/me` | ✅ | Editar perfil |
| DELETE | `/api/users/me` | ✅ | Eliminar cuenta |
| GET | `/api/users/:uid` | ✅ | Perfil público de usuario |

### Rooms
| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/api/rooms` | ✅ | Listar salas públicas |
| GET | `/api/rooms/my` | ✅ | Mis salas |
| POST | `/api/rooms` | ✅ | Crear sala |
| GET | `/api/rooms/:id` | ✅ | Detalle de sala |
| PUT | `/api/rooms/:id` | ✅ | Editar sala (solo anfitrión) |
| DELETE | `/api/rooms/:id` | ✅ | Eliminar sala (solo anfitrión) |
| GET | `/api/rooms/:id/messages` | ✅ | Historial de mensajes |

**Autenticación:** `Authorization: Bearer <firebase-id-token>`

---

## Eventos Socket.io (Realtime Server)

### Cliente → Servidor

| Evento | Payload | Descripción |
|--------|---------|-------------|
| `join_room` | `{ roomId, token }` | Entrar a una sala (autenticado) |
| `leave_room` | `{ roomId }` | Salir de una sala |
| `send_message` | `{ roomId, text }` | Enviar mensaje de chat |
| `media_state_change` | `{ roomId, isMuted, isCameraOff }` | Cambiar estado A/V |
| `screen_share_change` | `{ roomId, isSharingScreen }` | Compartir/dejar de compartir pantalla |
| `webrtc_offer` | `{ roomId, targetSocketId, sdp }` | Oferta SDP WebRTC |
| `webrtc_answer` | `{ roomId, targetSocketId, sdp }` | Respuesta SDP WebRTC |
| `webrtc_ice_candidate` | `{ roomId, targetSocketId, candidate }` | ICE Candidate |

### Servidor → Cliente

| Evento | Descripción |
|--------|-------------|
| `room_joined` | Confirmación de entrada + lista de participantes |
| `participant_joined` | Nuevo participante en la sala |
| `participant_left` | Participante salió |
| `new_message` | Nuevo mensaje de chat |
| `media_state_update` | Estado A/V de un participante cambió |
| `error` | Error del servidor |

---

## Flujo WebRTC (Signaling)

```
Usuario A (ya en sala)    Servidor Signaling    Usuario B (nuevo)
       |                        |                      |
       |                        |<-- join_room --------|
       |<-- participant_joined --|                      |
       |                        |                      |
       |--- webrtc_offer ------->|                      |
       |                        |--- webrtc_offer ----->|
       |                        |<-- webrtc_answer -----|
       |<-- webrtc_answer -------|                      |
       |                        |                      |
       |<-- webrtc_ice_candidate (ambas direcciones) -->|
       |                        |                      |
       |<============ Conexión P2P establecida ========>|
```

---

## Colecciones Firestore

### `users/{uid}`
```json
{
  "uid": "string",
  "email": "string",
  "displayName": "string",
  "username": "string",
  "photoURL": "string | null",
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```

### `rooms/{roomId}`
```json
{
  "name": "string",
  "description": "string",
  "hostUid": "string",
  "hostName": "string",
  "isPrivate": "boolean",
  "maxParticipants": "number",
  "participantCount": "number",
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```

### `rooms/{roomId}/messages/{messageId}`
```json
{
  "id": "string",
  "roomId": "string",
  "senderUid": "string",
  "senderName": "string",
  "senderPhotoURL": "string | null",
  "text": "string",
  "createdAt": "ISO date"
}
```

---

## Deploy en Render

### Main API
1. New Web Service → conecta tu repo
2. Root Directory: `backend/main-api`
3. Build Command: `npm install && npm run build`
4. Start Command: `npm start`
5. Agrega las variables de entorno del `.env.example`

### Realtime Server
1. New Web Service → conecta tu repo
2. Root Directory: `backend/realtime-server`
3. Build Command: `npm install && npm run build`
4. Start Command: `npm start`
5. Agrega las variables de entorno del `.env.example`

> **Importante:** En Render, los WebSockets funcionan sin configuración extra en todos los planes.

---

## Sprint 0 — Checklist ✅

- [x] Repositorio estructurado con dos backends separados
- [x] TypeScript configurado en ambos servicios
- [x] Firebase Admin SDK integrado
- [x] Middleware de autenticación con Firebase tokens
- [x] CRUD completo de usuarios (Firestore + Firebase Auth)
- [x] CRUD completo de salas de estudio
- [x] Historial de mensajes desde Firestore
- [x] WebSockets con Socket.io (chat en tiempo real)
- [x] Signaling WebRTC (offer/answer/ICE)
- [x] Control de estados A/V (mute, cámara, pantalla)
- [x] Documentación Swagger/OpenAPI completa
- [x] Variables de entorno con `.env.example`
- [x] Manejo de errores consistente
- [x] CORS configurado para Vercel/localhost
- [x] Health checks en ambos servicios
- [x] `.gitignore` configurado
