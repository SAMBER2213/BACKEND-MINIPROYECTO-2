import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

// Import handlers
import { registerRoomHandlers } from './handlers/roomHandler';
import { registerChatHandlers } from './handlers/chatHandler';
import { registerWebRTCHandlers } from './handlers/webrtcHandler';

// Import types
import { RoomState, UserInfo } from './types';

dotenv.config();

const PORT = process.env.PORT ?? 3002;
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';

const app = express();

// ─── Health check HTTP endpoint ────────────────────────────────────
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({
    success: true,
    status: 'ok',
    service: 'StudySync Realtime Server',
    connectedSockets: io.engine.clientsCount,
    activeRooms: rooms.size,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

// ─── HTTP Server + Socket.io ───────────────────────────────────────
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: [FRONTEND_URL, 'http://localhost:5173', 'http://localhost:3000'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // Reconnection settings
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ─── In-memory state ───────────────────────────────────────────────
// rooms: roomId → RoomState (participants in memory)
const rooms = new Map<string, RoomState>();

// socketUserMap: socketId → UserInfo (quick lookup)
const socketUserMap = new Map<string, UserInfo>();

// ─── Socket.io connection ──────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket] Nuevo cliente conectado: ${socket.id}`);

  // Register all event handlers for this socket
  registerRoomHandlers(io, socket, rooms, socketUserMap);
  registerChatHandlers(io, socket, rooms, socketUserMap);
  registerWebRTCHandlers(io, socket, rooms, socketUserMap);

  // Generic error handler per socket
  socket.on('error', (err) => {
    console.error(`[Socket] Error en ${socket.id}:`, err);
  });
});

// ─── Start server ──────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`\n⚡ StudySync Realtime Server corriendo en http://localhost:${PORT}`);
  console.log(`🔌 WebSocket listo para conexiones`);
  console.log(`🌍 Entorno: ${process.env.NODE_ENV ?? 'development'}\n`);
});

export { io };
