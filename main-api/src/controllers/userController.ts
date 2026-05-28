import { Response } from 'express';
import { db, auth } from '../config/firebase';
import { AuthRequest } from '../middleware/auth';

const USERS_COLLECTION = 'users';
const USERNAMES_COLLECTION = 'usernames';
const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
const INSTITUTIONAL_DOMAIN = '@correounivalle.edu.co';

const normalizeUsername = (username: unknown): string => {
  if (typeof username !== 'string') return '';
  return username.trim().toLowerCase();
};

const validateUsername = (username: string): string | null => {
  if (!username) return 'username es requerido';
  if (!USERNAME_PATTERN.test(username)) {
    return 'El username debe tener 3 a 20 caracteres y solo puede incluir letras minúsculas, números y guion bajo';
  }
  return null;
};

const isInstitutionalEmail = (email?: string | null): boolean => {
  return Boolean(email?.trim().toLowerCase().endsWith(INSTITUTIONAL_DOMAIN));
};

const createHttpError = (message: string, statusCode: number): Error & { statusCode: number } => {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
};

/**
 * GET /api/users/me
 * Obtiene el perfil del usuario autenticado desde Firestore.
 */
export const getMyProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const userDoc = await db.collection(USERS_COLLECTION).doc(uid).get();

    if (!userDoc.exists) {
      res.status(404).json({ success: false, error: 'Perfil no encontrado' });
      return;
    }

    res.json({ success: true, data: { id: userDoc.id, ...userDoc.data() } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/users/username/:username/available
 * Verifica si un username esta disponible para el usuario autenticado.
 */
export const getUsernameAvailability = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const username = normalizeUsername(req.params.username);
    const validationError = validateUsername(username);

    if (validationError) {
      res.status(400).json({ success: false, error: validationError });
      return;
    }

    const usernameDoc = await db.collection(USERNAMES_COLLECTION).doc(username).get();
    const ownerUid = usernameDoc.exists ? usernameDoc.data()?.uid : null;
    const available = !usernameDoc.exists || ownerUid === uid;

    res.json({
      success: true,
      data: {
        username,
        available,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/users/profile
 * Crea o actualiza el perfil del usuario en Firestore.
 * Reserva el username en la coleccion usernames para bloquear duplicados.
 */
export const createOrUpdateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { displayName, photoURL } = req.body;
    const username = normalizeUsername(req.body.username);

    if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
      res.status(400).json({ success: false, error: 'displayName es requerido' });
      return;
    }

    const validationError = validateUsername(username);
    if (validationError) {
      res.status(400).json({ success: false, error: validationError });
      return;
    }

    if (!isInstitutionalEmail(req.user!.email)) {
      res.status(400).json({ success: false, error: `Usa tu correo institucional ${INSTITUTIONAL_DOMAIN}` });
      return;
    }

    const userDocRef = db.collection(USERS_COLLECTION).doc(uid);
    const usernameDocRef = db.collection(USERNAMES_COLLECTION).doc(username);

    const result = await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userDocRef);
      const usernameDoc = await transaction.get(usernameDocRef);

      if (usernameDoc.exists && usernameDoc.data()?.uid !== uid) {
        throw createHttpError('El username ya está en uso', 409);
      }

      const previousUsername = userDoc.exists ? userDoc.data()?.username : null;
      const now = new Date().toISOString();

      const profileData = {
        uid,
        email: req.user!.email ?? '',
        displayName: displayName.trim(),
        username,
        photoURL: photoURL ?? null,
        updatedAt: now,
        ...(userDoc.exists ? {} : { createdAt: now }),
      };

      transaction.set(
        usernameDocRef,
        {
          uid,
          username,
          updatedAt: now,
          ...(usernameDoc.exists ? {} : { createdAt: now }),
        },
        { merge: true }
      );

      if (previousUsername && previousUsername !== username) {
        const previousUsernameDocRef = db.collection(USERNAMES_COLLECTION).doc(previousUsername);
        transaction.delete(previousUsernameDocRef);
      }

      transaction.set(userDocRef, profileData, { merge: true });

      return {
        profileData,
        existed: userDoc.exists,
      };
    });

    const statusCode = result.existed ? 200 : 201;
    res.status(statusCode).json({
      success: true,
      message: result.existed ? 'Perfil actualizado' : 'Perfil creado',
      data: result.profileData,
    });
  } catch (error: any) {
    res.status(error.statusCode ?? 500).json({ success: false, error: error.message });
  }
};

