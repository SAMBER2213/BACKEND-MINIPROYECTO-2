import { randomUUID } from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { auth } from './firebase';

export const ZONA_CO = 'America/Bogota';

export function ahoraColombia(): Date {
  return new Date();
}

export function fechaColombia(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_CO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function horaColombia(date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA_CO,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function isoAhora(): string {
  return new Date().toISOString();
}

export function generarId(): string {
  return randomUUID();
}

export function getUsuarioIdDesdeHeader(req: Request): string {
  const valor = req.header('X-Usuario-Id') || '';
  return valor.trim();
}

export function idValido(id: string): boolean {
  return Boolean(id && !id.includes('/'));
}

export function numeroSeguro(valor: unknown, defecto = 0): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : defecto;
}

export function serializarDoc<T>(doc: FirebaseFirestore.DocumentSnapshot): T & { id: string } {
  return {
    id: doc.id,
    ...(doc.data() as T),
  };
}

export async function autenticarUsuario(req: Request, res: Response, next: NextFunction): Promise<void> {
  const usuarioId = getUsuarioIdDesdeHeader(req);
  if (usuarioId) {
    res.locals.usuarioId = usuarioId;
    next();
    return;
  }

  const authorization = req.header('Authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';

  if (!token) {
    res.status(401).json({ error: 'No autenticado' });
    return;
  }

  try {
    const decoded = await auth.verifyIdToken(token);
    res.locals.usuarioId = decoded.uid;
    next();
  } catch {
    res.status(401).json({ error: 'No autenticado' });
  }
}
