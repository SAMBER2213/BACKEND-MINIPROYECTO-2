import { Request, Response, NextFunction } from 'express';

/**
 * Middleware global de manejo de errores.
 * Captura errores no manejados y devuelve respuestas consistentes.
 */
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error(`[Error] ${req.method} ${req.url}:`, err.message);

  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production'
      ? 'Error interno del servidor'
      : err.message,
  });
};

/**
 * Middleware para rutas no encontradas (404).
 */
export const notFound = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    error: `Ruta no encontrada: ${req.method} ${req.url}`,
  });
};
