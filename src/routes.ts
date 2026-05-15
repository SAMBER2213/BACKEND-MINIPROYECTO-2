import { Router, Request, Response } from 'express';
import { auth, db } from './firebase';
import { Actividad, Subtarea, Usuario } from './types';
import {
  autenticarUsuario,
  fechaColombia,
  generarId,
  horaColombia,
  idValido,
  isoAhora,
  numeroSeguro,
  serializarDoc,
} from './utils';

const router = Router();
const usuarios = db.collection('usuarios');
const actividadesCol = db.collection('actividades');

function usuarioId(res: Response): string {
  return res.locals.usuarioId as string;
}

async function buscarActividadPropia(actividadId: string, uid: string) {
  if (!idValido(actividadId)) return null;

  const ref = actividadesCol.doc(actividadId);
  const snap = await ref.get();

  if (!snap.exists) return null;
  const data = snap.data() as Actividad;
  if (data.usuarioId !== uid) return null;

  return { ref, snap, data };
}

router.get('/health/', (_req, res) => {
  res.json({ status: 'ok', mensaje: 'API Planificador funcionando' });
});

router.post('/auth/registro/', async (req: Request, res: Response) => {
  const data = req.body || {};
  const errores: Record<string, string> = {};

  const nombre = String(data.nombre || '').trim();
  const apellido = String(data.apellido || '').trim();
  const correo = String(data.correo || '').trim().toLowerCase();
  const clave = String(data.clave || '');
  const confirmar = String(data.confirmarClave || '');

  if (!nombre) errores.nombre = 'El nombre es obligatorio';
  else if (!nombre.replace(/ /g, '').match(/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+$/)) errores.nombre = 'El nombre solo puede contener letras';

  if (!apellido) errores.apellido = 'El apellido es obligatorio';
  else if (!apellido.replace(/ /g, '').match(/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+$/)) errores.apellido = 'El apellido solo puede contener letras';

  if (!correo) errores.correo = 'El correo es obligatorio';
  else if (!correo.includes('@') || !correo.includes('.')) errores.correo = 'El correo no es válido';

  if (!clave) errores.clave = 'La clave es obligatoria';
  else if (clave.length < 6) errores.clave = 'La clave debe tener al menos 6 caracteres';

  if (!confirmar) errores.confirmarClave = 'Debes confirmar la clave';
  else if (clave && clave !== confirmar) errores.confirmarClave = 'Las claves no coinciden';

  if (Object.keys(errores).length) {
    res.status(400).json({ error: 'Datos inválidos', campos: errores });
    return;
  }

  try {
    await auth.getUserByEmail(correo);
    res.status(400).json({ error: 'Datos inválidos', campos: { correo: 'Este correo ya está registrado' } });
    return;
  } catch (error: any) {
    if (error?.code !== 'auth/user-not-found') {
      res.status(500).json({ error: 'No se pudo validar el correo' });
      return;
    }
  }

  try {
    const creado = await auth.createUser({
      email: correo,
      password: clave,
      displayName: `${nombre} ${apellido}`.trim(),
    });

    const usuario: Usuario = {
      nombre,
      apellido,
      correo,
      creadoEn: isoAhora(),
    };

    await usuarios.doc(creado.uid).set(usuario);

    res.status(201).json({
      mensaje: 'Usuario registrado correctamente',
      usuario: {
        id: creado.uid,
        nombre,
        apellido,
        correo,
      },
    });
  } catch (error: any) {
    if (error?.code === 'auth/email-already-exists') {
      res.status(400).json({ error: 'Datos inválidos', campos: { correo: 'Este correo ya está registrado' } });
      return;
    }

    res.status(500).json({ error: 'No se pudo registrar el usuario' });
  }
});

