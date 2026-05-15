import { Router, Request, Response } from 'express';

const router = Router();

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Estado del servidor
 *     description: Verifica que el servidor esté corriendo correctamente. No requiere autenticación.
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: Servidor activo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 status:
 *                   type: string
 *                   example: ok
 *                 service:
 *                   type: string
 *                   example: StudySync Main API
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *                   description: Segundos activo
 */
router.get('/', (_req: Request, res: Response) => {
  res.json({
    success: true,
    status: 'ok',
    service: 'StudySync Main API',
    version: '1.0.0',
    environment: process.env.NODE_ENV ?? 'development',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

export default router;
