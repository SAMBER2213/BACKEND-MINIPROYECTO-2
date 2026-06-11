import { Server, Socket } from 'socket.io';
import {
  RoomState,
  UserInfo,
  WebRTCOfferPayload,
  WebRTCAnswerPayload,
  WebRTCIceCandidatePayload,
  MediaStatePayload,
  ScreenSharePayload,
  RegisterPeerPayload,
} from '../types';

/**
 * Construye la lista de ICE servers usando las variables de entorno de ExpressTURN.
 * Si no hay credenciales configuradas, devuelve solo el STUN público de Google.
 *
 * El frontend debe usar estos servidores al crear RTCPeerConnection para garantizar
 * conectividad incluso detrás de NAT/firewall simétricos (TS-03).
 */
export function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    // STUN público como fallback
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  const turnUrl        = process.env.TURN_URL;
  const turnUsername   = process.env.TURN_USERNAME;
  const turnCredential = process.env.TURN_CREDENTIAL;

  if (turnUrl && turnUsername && turnCredential) {
    servers.push({
      urls: turnUrl,
      username: turnUsername,
      credential: turnCredential,
    });
    console.log(`[ICE] Servidor TURN configurado: ${turnUrl}`);
  } else {
    console.warn('[ICE] Variables TURN_URL / TURN_USERNAME / TURN_CREDENTIAL no configuradas. Usando solo STUN.');
  }

  return servers;
}

/**
 * Maneja el signaling WebRTC + registro de PeerJS para Sprint 4.
 *
 * Flujo completo (TS-03):
 * 1. Cliente A se conecta, recibe room_joined con la lista de participantes (con peerIds).
 * 2. Cliente A inicia su PeerJS peer, obtiene su peerId y emite 'register_peer'.
 * 3. El servidor guarda el peerId y notifica a la sala ('peer_registered').
 * 4. Clientes existentes llaman peer.call(peerId_de_A) para audio/video P2P.
 * 5. Los streams SDP/ICE viajan directo browser↔browser via PeerJS server.
 * 6. El signaling clásico (webrtc_offer/answer/ice) queda disponible como fallback.
 */
export const registerWebRTCHandlers = (
  io: Server,
  socket: Socket,
  rooms: Map<string, RoomState>,
  socketUserMap: Map<string, UserInfo>
): void => {

  // ─── Sprint 4: ICE servers config ──────────────────────────────
  /**
   * El cliente solicita la configuración ICE (STUN + TURN de ExpressTURN).
   * Debe llamarse antes de crear cualquier RTCPeerConnection o PeerJS Peer.
   *
   * Evento cliente → servidor: 'get_ice_servers'
   * Evento servidor → cliente: 'ice_servers' { iceServers: RTCIceServer[] }
   */
  socket.on('get_ice_servers', () => {
    const iceServers = buildIceServers();
    socket.emit('ice_servers', { iceServers });
    console.log(`[ICE] Configuración enviada a socket:${socket.id}`);
  });

  // ─── Sprint 4: PeerJS peer registration ────────────────────────
  /**
   * El cliente registra su PeerJS peer ID para que los demás puedan llamarlo.
   *
   * Evento cliente → servidor: 'register_peer' { roomId, peerId }
   * Evento servidor → sala:    'peer_registered' { uid, peerId, socketId, displayName, photoURL, isMuted, isCameraOff }
   */
  socket.on('register_peer', (payload: RegisterPeerPayload) => {
    const user = socketUserMap.get(socket.id);
    if (!user) {
      socket.emit('error', { message: 'No estás autenticado en ninguna sala' });
      return;
    }

    const room = rooms.get(payload.roomId);
    if (!room || !room.participants.has(user.uid)) {
      socket.emit('error', { message: 'No estás en esta sala' });
      return;
    }

    // Guardar peerId en el estado del usuario
    user.peerId = payload.peerId;
    room.participants.set(user.uid, user);
    socketUserMap.set(socket.id, user);

    console.log(`[PeerJS] ${user.displayName} registró peerId: ${payload.peerId} en sala ${payload.roomId}`);

    // Notificar a TODOS en la sala (incluyendo al propio usuario para confirmación)
    io.to(payload.roomId).emit('peer_registered', {
      uid: user.uid,
      peerId: payload.peerId,
      socketId: socket.id,
      displayName: user.displayName,
      photoURL: user.photoURL,
      isMuted: user.isMuted,
      isCameraOff: user.isCameraOff,
    });
  });

  // ─── WebRTC Signaling clásico (fallback / compatibilidad) ──────

  /**
   * Reenvía una oferta SDP al peer objetivo.
   * Emitido por quien inicia la conexión P2P.
   */
  socket.on('webrtc_offer', (payload: WebRTCOfferPayload) => {
    const user = socketUserMap.get(socket.id);
    if (!user) return;

    console.log(`[WebRTC] offer: ${user.displayName} → socket:${payload.targetSocketId}`);

    io.to(payload.targetSocketId).emit('webrtc_offer', {
      sdp: payload.sdp,
      fromSocketId: socket.id,
      fromUid: user.uid,
      fromDisplayName: user.displayName,
    });
  });

  /**
   * Reenvía una respuesta SDP al peer que hizo la oferta.
   */
  socket.on('webrtc_answer', (payload: WebRTCAnswerPayload) => {
    const user = socketUserMap.get(socket.id);
    if (!user) return;

    console.log(`[WebRTC] answer: ${user.displayName} → socket:${payload.targetSocketId}`);

    io.to(payload.targetSocketId).emit('webrtc_answer', {
      sdp: payload.sdp,
      fromSocketId: socket.id,
      fromUid: user.uid,
    });
  });

  /**
   * Reenvía un ICE candidate al peer objetivo.
   */
  socket.on('webrtc_ice_candidate', (payload: WebRTCIceCandidatePayload) => {
    io.to(payload.targetSocketId).emit('webrtc_ice_candidate', {
      candidate: payload.candidate,
      fromSocketId: socket.id,
    });
  });

  // ─── Media state ───────────────────────────────────────────────

  /**
   * Actualiza el estado de medios (micrófono/cámara) y notifica a la sala.
   */
  socket.on('media_state_change', (payload: MediaStatePayload) => {
    const user = socketUserMap.get(socket.id);
    if (!user) return;

    const room = rooms.get(payload.roomId);
    if (!room || !room.participants.has(user.uid)) return;

    user.isMuted      = payload.isMuted;
    user.isCameraOff  = payload.isCameraOff;
    room.participants.set(user.uid, user);

    console.log(
      `[Media] ${user.displayName}: muted=${payload.isMuted}, cameraOff=${payload.isCameraOff}`
    );

    socket.to(payload.roomId).emit('media_state_update', {
      uid: user.uid,
      isMuted: payload.isMuted,
      isCameraOff: payload.isCameraOff,
    });
  });

  /**
   * Notifica a la sala cuando alguien empieza/para de compartir pantalla.
   */
  socket.on('screen_share_change', (payload: ScreenSharePayload) => {
    const user = socketUserMap.get(socket.id);
    if (!user) return;

    const room = rooms.get(payload.roomId);
    if (!room || !room.participants.has(user.uid)) return;

    user.isSharingScreen = payload.isSharingScreen;
    room.participants.set(user.uid, user);

    console.log(
      `[Screen] ${user.displayName}: sharing=${payload.isSharingScreen}`
    );

    socket.to(payload.roomId).emit('media_state_update', {
      uid: user.uid,
      isMuted: user.isMuted,
      isCameraOff: user.isCameraOff,
      isSharingScreen: payload.isSharingScreen,
    });
  });
};