router.post('/auth/login/', async (req: Request, res: Response) => {
  const data = req.body || {};
  const errores: Record<string, string> = {};

  const correo = String(data.correo || '').trim().toLowerCase();
  const clave = String(data.clave || '');

  if (!correo) errores.correo = 'El correo es obligatorio';
  if (!clave) errores.clave = 'La clave es obligatoria';

  if (Object.keys(errores).length) {
    res.status(400).json({ error: 'Datos inválidos', campos: errores });
    return;
  }

  const apiKey = process.env.FIREBASE_WEB_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Falta configurar FIREBASE_WEB_API_KEY' });
    return;
  }

  try {
    const respuesta = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: correo, password: clave, returnSecureToken: true }),
    });

    if (!respuesta.ok) {
      res.status(401).json({ error: 'Correo o clave incorrectos', campos: {} });
      return;
    }

    const authData = await respuesta.json() as { localId: string; idToken: string; refreshToken: string; email: string };
    const usuarioSnap = await usuarios.doc(authData.localId).get();
    const usuario = usuarioSnap.exists ? usuarioSnap.data() as Usuario : null;

    res.json({
      mensaje: 'Login exitoso',
      token: authData.idToken,
      refreshToken: authData.refreshToken,
      usuario: {
        id: authData.localId,
        nombre: usuario?.nombre || '',
        apellido: usuario?.apellido || '',
        correo: usuario?.correo || authData.email || correo,
      },
    });
  } catch {
    res.status(401).json({ error: 'Correo o clave incorrectos', campos: {} });
  }
});

router.get('/hoy/', autenticarUsuario, async (_req, res) => {
  const uid = usuarioId(res);
  const fechaHoy = fechaColombia();
  const horaActual = horaColombia();

  const snap = await actividadesCol.where('usuarioId', '==', uid).get();
  const vencidas: Subtarea[] = [];
  const paraHoy: Subtarea[] = [];
  const proximas: Subtarea[] = [];

  snap.forEach((doc) => {
    const act = doc.data() as Actividad;

    for (const sub of act.subtareas || []) {
      if (sub.estado === 'hecho') continue;

      const enriquecida: Subtarea = {
        ...sub,
        actividadId: doc.id,
        actividadTitulo: act.titulo || '',
        actividadCurso: act.curso || '',
      };

      const fechaSub = sub.fecha || '';
      const horaSub = sub.hora || '';

      if (!fechaSub) proximas.push(enriquecida);
      else if (fechaSub < fechaHoy) vencidas.push(enriquecida);
      else if (fechaSub === fechaHoy) {
        if (horaSub && horaSub < horaActual) vencidas.push(enriquecida);
        else paraHoy.push(enriquecida);
      } else proximas.push(enriquecida);
    }
  });

  vencidas.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
  paraHoy.sort((a, b) => numeroSeguro(a.horas) - numeroSeguro(b.horas));
  proximas.sort((a, b) => {
    const aSinFecha = !a.fecha;
    const bSinFecha = !b.fecha;
    if (aSinFecha !== bSinFecha) return aSinFecha ? 1 : -1;
    return (a.fecha || '').localeCompare(b.fecha || '');
  });

  const cargaHoy = paraHoy.reduce((total, sub) => total + numeroSeguro(sub.horas), 0);

  res.json({
    fecha: fechaHoy,
    regla: 'Tus tareas se ordenan así: primero las Vencidas (la más antigua arriba), luego las de Hoy, y después las Próximas (la más cercana arriba). Si dos tareas tienen la misma fecha, aparece primero la de menor esfuerzo.',
    carga_hoy_horas: Math.round(cargaHoy * 100) / 100,
    vencidas,
    hoy: paraHoy,
    proximas,
  });
});

router.get('/actividades/', autenticarUsuario, async (_req, res) => {
  const uid = usuarioId(res);
  const snap = await actividadesCol.where('usuarioId', '==', uid).get();
  res.json(snap.docs.map((doc) => serializarDoc<Actividad>(doc)));
});

router.post('/actividades/', autenticarUsuario, async (req, res) => {
  const uid = usuarioId(res);
  const data = req.body || {};
  const errores: Record<string, string> = {};

  if (!String(data.titulo || '').trim()) errores.titulo = 'El título es obligatorio';
  if (!String(data.tipo || '').trim()) errores.tipo = 'El tipo es obligatorio';
  if (!String(data.curso || '').trim()) errores.curso = 'El curso es obligatorio';

  if (Object.keys(errores).length) {
    res.status(400).json({ error: 'Datos inválidos', campos: errores });
    return;
  }

  const nueva: Actividad = {
    usuarioId: uid,
    titulo: String(data.titulo).trim(),
    tipo: String(data.tipo).trim(),
    curso: String(data.curso).trim(),
    fechaLimite: data.fechaLimite || '',
    horasEstimadas: data.horasEstimadas || 0,
    subtareas: [],
    creadoEn: isoAhora(),
  };

  const ref = await actividadesCol.add(nueva);
  res.status(201).json({ id: ref.id, ...nueva });
});

