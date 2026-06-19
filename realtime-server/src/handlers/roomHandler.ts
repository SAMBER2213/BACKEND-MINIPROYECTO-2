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
 * Sprint 4: ahora acepta peerId opcional en join_room para PeerJS (TS-03).
 */
export const registerRoomHandlers = (
  io: Server,
  socket: Socket,
  rooms: Map<string, RoomState>,
  socketUserMap: Map<string, UserInfo>
): void => {

  /**
   * Evento: 'join_room'
   * Autentica al usuario con su Firebase ID Token y lo une a la sala.
   * Si la sala es privada, verifica el roomCode. Soporta reconexión limpiando
   * el estado anterior del mismo usuario.
   *
   * @listens join_room
   * @param payload.roomId - ID de la sala en Firestore
   * @param payload.token - Firebase ID Token del usuario autenticado
   * @param payload.roomCode - Código de acceso (requerido si la sala es privada)
   * @param payload.peerId - PeerJS peer ID del cliente para llamadas P2P (Sprint 4, opcional)
   *
   * @fires room_joined - Solo al usuario que se une: sala, perfil propio y lista de participantes
   * @fires participant_joined - Al resto de la sala: nuevo participante con su peerId
   * @fires participant_left - Al resto, si había sesión previa del mismo usuario (reconexión)
   * @fires error - Al cliente si el token es inválido, la sala no existe o está llena
   */
  socket.on('join_room', async (payload: JoinRoomPayload) => {
    const { roomId, token, roomCode, peerId } = payload;

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
        peerId: peerId ?? null,   // ← Sprint 4
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

      // Si el usuario ya estaba conectado (reconexión), limpiar estado anterior
      if (room.participants.has(decoded.uid)) {
        const oldUser = room.participants.get(decoded.uid)!;
        room.participants.delete(decoded.uid);
        socketUserMap.delete(oldUser.socketId);
        socket.to(roomId).emit('participant_left', {
          uid: oldUser.uid,
          socketId: oldUser.socketId,
          displayName: oldUser.displayName,
          peerId: oldUser.peerId,  // ← Sprint 4
        });
      }

      room.participants.set(decoded.uid, userInfo);
      socketUserMap.set(socket.id, userInfo);
      await socket.join(roomId);
      await syncRoomParticipantCount(roomId, room.participants.size);

      console.log(
        `[Room] ${userInfo.displayName} se unió a sala ${roomId}` +
        ` (${room.participants.size} participantes)` +
        (userInfo.peerId ? ` peerId=${userInfo.peerId}` : '')
      );

      const participantsList = Array.from(room.participants.values());

      // Enviar al usuario que se unió: sala actual + lista completa con peerIds
      socket.emit('room_joined', {
        roomId,
        user: userInfo,
        participants: participantsList,
        room: roomData,
      });

      // Notificar al resto: nuevo participante (incluye peerId si ya lo tiene)
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
   * El cliente abandona voluntariamente la sala.
   *
   * @listens leave_room
   * @param payload.roomId - ID de la sala a abandonar
   * @fires participant_left - A todos en la sala con uid, socketId y peerId del usuario
   */
  socket.on('leave_room', async (payload: { roomId: string }) => {
    await handleLeaveRoom(io, socket, rooms, socketUserMap, payload.roomId);
  });

  /**
   * Evento nativo de Socket.io emitido cuando el cliente se desconecta (cierra pestaña, red caída, etc.).
   * Elimina al usuario de todas las salas en las que estuviera participando.
   *
   * @listens disconnect
   * @fires participant_left - A cada sala activa del usuario con su peerId incluido
   */
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

  // Sprint 4: incluir peerId para que el frontend cierre la conexión P2P
  io.to(roomId).emit('participant_left', {
    uid: user.uid,
    socketId: socket.id,
    displayName: user.displayName,
    peerId: user.peerId ?? null,
  });

  if (room.participants.size === 0) {
    rooms.delete(roomId);
    console.log(`[Room] Sala ${roomId} vacía, limpiada de memoria`);
  }
}