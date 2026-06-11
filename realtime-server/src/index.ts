import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { ExpressPeerServer } from 'peer';

import { registerRoomHandlers }   from './handlers/roomHandler';
import { registerChatHandlers }   from './handlers/chatHandler';
import { registerWebRTCHandlers, buildIceServers } from './handlers/webrtcHandler';

import { RoomState, UserInfo } from './types';

dotenv.config();

const PORT         = Number(process.env.PORT ?? 3002);
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';
const PEERJS_PATH  = process.env.PEERJS_PATH ?? '/peerjs';

// Lista de orígenes permitidos — incluye la URL de Vercel configurada en FRONTEND_URL
const ALLOWED_ORIGINS = [
  FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:3000',
];

// En producción también aceptamos cualquier subdominio de vercel.app
function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true; // peticiones sin origin (curl, Render health checks)
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (origin.endsWith('.vercel.app')) return true;
  if (origin.endsWith('.onrender.com')) return true;
  return false;
}

const app = express();

app.use(cors({
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS bloqueado para origen: ${origin}`));
    }
  },
  credentials: true,
}));
app.use(express.json());

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS bloqueado para origen: ${origin}`));
      }
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ─── PeerJS Server ────────────────────────────────────────────────
const peerServer = ExpressPeerServer(httpServer, {
  path: '/',
  allow_discovery: false,
  proxied: process.env.NODE_ENV === 'production',
});

app.use(PEERJS_PATH, peerServer);

peerServer.on('connection', (client) => {
  console.log(`[PeerJS] Peer conectado: ${client.getId()}`);
});

peerServer.on('disconnect', (client) => {
  console.log(`[PeerJS] Peer desconectado: ${client.getId()}`);
});

// ─── Health check ─────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    success: true,
    status: 'ok',
    service: 'StudySync Realtime Server',
    connectedSockets: io.engine.clientsCount,
    activeRooms: rooms.size,
    peerServerPath: PEERJS_PATH,
    allowedOrigins: ALLOWED_ORIGINS,
    turnConfigured: !!(
      process.env.TURN_URL &&
      process.env.TURN_USERNAME &&
      process.env.TURN_CREDENTIAL
    ),
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

app.get('/ice-servers', (_req, res) => {
  res.json({ iceServers: buildIceServers() });
});

// ─── In-memory state ──────────────────────────────────────────────
const rooms         = new Map<string, RoomState>();
const socketUserMap = new Map<string, UserInfo>();

// ─── Socket.io connection ─────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket] Nuevo cliente conectado: ${socket.id}`);

  registerRoomHandlers(io, socket, rooms, socketUserMap);
  registerChatHandlers(io, socket, rooms, socketUserMap);
  registerWebRTCHandlers(io, socket, rooms, socketUserMap);

  socket.on('error', (err) => {
    console.error(`[Socket] Error en ${socket.id}:`, err);
  });
});

// ─── Start server ─────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`\n⚡ StudySync Realtime Server corriendo en http://localhost:${PORT}`);
  console.log(`🔌 WebSocket (Socket.io) listo para conexiones`);
  console.log(`📡 PeerJS Signaling Server en http://localhost:${PORT}${PEERJS_PATH}`);
  console.log(`🔒 TURN configurado: ${!!(process.env.TURN_URL) ? '✅ ExpressTURN activo' : '⚠️  Solo STUN (configura TURN_* en .env)'}`);
  console.log(`🌍 Entorno: ${process.env.NODE_ENV ?? 'development'}`);
  console.log(`🌐 CORS permitido para: ${ALLOWED_ORIGINS.join(', ')} + *.vercel.app\n`);
});

export { io };