/**
 * PUT /api/users/me
 * Actualiza campos del perfil (displayName, username, photoURL).
 * Mantiene la reserva unica del username en Firestore.
 */
export const updateMyProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { displayName, photoURL } = req.body;
    const username = normalizeUsername(req.body.username);

    if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
      res.status(400).json({ success: false, error: 'displayName es requerido' });
      return;
    }

    const validationError = validateUsername(username);
    if (validationError) {
      res.status(400).json({ success: false, error: validationError });
      return;
    }

    const userDocRef = db.collection(USERS_COLLECTION).doc(uid);
    const usernameDocRef = db.collection(USERNAMES_COLLECTION).doc(username);

    const updatedProfile = await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userDocRef);

      if (!userDoc.exists) {
        throw createHttpError('Perfil no encontrado', 404);
      }

      const usernameDoc = await transaction.get(usernameDocRef);

      if (usernameDoc.exists && usernameDoc.data()?.uid !== uid) {
        throw createHttpError('El username ya está en uso', 409);
      }

      const previousData = userDoc.data()!;
      const previousUsername = previousData.username;
      const now = new Date().toISOString();

      const profileData = {
        ...previousData,
        displayName: displayName.trim(),
        username,
        photoURL: photoURL ?? null,
        updatedAt: now,
      };

      transaction.set(usernameDocRef, { uid, username, updatedAt: now }, { merge: true });

      if (previousUsername && previousUsername !== username) {
        transaction.delete(db.collection(USERNAMES_COLLECTION).doc(previousUsername));
      }

      transaction.set(userDocRef, profileData, { merge: true });

      return profileData;
    });

    // Also update Firebase Auth display name. Synthetic avatar ids are stored in Firestore only.
    const authPhotoURL = typeof photoURL === 'string' && photoURL.startsWith('http') ? photoURL : undefined;
    await auth.updateUser(uid, { displayName: displayName.trim(), photoURL: authPhotoURL });

    res.json({ success: true, message: 'Perfil actualizado', data: updatedProfile });
  } catch (error: any) {
    res.status(error.statusCode ?? 500).json({ success: false, error: error.message });
  }
};

/**
 * DELETE /api/users/me
 * Elimina la cuenta del usuario (Firestore + Firebase Auth).
 */
export const deleteMyAccount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const userDocRef = db.collection(USERS_COLLECTION).doc(uid);
    const userDoc = await userDocRef.get();
    const username = userDoc.exists ? userDoc.data()?.username : null;

    await db.runTransaction(async (transaction) => {
      transaction.delete(userDocRef);
      if (username) {
        transaction.delete(db.collection(USERNAMES_COLLECTION).doc(username));
      }
    });

    // Delete user from Firebase Auth
    await auth.deleteUser(uid);

    res.json({ success: true, message: 'Cuenta eliminada correctamente' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/users/:uid
 * Obtiene el perfil público de un usuario por UID.
 */
export const getUserById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { uid } = req.params;
    const userDoc = await db.collection(USERS_COLLECTION).doc(uid).get();

    if (!userDoc.exists) {
      res.status(404).json({ success: false, error: 'Usuario no encontrado' });
      return;
    }

    const data = userDoc.data()!;
    // Return only public fields
    res.json({
      success: true,
      data: {
        uid: data.uid,
        displayName: data.displayName,
        username: data.username,
        photoURL: data.photoURL,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
