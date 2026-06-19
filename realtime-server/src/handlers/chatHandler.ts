import { Server, Socket } from 'socket.io';
import { db } from '../config/firebase';
import {
  RoomState,
  UserInfo,
  SendMessagePayload,
  NewMessagePayload,
} from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Emite un error de chat al socket remitente.
 * Emite dos eventos para compatibilidad: `chat_error` (UI) y `error` (genérico).
 * @param socket - Socket del cliente que originó el error
 * @param message - Descripción del error
 */
function emitChatError(socket: Socket, message: string): void {
  // chat_error es especifico para la UI del chat; error se mantiene por compatibilidad.
  socket.emit('chat_error', { message });
  socket.emit('error', { message });
}

/**
 * Normaliza el texto de un mensaje: elimina espacios al inicio/fin.
 * Devuelve cadena vacía si el valor no es string.
 * @param value - Valor recibido del cliente (tipo desconocido)
 * @returns Texto normalizado o cadena vacía
 */
function normalizeMessageText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

/**
 * Maneja los eventos de chat en tiempo real.
 * - Recibe mensajes del cliente
 * - Valida que el socket este autenticado y unido a la sala
 * - Guarda el mensaje en Firestore como fuente de verdad del historial
 * - Emite el mensaje a todos los sockets de la sala solo despues de persistirlo
 */
export const registerChatHandlers = (
  io: Server,
  socket: Socket,
  rooms: Map<string, RoomState>,
  socketUserMap: Map<string, UserInfo>
): void => {

  /**
   * Evento: 'send_message'
   * Recibe un mensaje de texto del cliente, lo valida, lo persiste en Firestore
   * y lo emite a todos los participantes de la sala.
   *
   * @listens send_message
   * @param payload.roomId - ID de la sala destino
   * @param payload.text - Texto del mensaje (máx. 1000 caracteres)
   * @param payload.clientMessageId - ID temporal del cliente para rastrear el envío (opcional)
   *
   * @fires new_message - A todos los sockets de la sala tras persistir en Firestore
   * @fires message_saved - Solo al remitente, confirma la persistencia
   * @fires message_failed - Solo al remitente, si Firestore falla
   * @fires chat_error - Solo al remitente, si hay error de validación
   */
  socket.on('send_message', async (payload: SendMessagePayload) => {
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
      emitChatError(socket, 'El mensaje no puede estar vacio');
      return;
    }

    if (text.length > 1000) {
      emitChatError(socket, 'El mensaje es demasiado largo (max. 1000 caracteres)');
      return;
    }

    const room = rooms.get(roomId);
    const userInRoom = room?.participants.get(user.uid);

    if (!room || !userInRoom || userInRoom.socketId !== socket.id || !socket.rooms.has(roomId)) {
      emitChatError(socket, 'No estas en esta sala');
      return;
    }

    const messageId = uuidv4();
    const now = new Date().toISOString();
    const messageRef = db
      .collection('rooms')
      .doc(roomId)
      .collection('messages')
      .doc(messageId);

    const message: NewMessagePayload = {
      id: messageId,
      roomId,
      senderUid: user.uid,
      senderName: user.displayName,
      senderPhotoURL: user.photoURL,
      text,
      createdAt: now,
      persistedAt: now,
      storagePath: messageRef.path,
    };

    if (payload?.clientMessageId) {
      message.clientMessageId = payload.clientMessageId;
    }

    try {
      // C3: Firestore es la fuente de verdad del historial. Solo emitimos el mensaje
      // cuando ya quedo guardado para que recargar la sala siempre recupere lo visible.
      await messageRef.set(message);

      io.to(roomId).emit('new_message', message);
      socket.emit('message_saved', {
        id: messageId,
        clientMessageId: payload?.clientMessageId,
        storagePath: messageRef.path,
      });
    } catch (error) {
      console.error('[Chat] Error guardando mensaje:', error);
      socket.emit('message_failed', {
        id: messageId,
        clientMessageId: payload?.clientMessageId,
        message: 'No se pudo guardar el mensaje en Firestore. Intentalo nuevamente.',
      });
    }
  });
};
