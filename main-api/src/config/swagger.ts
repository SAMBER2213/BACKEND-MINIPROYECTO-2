import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'StudySync API',
      version: '1.0.0',
      description: `
# StudySync - API Principal

Backend REST para el Salón de Estudio Colaborativo en Tiempo Real.

## Autenticación
Esta API usa **Firebase Authentication**. Incluye el token Bearer en el header:
\`\`\`
Authorization: Bearer <firebase-id-token>
\`\`\`

## Módulos
- **Health** - Estado del servidor
- **Users** - Gestión de perfiles de usuario
- **Rooms** - Gestión de salas de estudio
- **Messages** - Historial de chat

## Flujo general
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
        description: 'Desarrollo local',
      },
      {
        url: 'https://studysync-api.onrender.com',
        description: 'Producción (Render)',
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
            roomCode: { type: 'string', example: 'ABCD1234', description: 'Código corto de 8 caracteres para unirse a la sala' },
            hostUid: { type: 'string', example: 'abc123uid' },
            hostName: { type: 'string', example: 'Juan García' },
            hostRole: { type: 'string', example: 'Administrador' },
            isPrivate: { type: 'boolean', default: false },
            maxParticipants: { type: 'integer', example: 10, minimum: 2, maximum: 20 },
            participantCount: { type: 'integer', example: 0, description: 'Participantes activos (actualizado por el realtime-server)' },
            isHost: { type: 'boolean', example: true, description: 'Indica si el usuario autenticado es el anfitrión de la sala' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Message: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            roomId: { type: 'string' },
            senderUid: { type: 'string' },
            senderName: { type: 'string' },
            senderPhotoURL: { type: 'string', nullable: true },
            clientMessageId: { type: 'string', nullable: true, description: 'ID temporal enviado por el cliente para evitar duplicados en UI' },
            text: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            persistedAt: { type: 'string', format: 'date-time', description: 'Fecha en la que el realtime-server guardo el mensaje en Firestore' },
            storagePath: { type: 'string', example: 'rooms/room123/messages/msg123', description: 'Ruta del documento guardado en Firestore' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', example: 'Descripción del error' },
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