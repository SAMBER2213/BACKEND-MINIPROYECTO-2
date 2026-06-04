import { Response } from 'express';
import { db } from '../config/firebase';
import { AuthRequest } from '../middleware/auth';

const ROOMS_COLLECTION = 'rooms';
const MIN_PARTICIPANTS = 2;
const MAX_PARTICIPANTS = 20;
const MAX_DESCRIPTION_LENGTH = 300;

function buildRoomCode(roomId: string): string {
  return roomId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase();
}

function normalizeRoomKey(value: string): string {
  return value.trim();
}

function normalizeRoomCode(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

function parseMessageLimit(value: unknown): number {
  const parsed = Number(value ?? 50);
  if (!Number.isInteger(parsed) || parsed < 1) return 50;
  return Math.min(parsed, 100);
}

function getProvidedRoomCode(req: AuthRequest): string {
  const queryCode = typeof req.query.roomCode === 'string' ? req.query.roomCode : '';
  const headerCode = typeof req.headers['x-room-code'] === 'string' ? req.headers['x-room-code'] : '';
  return normalizeRoomCode(queryCode || headerCode);
}

function canReadRoomHistory(roomData: FirebaseFirestore.DocumentData, uid: string, providedRoomCode: string): boolean {
  if (!roomData.isPrivate) return true;
  if (roomData.hostUid === uid) return true;
  return Boolean(providedRoomCode && providedRoomCode === roomData.roomCode);
}

function getStringField(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.trim();
}

function validateBooleanField(value: unknown, fieldName: string): string | null {
  if (value === undefined || typeof value === 'boolean') return null;
  return `${fieldName} debe ser booleano`;
}

function validateRoomName(name: unknown, required: boolean): { value?: string; error?: string } {
  const cleanName = getStringField(name);

  if (!cleanName) {
    return required || name !== undefined
      ? { error: 'El nombre de la sala debe tener al menos 3 caracteres' }
      : {};
  }

  if (cleanName.length < 3) {
    return { error: 'El nombre de la sala debe tener al menos 3 caracteres' };
  }

  return { value: cleanName };
}

function validateDescription(description: unknown): { value?: string; error?: string } {
  if (description === undefined) return {};
  if (typeof description !== 'string') return { error: 'La descripción debe ser texto' };

  const cleanDescription = description.trim();
  if (cleanDescription.length > MAX_DESCRIPTION_LENGTH) {
    return { error: `La descripción no puede superar ${MAX_DESCRIPTION_LENGTH} caracteres` };
  }

  return { value: cleanDescription };
}

function validateMaxParticipants(maxParticipants: unknown): { value?: number; error?: string } {
  if (maxParticipants === undefined) return {};

  const parsedMaxParticipants = Number(maxParticipants);
  if (
    !Number.isInteger(parsedMaxParticipants) ||
    parsedMaxParticipants < MIN_PARTICIPANTS ||
    parsedMaxParticipants > MAX_PARTICIPANTS
  ) {
    return { error: `La capacidad de la sala debe estar entre ${MIN_PARTICIPANTS} y ${MAX_PARTICIPANTS} participantes` };
  }

  return { value: parsedMaxParticipants };
}

function buildSafeRoomResponse(
  doc: FirebaseFirestore.DocumentSnapshot,
  requesterUid: string,
  revealRoomCode = false
): Record<string, any> {
  const data = doc.data() ?? {};
  const isHost = data.hostUid === requesterUid;
  const room: Record<string, any> = {
    id: doc.id,
    ...data,
    isHost,
  };

  // En salas privadas el código solo se muestra al anfitrión o al usuario que ya lo validó por /join.
  if (room.isPrivate && !isHost && !revealRoomCode) {
    delete room.roomCode;
  }

  return room;
}

async function deleteRoomDocumentAndMessages(roomId: string): Promise<void> {
  const roomRef = db.collection(ROOMS_COLLECTION).doc(roomId);
  const messagesRef = roomRef.collection('messages');
  let snapshot = await messagesRef.limit(500).get();

  while (!snapshot.empty) {
    const batch = db.batch();
    snapshot.docs.forEach((messageDoc) => batch.delete(messageDoc.ref));
    await batch.commit();
    snapshot = await messagesRef.limit(500).get();
  }

  await roomRef.delete();
}

/**
 * POST /api/rooms
 * Crea una nueva sala de estudio.
 */
export const createRoom = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { name, description, isPrivate, maxParticipants } = req.body;

    const nameValidation = validateRoomName(name, true);
    if (nameValidation.error) {
      res.status(400).json({ success: false, error: nameValidation.error });
      return;
    }

    const descriptionValidation = validateDescription(description ?? '');
    if (descriptionValidation.error) {
      res.status(400).json({ success: false, error: descriptionValidation.error });
      return;
    }

    const privateValidationError = validateBooleanField(isPrivate, 'isPrivate');
    if (privateValidationError) {
      res.status(400).json({ success: false, error: privateValidationError });
      return;
    }

    const maxParticipantsValidation = validateMaxParticipants(maxParticipants ?? 10);
    if (maxParticipantsValidation.error) {
      res.status(400).json({ success: false, error: maxParticipantsValidation.error });
      return;
    }

    const userDoc = await db.collection('users').doc(uid).get();
    const hostName = userDoc.exists ? userDoc.data()!.displayName : 'Usuario';

    const docRef = db.collection(ROOMS_COLLECTION).doc();
    const now = new Date().toISOString();
    const roomCode = buildRoomCode(docRef.id);

    const roomData = {
      name: nameValidation.value!,
      description: descriptionValidation.value ?? '',
      roomCode,
      hostUid: uid,
      hostName,
      hostRole: 'Administrador',
      isPrivate: Boolean(isPrivate),
      maxParticipants: maxParticipantsValidation.value ?? 10,
      participantCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    await docRef.set(roomData);

    res.status(201).json({
      success: true,
      message: 'Sala creada exitosamente',
      data: { id: docRef.id, ...roomData, isHost: true },
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
    const uid = req.user!.uid;
    const limit = parseInt(req.query.limit as string, 10) || 20;

    const snapshot = await db
      .collection(ROOMS_COLLECTION)
      .where('isPrivate', '==', false)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    const rooms = snapshot.docs.map((doc) => buildSafeRoomResponse(doc, uid, true));

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

    // Usa el índice compuesto (hostUid ASC + createdAt DESC) definido en firestore.indexes.json.
    const snapshot = await db
      .collection(ROOMS_COLLECTION)
      .where('hostUid', '==', uid)
      .orderBy('createdAt', 'desc')
      .get();

    const rooms = snapshot.docs.map((doc) => buildSafeRoomResponse(doc, uid, true));

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
    const uid = req.user!.uid;
    const { roomId } = req.params;
    const doc = await db.collection(ROOMS_COLLECTION).doc(roomId).get();

    if (!doc.exists) {
      res.status(404).json({ success: false, error: 'Sala no encontrada' });
      return;
    }

    res.json({ success: true, data: buildSafeRoomResponse(doc, uid) });
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

    const roomRef = db.collection(ROOMS_COLLECTION).doc(roomId);
    const doc = await roomRef.get();

    if (!doc.exists) {
      res.status(404).json({ success: false, error: 'Sala no encontrada' });
      return;
    }

    const currentRoom = doc.data()!;
    if (currentRoom.hostUid !== uid) {
      res.status(403).json({ success: false, error: 'Solo el anfitrión puede editar la sala' });
      return;
    }

    if (name === undefined && description === undefined && isPrivate === undefined && maxParticipants === undefined) {
      res.status(400).json({ success: false, error: 'Envía al menos un campo para actualizar' });
      return;
    }

    const updateData: Record<string, any> = { updatedAt: new Date().toISOString() };

    const nameValidation = validateRoomName(name, false);
    if (nameValidation.error) {
      res.status(400).json({ success: false, error: nameValidation.error });
      return;
    }
    if (nameValidation.value !== undefined) updateData.name = nameValidation.value;

    const descriptionValidation = validateDescription(description);
    if (descriptionValidation.error) {
      res.status(400).json({ success: false, error: descriptionValidation.error });
      return;
    }
    if (descriptionValidation.value !== undefined) updateData.description = descriptionValidation.value;

    const privateValidationError = validateBooleanField(isPrivate, 'isPrivate');
    if (privateValidationError) {
      res.status(400).json({ success: false, error: privateValidationError });
      return;
    }
    if (isPrivate !== undefined) updateData.isPrivate = isPrivate;

    const maxParticipantsValidation = validateMaxParticipants(maxParticipants);
    if (maxParticipantsValidation.error) {
      res.status(400).json({ success: false, error: maxParticipantsValidation.error });
      return;
    }
    if (maxParticipantsValidation.value !== undefined) {
      const currentParticipants = Number(currentRoom.participantCount ?? 0);
      if (maxParticipantsValidation.value < currentParticipants) {
        res.status(400).json({
          success: false,
          error: `No puedes bajar la capacidad por debajo de los ${currentParticipants} participantes conectados`,
        });
        return;
      }
      updateData.maxParticipants = maxParticipantsValidation.value;
    }

    await roomRef.update(updateData);
    const updatedDoc = await roomRef.get();

    res.json({
      success: true,
      message: 'Sala actualizada correctamente',
      data: buildSafeRoomResponse(updatedDoc, uid, true),
    });
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

    await deleteRoomDocumentAndMessages(roomId);

    res.json({ success: true, message: 'Sala eliminada correctamente' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/rooms/join/:roomCode
 * Busca una sala por su roomCode (código corto) o por su ID de documento.
 * Usado por el frontend para que el usuario pegue el código/ID y sea redirigido.
 */
export const getRoomByCode = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const roomKey = normalizeRoomKey(req.params.roomCode ?? '');
    const roomCode = normalizeRoomCode(roomKey);

    if (!roomKey) {
      res.status(400).json({ success: false, error: 'ID o código de sala requerido' });
      return;
    }

    let doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot | null = null;
    let matchedByRoomCode = false;

    const codeSnapshot = await db
      .collection(ROOMS_COLLECTION)
      .where('roomCode', '==', roomCode)
      .limit(1)
      .get();

    if (!codeSnapshot.empty) {
      doc = codeSnapshot.docs[0];
      matchedByRoomCode = true;
    } else {
      const docById = await db.collection(ROOMS_COLLECTION).doc(roomKey).get();
      if (docById.exists) doc = docById;
    }

    if (!doc || !doc.exists) {
      res.status(404).json({ success: false, error: 'No existe ninguna sala con ese ID o código' });
      return;
    }

    const roomData = doc.data()!;
    const isHost = roomData.hostUid === uid;
    if (roomData.isPrivate && !isHost && !matchedByRoomCode) {
      res.status(403).json({ success: false, error: 'Esta sala es privada. Ingresa el código corto compartido por el anfitrión.' });
      return;
    }

    res.json({ success: true, data: buildSafeRoomResponse(doc, uid, matchedByRoomCode || isHost) });
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
    const uid = req.user!.uid;
    const { roomId } = req.params;
    const limit = parseMessageLimit(req.query.limit);
    const providedRoomCode = getProvidedRoomCode(req);

    const roomRef = db.collection(ROOMS_COLLECTION).doc(roomId);
    const roomDoc = await roomRef.get();
    if (!roomDoc.exists) {
      res.status(404).json({ success: false, error: 'Sala no encontrada' });
      return;
    }

    const roomData = roomDoc.data()!;
    if (!canReadRoomHistory(roomData, uid, providedRoomCode)) {
      res.status(403).json({
        success: false,
        error: 'No tienes permiso para leer el historial de esta sala privada. Ingresa con el codigo valido.',
      });
      return;
    }

    const messagesSnapshot = await roomRef
      .collection('messages')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    const messages = messagesSnapshot.docs
      .map((messageDoc) => ({ id: messageDoc.id, ...messageDoc.data() }))
      .reverse();

    res.json({
      success: true,
      data: messages,
      meta: {
        roomId,
        count: messages.length,
        limit,
        source: 'Firestore',
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
