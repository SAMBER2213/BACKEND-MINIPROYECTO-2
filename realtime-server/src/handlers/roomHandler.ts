import { Server, Socket } from 'socket.io';
import { auth, db } from '../config/firebase';
import {
  RoomState,
  UserInfo,
  JoinRoomPayload,
} from '../types';

/**
 * Maneja los eventos de entrar y salir de salas de estudio.
 */
export const registerRoomHandlers = (
  io: Server,
  socket: Socket,
  rooms: Map<string, RoomState>,
  socketUserMap: Map<string, UserInfo>
): void => {

  /**
   * Evento: 'join_room'
   * El cliente debe enviar su Firebase ID Token para autenticarse.
   */
  socket.on('join_room', async (payload: JoinRoomPayload) => {
    const { roomId, token } = payload;

    if (!roomId || !token) {
      socket.emit('error', { message: 'roomId y token son requeridos' });
      return;
    }

    try {
      // Verify Firebase token
      const decoded = await auth.verifyIdToken(token);

      // Get user profile from Firestore
      const userDoc = await db.collection('users').doc(decoded.uid).get();
      const userData = userDoc.exists ? userDoc.data()! : null;

      const userInfo: UserInfo = {
        uid: decoded.uid,
        displayName: userData?.displayName ?? decoded.name ?? 'Usuario',
        photoURL: userData?.photoURL ?? decoded.picture ?? null,
        socketId: socket.id,
        isMuted: false,
        isCameraOff: false,
        isSharingScreen: false,
      };

      // Verify room exists in Firestore
      const roomDoc = await db.collection('rooms').doc(roomId).get();
      if (!roomDoc.exists) {
        socket.emit('error', { message: 'La sala no existe' });
        return;
      }

      // Initialize room state if first participant
      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          roomId,
          participants: new Map(),
        });
      }

      const room = rooms.get(roomId)!;

      // Check if room is full
      const maxParticipants = roomDoc.data()!.maxParticipants ?? 10;
      if (room.participants.size >= maxParticipants) {
        socket.emit('error', { message: 'La sala está llena' });
        return;
      }

      // Remove any previous socket for this user (reconnection)
      if (room.participants.has(decoded.uid)) {
        const oldUser = room.participants.get(decoded.uid)!;
        socket.to(roomId).emit('participant_left', {
          uid: oldUser.uid,
          socketId: oldUser.socketId,
          displayName: oldUser.displayName,
        });
      }

      // Add user to room state
      room.participants.set(decoded.uid, userInfo);
      socketUserMap.set(socket.id, userInfo);

      // Join Socket.io room
      await socket.join(roomId);

      console.log(`[Room] ${userInfo.displayName} se unió a sala ${roomId} (${room.participants.size} participantes)`);

      // Tell the new user about existing participants
      const participantsList = Array.from(room.participants.values());
      socket.emit('room_joined', {
        roomId,
        user: userInfo,
        participants: participantsList,
        room: roomDoc.data(),
      });

      // Tell everyone else about the new participant
      socket.to(roomId).emit('participant_joined', {
        user: userInfo,
        participants: participantsList,
      });

    } catch (error: any) {
      console.error('[Room] Error joining room:', error.message);

      if (error.code?.startsWith('auth/')) {
        socket.emit('error', { message: 'Token inválido o expirado' });
      } else {
        socket.emit('error', { message: 'Error al unirse a la sala' });
      }
    }
  });

  /**
   * Evento: 'leave_room'
   * El usuario sale explícitamente de una sala.
   */
  socket.on('leave_room', async (payload: { roomId: string }) => {
    await handleLeaveRoom(io, socket, rooms, socketUserMap, payload.roomId);
  });

  /**
   * Evento: 'disconnect'
   * El socket se desconecta (cierre del navegador, pérdida de red, etc.)
   */
  socket.on('disconnect', async (reason) => {
    const user = socketUserMap.get(socket.id);
    if (!user) return;

    console.log(`[Socket] ${user.displayName} desconectado: ${reason}`);

    // Find and leave all rooms this user was in
    for (const [roomId, room] of rooms.entries()) {
      if (room.participants.has(user.uid)) {
        await handleLeaveRoom(io, socket, rooms, socketUserMap, roomId);
      }
    }

    socketUserMap.delete(socket.id);
  });
};

/**
 * Helper: maneja la lógica de salir de una sala.
 */
async function handleLeaveRoom(
  io: Server,
  socket: Socket,
  rooms: Map<string, RoomState>,
  socketUserMap: Map<string, UserInfo>,
  roomId: string
): Promise<void> {
  const user = socketUserMap.get(socket.id);
  const room = rooms.get(roomId);

  if (!room || !user) return;

  room.participants.delete(user.uid);
  await socket.leave(roomId);

  console.log(`[Room] ${user.displayName} salió de sala ${roomId} (${room.participants.size} restantes)`);

  // Notify remaining participants
  io.to(roomId).emit('participant_left', {
    uid: user.uid,
    socketId: socket.id,
    displayName: user.displayName,
  });

  // Clean up empty room from memory (not from Firestore)
  if (room.participants.size === 0) {
    rooms.delete(roomId);
    console.log(`[Room] Sala ${roomId} vacía, limpiada de memoria`);
  }
}
