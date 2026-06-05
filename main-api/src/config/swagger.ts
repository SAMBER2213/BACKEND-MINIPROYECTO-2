import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'StudySync API',
      version: '2.0.0',
      description: `
# StudySync - API Principal

Backend REST para el Salón de Estudio Colaborativo en Tiempo Real.

## Autenticación
Esta API usa **Firebase Authentication**. Incluye el token Bearer en el header:
\`\`\`
Authorization: Bearer <firebase-id-token>
\`\`\`

## Módulos REST
- **Health** - Estado del servidor
- **Users** - Gestión de perfiles de usuario
- **Rooms** - Gestión de salas de estudio (crear, editar, eliminar, unirse)
- **Messages** - Historial de chat persistente en Firestore

## Servidor de Tiempo Real (Socket.IO) — puerto 3002

El **realtime-server** es un proceso independiente que maneja la comunicación en tiempo real mediante **WebSockets (Socket.IO)**. El cliente debe conectarse a \`ws://localhost:3002\` (o la URL de producción) e incluir el **Firebase ID Token** en el evento \`join_room\` para autenticarse.

### Flujo de conexión
1. El cliente se conecta al realtime-server vía Socket.IO.
2. Emite \`join_room\` con \`{ roomId, token, roomCode? }\`.
3. El servidor valida el token con Firebase Admin SDK y verifica si la sala existe.
4. Si todo es correcto, el servidor responde con \`room_joined\` y notifica al resto con \`participant_joined\`.
5. El cliente ya puede enviar mensajes con \`send_message\`.

### Eventos Cliente → Servidor
| Evento | Descripción |
|--------|-------------|
| \`join_room\` | Unirse a una sala (requiere token Firebase) |
| \`leave_room\` | Salir de una sala |
| \`send_message\` | Enviar mensaje de chat (se persiste en Firestore) |
| \`media_state_change\` | Cambiar estado de micrófono/cámara |
| \`screen_share_change\` | Iniciar/detener compartir pantalla |
| \`webrtc_offer\` | Enviar oferta SDP para WebRTC P2P |
| \`webrtc_answer\` | Responder oferta SDP |
| \`webrtc_ice_candidate\` | Enviar ICE candidate |

### Eventos Servidor → Cliente
| Evento | Descripción |
|--------|-------------|
| \`room_joined\` | Confirmación de unión exitosa a la sala |
| \`participant_joined\` | Un nuevo participante se unió |
| \`participant_left\` | Un participante salió o se desconectó |
| \`new_message\` | Nuevo mensaje de chat recibido (ya persistido en Firestore) |
| \`message_saved\` | Confirmación de que el mensaje fue guardado en Firestore |
| \`message_failed\` | El mensaje no pudo guardarse en Firestore |
| \`chat_error\` | Error específico del módulo de chat |
| \`media_state_update\` | Actualización de estado de medios de un participante |
| \`error\` | Error genérico del servidor |
| \`webrtc_offer\` | Oferta SDP reenviada desde otro peer |
| \`webrtc_answer\` | Respuesta SDP reenviada desde otro peer |
| \`webrtc_ice_candidate\` | ICE candidate reenviado desde otro peer |

## Flujo general REST
1. El usuario se autentica con Firebase (frontend)
2. El frontend obtiene el ID Token de Firebase
3. El token se envía en cada request al backend
4. El backend valida el token con Firebase Admin SDK
      `,
      contact: {
        name: 'StudySync Team',
      },
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: 'Desarrollo local — Main API (REST)',
      },
      {
        url: 'https://studysync-api.onrender.com',
        description: 'Producción (Render) — Main API (REST)',
      },
      {
        url: 'http://localhost:3002',
        description: 'Desarrollo local — Realtime Server (Socket.IO)',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Token de Firebase Authentication',
        },
      },
      schemas: {
        UserProfile: {
          type: 'object',
          properties: {
            uid: { type: 'string', example: 'abc123uid' },
            email: { type: 'string', format: 'email', example: 'user@example.com' },
            displayName: { type: 'string', example: 'Juan García' },
            photoURL: { type: 'string', nullable: true, example: 'https://...' },
            username: {
              type: 'string',
              pattern: '^[a-z0-9_]{3,20}$',
              example: 'juangarcia',
              description: 'Username único normalizado en minúsculas. Se reserva también en la colección usernames.',
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Room: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'AbCd1234XyZw' },
            name: { type: 'string', example: 'Sala Cálculo III' },
            description: { type: 'string', nullable: true, example: 'Para estudiar para el parcial' },
            roomCode: { type: 'string', example: 'ABCD1234', description: 'Código corto de 8 caracteres para unirse a la sala. Solo visible al anfitrión en salas privadas.' },
            hostUid: { type: 'string', example: 'abc123uid' },
            hostName: { type: 'string', example: 'Juan García' },
            hostRole: { type: 'string', example: 'Administrador' },
            isPrivate: { type: 'boolean', default: false },
            maxParticipants: { type: 'integer', example: 10, minimum: 2, maximum: 20 },
            participantCount: { type: 'integer', example: 3, description: 'Participantes activos (actualizado en tiempo real por el realtime-server vía Firestore merge)' },
            isHost: { type: 'boolean', example: true, description: 'Indica si el usuario autenticado es el anfitrión de la sala' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Message: {
          type: 'object',
          description: 'Mensaje de chat persistido en Firestore por el realtime-server tras recibir el evento send_message.',
          properties: {
            id: { type: 'string', example: 'uuid-v4-generado-por-el-servidor' },
            roomId: { type: 'string', example: 'AbCd1234XyZw' },
            senderUid: { type: 'string', example: 'abc123uid' },
            senderName: { type: 'string', example: 'Juan García' },
            senderPhotoURL: { type: 'string', nullable: true, example: 'https://foto.jpg' },
            clientMessageId: { type: 'string', nullable: true, description: 'ID temporal enviado por el cliente para evitar duplicados en UI' },
            text: { type: 'string', example: 'Hola a todos', description: 'Contenido del mensaje. Máximo 1000 caracteres.' },
            createdAt: { type: 'string', format: 'date-time', description: 'Fecha en la que el mensaje fue creado/emitido' },
            persistedAt: { type: 'string', format: 'date-time', description: 'Fecha en la que el realtime-server guardó el mensaje en Firestore' },
            storagePath: { type: 'string', example: 'rooms/AbCd1234XyZw/messages/uuid-v4', description: 'Ruta del documento en Firestore' },
          },
        },
        // ─── Socket.IO Payload Schemas ────────────────────────────────────
        JoinRoomPayload: {
          type: 'object',
          description: 'Payload del evento Socket.IO join_room (Cliente → Servidor)',
          required: ['roomId', 'token'],
          properties: {
            roomId: { type: 'string', example: 'AbCd1234XyZw', description: 'ID del documento Firestore de la sala' },
            token: { type: 'string', description: 'Firebase ID Token del usuario autenticado' },
            roomCode: { type: 'string', example: 'ABCD1234', description: 'Código corto de 8 caracteres. Requerido solo si la sala es privada y el usuario no es el anfitrión.' },
          },
        },
        RoomJoinedPayload: {
          type: 'object',
          description: 'Payload del evento Socket.IO room_joined (Servidor → Cliente que se unió)',
          properties: {
            roomId: { type: 'string', example: 'AbCd1234XyZw' },
            user: { $ref: '#/components/schemas/SocketUserInfo' },
            participants: {
              type: 'array',
              items: { $ref: '#/components/schemas/SocketUserInfo' },
              description: 'Lista completa de participantes activos en la sala en ese momento',
            },
            room: { $ref: '#/components/schemas/Room' },
          },
        },
        SendMessagePayload: {
          type: 'object',
          description: 'Payload del evento Socket.IO send_message (Cliente → Servidor)',
          required: ['roomId', 'text'],
          properties: {
            roomId: { type: 'string', example: 'AbCd1234XyZw' },
            text: { type: 'string', example: 'Hola a todos', description: 'Texto del mensaje. Máximo 1000 caracteres.' },
            clientMessageId: { type: 'string', description: 'ID opcional generado en el cliente para deduplicar mensajes en la UI antes de la confirmación del servidor.' },
          },
        },
        MessageSavedPayload: {
          type: 'object',
          description: 'Confirmación emitida al remitente tras persistir el mensaje en Firestore (Servidor → Cliente remitente)',
          properties: {
            id: { type: 'string', description: 'UUID generado por el servidor para el mensaje' },
            clientMessageId: { type: 'string', nullable: true, description: 'El mismo clientMessageId enviado por el cliente, para correlacionar' },
            storagePath: { type: 'string', example: 'rooms/AbCd1234XyZw/messages/uuid-v4' },
          },
        },
        MessageFailedPayload: {
          type: 'object',
          description: 'Error emitido al remitente cuando Firestore falla al guardar el mensaje',
          properties: {
            id: { type: 'string' },
            clientMessageId: { type: 'string', nullable: true },
            message: { type: 'string', example: 'No se pudo guardar el mensaje en Firestore. Intentalo nuevamente.' },
          },
        },
        SocketUserInfo: {
          type: 'object',
          description: 'Información de un participante activo en el servidor de tiempo real',
          properties: {
            uid: { type: 'string', example: 'abc123uid' },
            displayName: { type: 'string', example: 'Juan García' },
            photoURL: { type: 'string', nullable: true },
            socketId: { type: 'string', example: 'abc123socketId', description: 'ID de conexión Socket.IO' },
            isMuted: { type: 'boolean', default: false },
            isCameraOff: { type: 'boolean', default: false },
            isSharingScreen: { type: 'boolean', default: false },
          },
        },
        MediaStateChangePayload: {
          type: 'object',
          description: 'Payload del evento media_state_change (Cliente → Servidor)',
          required: ['roomId', 'isMuted', 'isCameraOff'],
          properties: {
            roomId: { type: 'string', example: 'AbCd1234XyZw' },
            isMuted: { type: 'boolean', example: true },
            isCameraOff: { type: 'boolean', example: false },
          },
        },
        ScreenShareChangePayload: {
          type: 'object',
          description: 'Payload del evento screen_share_change (Cliente → Servidor)',
          required: ['roomId', 'isSharingScreen'],
          properties: {
            roomId: { type: 'string', example: 'AbCd1234XyZw' },
            isSharingScreen: { type: 'boolean', example: true },
          },
        },
        MediaStateUpdatePayload: {
          type: 'object',
          description: 'Actualización de estado de medios de un participante (Servidor → todos en la sala excepto el emisor)',
          properties: {
            uid: { type: 'string', example: 'abc123uid' },
            isMuted: { type: 'boolean' },
            isCameraOff: { type: 'boolean' },
            isSharingScreen: { type: 'boolean', description: 'Solo presente cuando se emite desde screen_share_change' },
          },
        },
        ParticipantJoinedPayload: {
          type: 'object',
          description: 'Notificación a los demás participantes cuando alguien se une (Servidor → sala excepto el que entró)',
          properties: {
            user: { $ref: '#/components/schemas/SocketUserInfo' },
            participants: {
              type: 'array',
              items: { $ref: '#/components/schemas/SocketUserInfo' },
              description: 'Lista actualizada de participantes',
            },
          },
        },
        ParticipantLeftPayload: {
          type: 'object',
          description: 'Notificación cuando un participante sale o se desconecta (Servidor → sala)',
          properties: {
            uid: { type: 'string', example: 'abc123uid' },
            socketId: { type: 'string', example: 'abc123socketId' },
            displayName: { type: 'string', example: 'Juan García' },
          },
        },
        WebRTCOfferPayload: {
          type: 'object',
          description: 'Oferta SDP para iniciar conexión WebRTC P2P (Cliente → Servidor → peer objetivo)',
          required: ['roomId', 'targetSocketId', 'sdp'],
          properties: {
            roomId: { type: 'string' },
            targetSocketId: { type: 'string', description: 'socketId del peer destinatario' },
            sdp: { type: 'object', description: 'RTCSessionDescriptionInit (type + sdp)' },
          },
        },
        WebRTCAnswerPayload: {
          type: 'object',
          description: 'Respuesta SDP a una oferta WebRTC (Cliente → Servidor → peer que hizo la oferta)',
          required: ['roomId', 'targetSocketId', 'sdp'],
          properties: {
            roomId: { type: 'string' },
            targetSocketId: { type: 'string' },
            sdp: { type: 'object', description: 'RTCSessionDescriptionInit' },
          },
        },
        WebRTCIceCandidatePayload: {
          type: 'object',
          description: 'ICE Candidate para establecer conectividad P2P (Cliente → Servidor → peer objetivo)',
          required: ['roomId', 'targetSocketId', 'candidate'],
          properties: {
            roomId: { type: 'string' },
            targetSocketId: { type: 'string' },
            candidate: { type: 'object', description: 'RTCIceCandidateInit' },
          },
        },
        // ─── Utility Schemas ──────────────────────────────────────────────
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', example: 'Descripción del error' },
          },
        },
        SocketError: {
          type: 'object',
          description: 'Error emitido por el servidor vía Socket.IO en el evento error o chat_error',
          properties: {
            message: { type: 'string', example: 'No estas en esta sala' },
          },
        },
        UsernameReservation: {
          type: 'object',
          properties: {
            username: { type: 'string', example: 'juangarcia' },
            uid: { type: 'string', example: 'abc123uid' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Success: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string' },
            data: { type: 'object' },
          },
        },
      },
    },
    security: [{ BearerAuth: [] }],
  },
  apis: ['./src/routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);