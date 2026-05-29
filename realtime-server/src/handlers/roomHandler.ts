import { Server, Socket } from 'socket.io';
import { auth, db } from '../config/firebase';
import {
  RoomState,
  UserInfo,
  JoinRoomPayload,
} from '../types';

async function syncRoomParticipantCount(roomId: string, participantCount: number): Promise<void> {
  await db.collection('rooms').doc(roomId).set(
    {
      participantCount,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

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
    const { roomId, token, roomCode } = payload;

    if (!roomId || !token) {
      socket.emit('error', { message: 'roomId y token son requeridos' });
      return;
    }

    try {
      const decoded = await auth.verifyIdToken(token);

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

      const roomDoc = await db.collection('rooms').doc(roomId).get();
      if (!roomDoc.exists) {
        socket.emit('error', { message: 'La sala no existe' });
        return;
      }

      const roomData = roomDoc.data()!;

      // Si la sala es privada, solo el host puede entrar directamente por roomId.
      // Cualquier otro usuario debe unirse por roomCode (validado en el frontend).
      if (roomData.isPrivate && roomData.hostUid !== decoded.uid) {
        if (!roomCode || roomCode.toUpperCase().trim() !== roomData.roomCode) {
          socket.emit('error', { message: 'Esta sala es privada. El código de sala es incorrecto.' });
          return;
        }
      }

      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          roomId,
          participants: new Map(),
        });
      }

      const room = rooms.get(roomId)!;
      const maxParticipants = roomData.maxParticipants ?? 10;
      if (room.participants.size >= maxParticipants && !room.participants.has(decoded.uid)) {
        socket.emit('error', { message: 'La sala está llena' });
        return;
      }

      if (room.participants.has(decoded.uid)) {
        const oldUser = room.participants.get(decoded.uid)!;
        room.participants.delete(decoded.uid);
        socketUserMap.delete(oldUser.socketId);
        socket.to(roomId).emit('participant_left', {
          uid: oldUser.uid,
          socketId: oldUser.socketId,
          displayName: oldUser.displayName,
        });
      }

      room.participants.set(decoded.uid, userInfo);
      socketUserMap.set(socket.id, userInfo);
      await socket.join(roomId);
      await syncRoomParticipantCount(roomId, room.participants.size);

      console.log(`[Room] ${userInfo.displayName} se unió a sala ${roomId} (${room.participants.size} participantes)`);

      const participantsList = Array.from(room.participants.values());
      socket.emit('room_joined', {
        roomId,
        user: userInfo,
        participants: participantsList,
        room: roomData,
      });

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

  socket.on('leave_room', async (payload: { roomId: string }) => {
    await handleLeaveRoom(io, socket, rooms, socketUserMap, payload.roomId);
  });

  socket.on('disconnect', async (reason) => {
    const user = socketUserMap.get(socket.id);
    if (!user) return;

    console.log(`[Socket] ${user.displayName} desconectado: ${reason}`);

    for (const [roomId, room] of rooms.entries()) {
      if (room.participants.has(user.uid)) {
        await handleLeaveRoom(io, socket, rooms, socketUserMap, roomId);
      }
    }

    socketUserMap.delete(socket.id);
  });
};

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
  socketUserMap.delete(socket.id);
  await socket.leave(roomId);
  await syncRoomParticipantCount(roomId, room.participants.size);

  console.log(`[Room] ${user.displayName} salió de sala ${roomId} (${room.participants.size} restantes)`);

  io.to(roomId).emit('participant_left', {
    uid: user.uid,
    socketId: socket.id,
    displayName: user.displayName,
  });

  if (room.participants.size === 0) {
    rooms.delete(roomId);
    console.log(`[Room] Sala ${roomId} vacía, limpiada de memoria`);
  }
}