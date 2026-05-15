import { Request, Response, NextFunction } from 'express';
import { auth } from '../config/firebase';
import { DecodedIdToken } from 'firebase-admin/auth';

// Extend Express Request to include the authenticated user
export interface AuthRequest extends Request {
  user?: DecodedIdToken;
}

/**
 * Middleware que verifica el Firebase ID Token en el header Authorization.
 * Si el token es válido, adjunta el usuario decodificado a req.user.
 */
export const verifyToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Token de autenticación requerido. Formato: Bearer <token>',
      });
      return;
    }

    const idToken = authHeader.split('Bearer ')[1];

    const decodedToken = await auth.verifyIdToken(idToken);
    req.user = decodedToken;

    next();
  } catch (error: any) {
    if (error.code === 'auth/id-token-expired') {
      res.status(401).json({
        success: false,
        error: 'Token expirado. Por favor inicia sesión nuevamente.',
      });
      return;
    }

    res.status(401).json({
      success: false,
      error: 'Token inválido.',
    });
  }
};
