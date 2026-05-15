import { Server, Socket } from 'socket.io';
import {
  RoomState,
  UserInfo,
  WebRTCOfferPayload,
  WebRTCAnswerPayload,
  WebRTCIceCandidatePayload,
  MediaStatePayload,
  ScreenSharePayload,
} from '../types';

/**
 * Maneja el signaling WebRTC para establecer conexiones P2P.
 *
 * Flujo de negociación WebRTC:
 * 1. Usuario A entra a la sala → se notifica a todos
 * 2. Usuarios existentes envían 'webrtc_offer' a A
 * 3. A responde con 'webrtc_answer'
 * 4. Se intercambian ICE candidates hasta establecer conexión P2P
 */
export const registerWebRTCHandlers = (
  io: Server,
  socket: Socket,
  rooms: Map<string, RoomState>,
  socketUserMap: Map<string, UserInfo>
): void => {

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

  /**
   * Actualiza el estado de medios (micrófono/cámara) y notifica a la sala.
   */
  socket.on('media_state_change', (payload: MediaStatePayload) => {
    const user = socketUserMap.get(socket.id);
    if (!user) return;

    const room = rooms.get(payload.roomId);
    if (!room || !room.participants.has(user.uid)) return;

    // Update user state
    user.isMuted = payload.isMuted;
    user.isCameraOff = payload.isCameraOff;
    room.participants.set(user.uid, user);

    console.log(
      `[Media] ${user.displayName}: muted=${payload.isMuted}, cameraOff=${payload.isCameraOff}`
    );

    // Notify all participants in the room
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
