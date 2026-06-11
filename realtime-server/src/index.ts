import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
// Sprint 4: PeerJS server para señalización WebRTC P2P
import { ExpressPeerServer } from 'peer';

// Import handlers
import { registerRoomHandlers }   from './handlers/roomHandler';
import { registerChatHandlers }   from './handlers/chatHandler';
import { registerWebRTCHandlers, buildIceServers } from './handlers/webrtcHandler';

// Import types
import { RoomState, UserInfo } from './types';

dotenv.config();

const PORT          = Number(process.env.PORT ?? 3002);
const FRONTEND_URL  = process.env.FRONTEND_URL ?? 'http://localhost:5173';
const PEERJS_PATH   = process.env.PEERJS_PATH ?? '/peerjs';

const app = express();

// ─── Middleware ────────────────────────────────────────────────────
app.use(cors({
  origin: [FRONTEND_URL, 'http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));
app.use(express.json());

// ─── HTTP Server ──────────────────────────────────────────────────
const httpServer = createServer(app);

// ─── Socket.io ────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: [FRONTEND_URL, 'http://localhost:5173', 'http://localhost:3000'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ─── Sprint 4: PeerJS Server (TS-03) ──────────────────────────────
/**
 * Montamos el PeerJS signaling server sobre el mismo httpServer.
 * El frontend se conecta con:
 *   new Peer(undefined, {
 *     host: '<host>',
 *     port: 3002,
 *     path: '/peerjs',
 *     config: { iceServers: <recibidos por socket 'ice_servers'> }
 *   })
 *
 * ExpressTURN se configura en el frontend pasando las credenciales
 * recibidas a través del evento Socket.io 'ice_servers' (ver webrtcHandler).
 */
const peerServer = ExpressPeerServer(httpServer, {
  path: '/',                  // La ruta completa queda como PEERJS_PATH + '/'
  allow_discovery: false,     // No exponer lista de peers por seguridad
  proxied: process.env.NODE_ENV === 'production',
});

app.use(PEERJS_PATH, peerServer);

// Logs de conexión/desconexión de peers
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
    turnConfigured: !!(
      process.env.TURN_URL &&
      process.env.TURN_USERNAME &&
      process.env.TURN_CREDENTIAL
    ),
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

/**
 * Endpoint HTTP para que el frontend obtenga la config ICE sin necesidad
 * de tener un socket abierto (útil en inicialización temprana).
 * GET /ice-servers → { iceServers: RTCIceServer[] }
 */
app.get('/ice-servers', (_req, res) => {
  res.json({ iceServers: buildIceServers() });
});

// ─── In-memory state ──────────────────────────────────────────────
const rooms        = new Map<string, RoomState>();
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
  console.log(`🌍 Entorno: ${process.env.NODE_ENV ?? 'development'}\n`);
});

export { io };