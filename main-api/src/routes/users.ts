import { Router } from 'express';
import { verifyToken } from '../middleware/auth';
import {
  getMyProfile,
  createOrUpdateProfile,
  updateMyProfile,
  deleteMyAccount,
  getUserById,
} from '../controllers/userController';

const router = Router();

/**
 * @swagger
 * /api/users/me:
 *   get:
 *     summary: Obtener perfil propio
 *     description: Retorna el perfil completo del usuario autenticado desde Firestore.
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil del usuario
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/UserProfile'
 *       401:
 *         description: No autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Perfil no encontrado
 */
router.get('/me', verifyToken, getMyProfile);

/**
 * @swagger
 * /api/users/profile:
 *   post:
 *     summary: Crear o actualizar perfil
 *     description: |
 *       Crea el perfil en Firestore si no existe, o lo actualiza si ya existe.
 *       Se llama obligatoriamente después del registro (manual o Google).
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - displayName
 *               - username
 *             properties:
 *               displayName:
 *                 type: string
 *                 example: Juan García
 *               username:
 *                 type: string
 *                 example: juangarcia
 *               photoURL:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Perfil creado
 *       200:
 *         description: Perfil actualizado
 *       409:
 *         description: Username ya en uso
 */
router.post('/profile', verifyToken, createOrUpdateProfile);

/**
 * @swagger
 * /api/users/me:
 *   put:
 *     summary: Actualizar perfil propio
 *     description: Actualiza el displayName y/o photoURL del usuario.
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - displayName
 *             properties:
 *               displayName:
 *                 type: string
 *                 example: Juan García Actualizado
 *               photoURL:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Perfil actualizado correctamente
 *       400:
 *         description: Datos inválidos
 */
router.put('/me', verifyToken, updateMyProfile);

/**
 * @swagger
 * /api/users/me:
 *   delete:
 *     summary: Eliminar cuenta
 *     description: |
 *       Elimina permanentemente la cuenta del usuario.
 *       Borra el documento de Firestore Y el usuario de Firebase Auth.
 *       **Esta acción es irreversible.**
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Cuenta eliminada correctamente
 *       401:
 *         description: No autenticado
 */
router.delete('/me', verifyToken, deleteMyAccount);

/**
 * @swagger
 * /api/users/{uid}:
 *   get:
 *     summary: Obtener perfil público de un usuario
 *     description: Retorna los datos públicos (nombre, username, foto) de cualquier usuario.
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: uid
 *         required: true
 *         schema:
 *           type: string
 *         description: UID de Firebase del usuario
 *     responses:
 *       200:
 *         description: Perfil público del usuario
 *       404:
 *         description: Usuario no encontrado
 */
router.get('/:uid', verifyToken, getUserById);

export default router;
