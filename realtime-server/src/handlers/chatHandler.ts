import { Server, Socket } from 'socket.io';
import { db } from '../config/firebase';
import {
  RoomState,
  UserInfo,
  SendMessagePayload,
  NewMessagePayload,
} from '../types';
import { v4 as uuidv4 } from 'uuid';

function emitChatError(socket: Socket, message: string): void {
  // chat_error es específico para la UI del chat; error se mantiene por compatibilidad.
  socket.emit('chat_error', { message });
  socket.emit('error', { message });
}

function normalizeMessageText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

/**
 * Maneja los eventos de chat en tiempo real.
 * - Recibe mensajes del cliente
 * - Valida que el socket esté autenticado y unido a la sala
 * - Emite inmediatamente el mensaje a todos los sockets dentro de la misma sala
 * - Persiste el mensaje en Firestore en segundo plano para el historial
 */
export const registerChatHandlers = (
  io: Server,
  socket: Socket,
  rooms: Map<string, RoomState>,
  socketUserMap: Map<string, UserInfo>
): void => {

  /**
   * Evento: 'send_message'
   * Envía un mensaje de chat a todos los participantes de la sala.
   */
  socket.on('send_message', (payload: SendMessagePayload) => {
    const roomId = typeof payload?.roomId === 'string' ? payload.roomId.trim() : '';
    const text = normalizeMessageText(payload?.text);
    const user = socketUserMap.get(socket.id);

    if (!user) {
      emitChatError(socket, 'Usuario no autenticado en la sala');
      return;
    }

    if (!roomId) {
      emitChatError(socket, 'roomId es requerido para enviar mensajes');
      return;
    }

    if (!text) {
      emitChatError(socket, 'El mensaje no puede estar vacío');
      return;
    }

    if (text.length > 1000) {
      emitChatError(socket, 'El mensaje es demasiado largo (máx. 1000 caracteres)');
      return;
    }

    const room = rooms.get(roomId);
    const userInRoom = room?.participants.get(user.uid);

    if (!room || !userInRoom || userInRoom.socketId !== socket.id || !socket.rooms.has(roomId)) {
      emitChatError(socket, 'No estás en esta sala');
      return;
    }

    const messageId = uuidv4();
    const message: NewMessagePayload = {
      id: messageId,
      clientMessageId: payload?.clientMessageId,
      roomId,
      senderUid: user.uid,
      senderName: user.displayName,
      senderPhotoURL: user.photoURL,
      text,
      createdAt: new Date().toISOString(),
    };

    // C2: broadcast inmediato por WebSockets a todos los usuarios de la misma sala.
    io.to(roomId).emit('new_message', message);

    // C3 queda preparado: persistencia en Firestore sin bloquear la entrega instantánea.
    db
      .collection('rooms')
      .doc(roomId)
      .collection('messages')
      .doc(messageId)
      .set(message)
      .then(() => {
        socket.emit('message_saved', { id: messageId, clientMessageId: payload?.clientMessageId });
      })
      .catch((error) => {
        console.error('[Chat] Error guardando mensaje:', error);
        socket.emit('message_failed', {
          id: messageId,
          clientMessageId: payload?.clientMessageId,
          message: 'El mensaje se entregó en tiempo real, pero no se pudo guardar en Firestore.',
        });
      });
  });
};
