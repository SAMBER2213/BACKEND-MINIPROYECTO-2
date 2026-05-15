import { Response } from 'express';
import { db } from '../config/firebase';
import { AuthRequest } from '../middleware/auth';
import { FieldValue } from 'firebase-admin/firestore';

const ROOMS_COLLECTION = 'rooms';

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

    // Get host display name
    const userDoc = await db.collection('users').doc(uid).get();
    const hostName = userDoc.exists ? userDoc.data()!.displayName : 'Usuario';

    const now = new Date().toISOString();
    const roomData = {
      name: name.trim(),
      description: description?.trim() ?? '',
      hostUid: uid,
      hostName,
      isPrivate: isPrivate ?? false,
      maxParticipants: maxParticipants ?? 10,
      participantCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db.collection(ROOMS_COLLECTION).add(roomData);

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
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    const rooms = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

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

    const snapshot = await db
      .collection(ROOMS_COLLECTION)
      .where('hostUid', '==', uid)
      .orderBy('createdAt', 'desc')
      .get();

    const rooms = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

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
    if (isPrivate !== undefined) updateData.isPrivate = isPrivate;
    if (maxParticipants) updateData.maxParticipants = maxParticipants;

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

    // Verify room exists
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
      .reverse(); // Oldest first

    res.json({ success: true, data: messages });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
