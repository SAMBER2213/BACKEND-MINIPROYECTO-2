import { Router } from 'express';
import { verifyToken } from '../middleware/auth';
import {
  createRoom,
  listRooms,
  getMyRooms,
  getRoomById,
  getRoomByCode,
  updateRoom,
  deleteRoom,
  getRoomMessages,
} from '../controllers/roomController';

const router = Router();

/**
 * @swagger
 * /api/rooms:
 *   get:
 *     summary: Listar salas públicas
 *     description: Retorna todas las salas públicas ordenadas por fecha de creación.
 *     tags: [Rooms]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Número máximo de salas a retornar
 *     responses:
 *       200:
 *         description: Lista de salas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Room'
 *                 total:
 *                   type: integer
 */
router.get('/', verifyToken, listRooms);

/**
 * @swagger
 * /api/rooms/my:
 *   get:
 *     summary: Mis salas
 *     description: Retorna las salas creadas por el usuario autenticado.
 *     tags: [Rooms]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Salas del usuario
 */
router.get('/my', verifyToken, getMyRooms);

/**
 * @swagger
 * /api/rooms/join/{roomCode}:
 *   get:
 *     summary: Buscar sala por código corto
 *     description: Devuelve el ID y datos de la sala correspondiente al roomCode. Usado para unirse mediante el código de 8 caracteres.
 *     tags: [Rooms]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomCode
 *         required: true
 *         schema:
 *           type: string
 *           example: ABCD1234
 *     responses:
 *       200:
 *         description: Sala encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Room'
 *       404:
 *         description: No existe sala con ese código
 */
router.get('/join/:roomCode', verifyToken, getRoomByCode);

/**
 * @swagger
 * /api/rooms:
 *   post:
 *     summary: Crear sala de estudio
 *     description: Crea una nueva sala de estudio. El usuario autenticado se convierte en anfitrión.
 *     tags: [Rooms]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 3
 *                 example: Sala Cálculo III
 *               description:
 *                 type: string
 *                 example: Para estudiar para el parcial
 *               isPrivate:
 *                 type: boolean
 *                 default: false
 *               maxParticipants:
 *                 type: integer
 *                 default: 10
 *                 maximum: 20
 *     responses:
 *       201:
 *         description: Sala creada exitosamente
 *       400:
 *         description: Datos inválidos
 */
router.post('/', verifyToken, createRoom);

/**
 * @swagger
 * /api/rooms/{roomId}:
 *   get:
 *     summary: Obtener sala por ID
 *     description: Obtiene los detalles completos de una sala específica.
 *     tags: [Rooms]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Detalles de la sala
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Room'
 *       404:
 *         description: Sala no encontrada
 */
router.get('/:roomId', verifyToken, getRoomById);

/**
 * @swagger
 * /api/rooms/{roomId}:
 *   put:
 *     summary: Editar sala
 *     description: Edita los datos de una sala. Solo el anfitrión puede hacerlo.
 *     tags: [Rooms]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               isPrivate:
 *                 type: boolean
 *               maxParticipants:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Sala actualizada
 *       403:
 *         description: Solo el anfitrión puede editar
 *       404:
 *         description: Sala no encontrada
 */
router.put('/:roomId', verifyToken, updateRoom);

/**
 * @swagger
 * /api/rooms/{roomId}:
 *   delete:
 *     summary: Eliminar sala
 *     description: Elimina una sala permanentemente. Solo el anfitrión puede hacerlo.
 *     tags: [Rooms]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sala eliminada
 *       403:
 *         description: Solo el anfitrión puede eliminar
 *       404:
 *         description: Sala no encontrada
 */
router.delete('/:roomId', verifyToken, deleteRoom);

/**
 * @swagger
 * /api/rooms/{roomId}/messages:
 *   get:
 *     summary: Historial de mensajes
 *     description: Obtiene el historial de mensajes de una sala (máx. 50 últimos por defecto).
 *     tags: [Rooms]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Historial de mensajes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Message'
 *       404:
 *         description: Sala no encontrada
 */
router.get('/:roomId/messages', verifyToken, getRoomMessages);

export default router;