import { Response } from 'express';
import { db } from '../config/firebase';
import { AuthRequest } from '../middleware/auth';

const ROOMS_COLLECTION = 'rooms';

function buildRoomCode(roomId: string): string {
  return roomId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase();
}

/**
 * POST /api/rooms
 * Crea una nueva sala de estudio.
 */
export const createRoom = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { name, description, isPrivate, maxParticipants } = req.body;

    if (!name || name.trim().length < 3) {
      res.status(400).json({ success: false, error: 'El nombre de la sala debe tener al menos 3 caracteres' });
      return;
    }

    const parsedMaxParticipants = Number(maxParticipants ?? 10);
    if (Number.isNaN(parsedMaxParticipants) || parsedMaxParticipants < 2 || parsedMaxParticipants > 20) {
      res.status(400).json({ success: false, error: 'La capacidad de la sala debe estar entre 2 y 20 participantes' });
      return;
    }

    const userDoc = await db.collection('users').doc(uid).get();
    const hostName = userDoc.exists ? userDoc.data()!.displayName : 'Usuario';

    const docRef = db.collection(ROOMS_COLLECTION).doc();
    const now = new Date().toISOString();
    const roomCode = buildRoomCode(docRef.id);

    const roomData = {
      name: name.trim(),
      description: description?.trim() ?? '',
      roomCode,
      hostUid: uid,
      hostName,
      hostRole: 'Administrador',
      isPrivate: Boolean(isPrivate),
      maxParticipants: parsedMaxParticipants,
      participantCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    await docRef.set(roomData);

    res.status(201).json({
      success: true,
      message: 'Sala creada exitosamente',
      data: { id: docRef.id, ...roomData },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/rooms
 * Lista todas las salas públicas (con paginación simple).
 */
export const listRooms = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;

    const snapshot = await db
      .collection(ROOMS_COLLECTION)
      .where('isPrivate', '==', false)
      .limit(limit)
      .get();

    const rooms = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a: any, b: any) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));

    res.json({ success: true, data: rooms, total: rooms.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/rooms/my
 * Lista las salas creadas por el usuario autenticado.
 */
export const getMyRooms = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;

    // Firestore requiere un indice compuesto si se combina where(hostUid) con orderBy(createdAt).
    // Para que el Sprint 2 funcione sin configurar indices manuales, se consulta por hostUid
    // y se ordena en memoria por fecha de creacion.
    const snapshot = await db
      .collection(ROOMS_COLLECTION)
      .where('hostUid', '==', uid)
      .get();

    const rooms = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a: any, b: any) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));

    res.json({ success: true, data: rooms });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/rooms/:roomId
 * Obtiene los detalles de una sala específica.
 */
export const getRoomById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { roomId } = req.params;
    const doc = await db.collection(ROOMS_COLLECTION).doc(roomId).get();

    if (!doc.exists) {
      res.status(404).json({ success: false, error: 'Sala no encontrada' });
      return;
    }

    res.json({ success: true, data: { id: doc.id, ...doc.data() } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * PUT /api/rooms/:roomId
 * Edita una sala. Solo el anfitrión puede hacerlo.
 */
export const updateRoom = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { roomId } = req.params;
    const { name, description, isPrivate, maxParticipants } = req.body;

    const doc = await db.collection(ROOMS_COLLECTION).doc(roomId).get();

    if (!doc.exists) {
      res.status(404).json({ success: false, error: 'Sala no encontrada' });
      return;
    }

    if (doc.data()!.hostUid !== uid) {
      res.status(403).json({ success: false, error: 'Solo el anfitrión puede editar la sala' });
      return;
    }

    const updateData: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (name) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (isPrivate !== undefined) updateData.isPrivate = Boolean(isPrivate);
    if (maxParticipants !== undefined) {
      const parsedMaxParticipants = Number(maxParticipants);
      if (Number.isNaN(parsedMaxParticipants) || parsedMaxParticipants < 2 || parsedMaxParticipants > 20) {
        res.status(400).json({ success: false, error: 'La capacidad de la sala debe estar entre 2 y 20 participantes' });
        return;
      }
      updateData.maxParticipants = parsedMaxParticipants;
    }

    await db.collection(ROOMS_COLLECTION).doc(roomId).update(updateData);

    res.json({ success: true, message: 'Sala actualizada', data: updateData });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * DELETE /api/rooms/:roomId
 * Elimina una sala. Solo el anfitrión puede hacerlo.
 */
export const deleteRoom = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { roomId } = req.params;

    const doc = await db.collection(ROOMS_COLLECTION).doc(roomId).get();

    if (!doc.exists) {
      res.status(404).json({ success: false, error: 'Sala no encontrada' });
      return;
    }

    if (doc.data()!.hostUid !== uid) {
      res.status(403).json({ success: false, error: 'Solo el anfitrión puede eliminar la sala' });
      return;
    }

    await db.collection(ROOMS_COLLECTION).doc(roomId).delete();

    res.json({ success: true, message: 'Sala eliminada correctamente' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/rooms/:roomId/messages
 * Obtiene el historial de mensajes de una sala (últimos 50).
 */
export const getRoomMessages = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { roomId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    const roomDoc = await db.collection(ROOMS_COLLECTION).doc(roomId).get();
    if (!roomDoc.exists) {
      res.status(404).json({ success: false, error: 'Sala no encontrada' });
      return;
    }

    const messagesSnapshot = await db
      .collection(ROOMS_COLLECTION)
      .doc(roomId)
      .collection('messages')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    const messages = messagesSnapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .reverse();

    res.json({ success: true, data: messages });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
