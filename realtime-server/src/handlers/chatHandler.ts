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
 * Maneja los eventos de chat en tiempo real.
 * - Recibe mensajes del cliente
 * - Los persiste en Firestore (colección rooms/{roomId}/messages)
 * - Los emite a todos los participantes de la sala
 */
export const registerChatHandlers = (
  io: Server,
  socket: Socket,
  rooms: Map<string, RoomState>,
  socketUserMap: Map<string, UserInfo>
): void => {

  /**
   * Evento: 'send_message'
   * Envía un mensaje de chat a la sala.
   */
  socket.on('send_message', async (payload: SendMessagePayload) => {
    const { roomId, text } = payload;
    const user = socketUserMap.get(socket.id);

    if (!user) {
      socket.emit('error', { message: 'Usuario no autenticado en la sala' });
      return;
    }

    if (!text || text.trim().length === 0) {
      socket.emit('error', { message: 'El mensaje no puede estar vacío' });
      return;
    }

    if (text.trim().length > 1000) {
      socket.emit('error', { message: 'El mensaje es demasiado largo (máx. 1000 caracteres)' });
      return;
    }

    const room = rooms.get(roomId);
    if (!room || !room.participants.has(user.uid)) {
      socket.emit('error', { message: 'No estás en esta sala' });
      return;
    }

    try {
      const messageId = uuidv4();
      const message: NewMessagePayload = {
        id: messageId,
        roomId,
        senderUid: user.uid,
        senderName: user.displayName,
        senderPhotoURL: user.photoURL,
        text: text.trim(),
        createdAt: new Date().toISOString(),
      };

      // Persist to Firestore
      await db
        .collection('rooms')
        .doc(roomId)
        .collection('messages')
        .doc(messageId)
        .set(message);

      // Broadcast to all participants in the room (including sender)
      io.to(roomId).emit('new_message', message);

    } catch (error) {
      console.error('[Chat] Error guardando mensaje:', error);
      socket.emit('error', { message: 'Error al enviar el mensaje' });
    }
  });
};
