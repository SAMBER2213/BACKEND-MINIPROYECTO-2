import { Response } from 'express';
import { db, auth } from '../config/firebase';
import { AuthRequest } from '../middleware/auth';

const USERS_COLLECTION = 'users';

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
 * POST /api/users/profile
 * Crea o actualiza el perfil del usuario en Firestore.
 * Se llama después del registro (manual o Google).
 */
export const createOrUpdateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { displayName, username, photoURL } = req.body;

    if (!displayName || !username) {
      res.status(400).json({ success: false, error: 'displayName y username son requeridos' });
      return;
    }

    // Check username uniqueness
    const usernameQuery = await db
      .collection(USERS_COLLECTION)
      .where('username', '==', username)
      .limit(1)
      .get();

    if (!usernameQuery.empty && usernameQuery.docs[0].id !== uid) {
      res.status(409).json({ success: false, error: 'El username ya está en uso' });
      return;
    }

    const now = new Date().toISOString();
    const userDocRef = db.collection(USERS_COLLECTION).doc(uid);
    const existingDoc = await userDocRef.get();

    const profileData = {
      uid,
      email: req.user!.email ?? '',
      displayName,
      username,
      photoURL: photoURL ?? null,
      updatedAt: now,
      ...(existingDoc.exists ? {} : { createdAt: now }),
    };

    await userDocRef.set(profileData, { merge: true });

    const statusCode = existingDoc.exists ? 200 : 201;
    res.status(statusCode).json({
      success: true,
      message: existingDoc.exists ? 'Perfil actualizado' : 'Perfil creado',
      data: profileData,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * PUT /api/users/me
 * Actualiza campos del perfil (displayName, photoURL).
 */
export const updateMyProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { displayName, photoURL } = req.body;

    if (!displayName) {
      res.status(400).json({ success: false, error: 'displayName es requerido' });
      return;
    }

    const updateData = {
      displayName,
      photoURL: photoURL ?? null,
      updatedAt: new Date().toISOString(),
    };

    await db.collection(USERS_COLLECTION).doc(uid).update(updateData);

    // Also update Firebase Auth display name
    await auth.updateUser(uid, { displayName, photoURL: photoURL ?? undefined });

    res.json({ success: true, message: 'Perfil actualizado', data: updateData });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * DELETE /api/users/me
 * Elimina la cuenta del usuario (Firestore + Firebase Auth).
 */
export const deleteMyAccount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;

    // Delete user document from Firestore
    await db.collection(USERS_COLLECTION).doc(uid).delete();

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