router.get('/actividades/:actividadId/', autenticarUsuario, async (req, res) => {
  const resultado = await buscarActividadPropia(req.params.actividadId, usuarioId(res));
  if (!resultado) {
    res.status(idValido(req.params.actividadId) ? 404 : 400).json({ error: idValido(req.params.actividadId) ? 'Actividad no encontrada' : 'ID inválido' });
    return;
  }

  res.json(serializarDoc<Actividad>(resultado.snap));
});

router.put('/actividades/:actividadId/', autenticarUsuario, async (req, res) => {
  const resultado = await buscarActividadPropia(req.params.actividadId, usuarioId(res));
  if (!resultado) {
    res.status(idValido(req.params.actividadId) ? 404 : 400).json({ error: idValido(req.params.actividadId) ? 'Actividad no encontrada' : 'ID inválido' });
    return;
  }

  const data = req.body || {};
  const errores: Record<string, string> = {};

  if ('titulo' in data && !String(data.titulo || '').trim()) errores.titulo = 'El título no puede estar vacío';
  if ('curso' in data && !String(data.curso || '').trim()) errores.curso = 'El curso no puede estar vacío';

  if (Object.keys(errores).length) {
    res.status(400).json({ error: 'Datos inválidos', campos: errores });
    return;
  }

  const campos: Partial<Actividad> = {};
  for (const campo of ['titulo', 'tipo', 'curso', 'fechaLimite', 'horasEstimadas'] as const) {
    if (campo in data) campos[campo] = data[campo];
  }

  await resultado.ref.update(campos);
  const actualizado = await resultado.ref.get();
  res.json(serializarDoc<Actividad>(actualizado));
});

router.delete('/actividades/:actividadId/', autenticarUsuario, async (req, res) => {
  const resultado = await buscarActividadPropia(req.params.actividadId, usuarioId(res));
  if (!resultado) {
    res.status(idValido(req.params.actividadId) ? 404 : 400).json({ error: idValido(req.params.actividadId) ? 'Actividad no encontrada' : 'ID inválido' });
    return;
  }

  await resultado.ref.delete();
  res.json({ mensaje: 'Actividad eliminada correctamente' });
});

router.get('/actividades/:actividadId/subtareas/', autenticarUsuario, async (req, res) => {
  const resultado = await buscarActividadPropia(req.params.actividadId, usuarioId(res));
  if (!resultado) {
    res.status(idValido(req.params.actividadId) ? 404 : 400).json({ error: idValido(req.params.actividadId) ? 'Actividad no encontrada' : 'ID inválido' });
    return;
  }

  res.json(resultado.data.subtareas || []);
});

router.post('/actividades/:actividadId/subtareas/', autenticarUsuario, async (req, res) => {
  const resultado = await buscarActividadPropia(req.params.actividadId, usuarioId(res));
  if (!resultado) {
    res.status(idValido(req.params.actividadId) ? 404 : 400).json({ error: idValido(req.params.actividadId) ? 'Actividad no encontrada' : 'ID inválido' });
    return;
  }

  const data = req.body || {};
  const errores: Record<string, string> = {};

  if (!String(data.nombre || '').trim()) errores.nombre = 'El nombre es obligatorio';

  const horas = Number(data.horas || 0);
  if (!Number.isFinite(horas)) errores.horas = 'Las horas deben ser un número válido';
  else if (horas <= 0) errores.horas = 'Las horas deben ser mayor a 0';

  if (Object.keys(errores).length) {
    res.status(400).json({ error: 'Datos inválidos', campos: errores });
    return;
  }

  const nuevaSub: Subtarea = {
    id: generarId(),
    nombre: String(data.nombre).trim(),
    fecha: data.fecha || '',
    hora: data.hora || '',
    horas,
    estado: 'pendiente',
    nota: '',
    creadoEn: isoAhora(),
  };

  const subtareas = [...(resultado.data.subtareas || []), nuevaSub];
  await resultado.ref.update({ subtareas });
  res.status(201).json(nuevaSub);
});

router.put('/actividades/:actividadId/subtareas/:subtareaId/', autenticarUsuario, async (req, res) => {
  const resultado = await buscarActividadPropia(req.params.actividadId, usuarioId(res));
  if (!resultado) {
    res.status(idValido(req.params.actividadId) ? 404 : 400).json({ error: idValido(req.params.actividadId) ? 'Actividad no encontrada' : 'ID de actividad inválido' });
    return;
  }

  const subtareas = [...(resultado.data.subtareas || [])];
  const indice = subtareas.findIndex((s) => s.id === req.params.subtareaId);
  if (indice === -1) {
    res.status(404).json({ error: 'Subtarea no encontrada' });
    return;
  }

  const data = req.body || {};
  const errores: Record<string, string> = {};

  if ('nombre' in data && !String(data.nombre || '').trim()) errores.nombre = 'El nombre no puede estar vacío';
  if ('horas' in data) {
    const horas = Number(data.horas);
    if (!Number.isFinite(horas)) errores.horas = 'Las horas deben ser un número válido';
    else if (horas <= 0) errores.horas = 'Las horas deben ser mayor a 0';
  }

  if (Object.keys(errores).length) {
    res.status(400).json({ error: 'Datos inválidos', campos: errores });
    return;
  }

  const actualizada = { ...subtareas[indice] };
  for (const campo of ['nombre', 'fecha', 'hora', 'horas', 'estado', 'nota'] as const) {
    if (campo in data) (actualizada as any)[campo] = data[campo];
  }

  subtareas[indice] = actualizada;
  await resultado.ref.update({ subtareas });
  res.json(actualizada);
});

router.delete('/actividades/:actividadId/subtareas/:subtareaId/', autenticarUsuario, async (req, res) => {
  const resultado = await buscarActividadPropia(req.params.actividadId, usuarioId(res));
  if (!resultado) {
    res.status(idValido(req.params.actividadId) ? 404 : 400).json({ error: idValido(req.params.actividadId) ? 'Actividad no encontrada' : 'ID de actividad inválido' });
    return;
  }

  const subtareas = (resultado.data.subtareas || []).filter((s) => s.id !== req.params.subtareaId);
  await resultado.ref.update({ subtareas });
  res.json({ mensaje: 'Subtarea eliminada correctamente' });
});

router.get('/limite/', autenticarUsuario, async (_req, res) => {
  const snap = await usuarios.doc(usuarioId(res)).get();
  const data = snap.exists ? snap.data() as Usuario : null;
  res.json({ limiteDiario: data?.limiteDiario ?? 6 });
});

router.put('/limite/', autenticarUsuario, async (req, res) => {
  const nuevo = Number(req.body?.limiteDiario || 0);

  if (!Number.isFinite(nuevo)) {
    res.status(400).json({ error: 'Datos inválidos', campos: { limiteDiario: 'Debe ser un número' } });
    return;
  }

  if (nuevo < 1 || nuevo > 16) {
    res.status(400).json({ error: 'Datos inválidos', campos: { limiteDiario: 'El límite debe estar entre 1 y 16 horas' } });
    return;
  }

  await usuarios.doc(usuarioId(res)).set({ limiteDiario: nuevo }, { merge: true });
  res.json({ limiteDiario: nuevo, mensaje: `Límite actualizado a ${nuevo}h/día` });
});

router.get('/carga/:fecha/', autenticarUsuario, async (req, res) => {
  const uid = usuarioId(res);
  const fecha = req.params.fecha;
  const excluir = String(req.query.excluir_subtarea || '');

  const usuarioSnap = await usuarios.doc(uid).get();
  const dataUsuario = usuarioSnap.exists ? usuarioSnap.data() as Usuario : null;
  const limite = dataUsuario?.limiteDiario ?? 6;

  const snap = await actividadesCol.where('usuarioId', '==', uid).get();
  let horasPlanificadas = 0;
  const subtareasEseDia: Array<{ id: string; nombre: string; horas: number; actividadTitulo: string }> = [];

  snap.forEach((doc) => {
    const act = doc.data() as Actividad;
    for (const sub of act.subtareas || []) {
      if (sub.estado === 'hecho') continue;
      if ((sub.fecha || '') !== fecha) continue;
      if (excluir && sub.id === excluir) continue;

      horasPlanificadas += numeroSeguro(sub.horas);
      subtareasEseDia.push({
        id: sub.id,
        nombre: sub.nombre,
        horas: sub.horas,
        actividadTitulo: act.titulo || '',
      });
    }
  });

  horasPlanificadas = Math.round(horasPlanificadas * 100) / 100;
  res.json({
    fecha,
    horasPlanificadas,
    limiteDiario: limite,
    hayConflicto: horasPlanificadas > limite,
    subtareas: subtareasEseDia,
  });
});

export default router;
