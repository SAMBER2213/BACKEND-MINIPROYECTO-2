export interface Usuario {
  nombre: string;
  apellido: string;
  correo: string;
  creadoEn: string;
  limiteDiario?: number;
}

export interface Subtarea {
  id: string;
  nombre: string;
  fecha: string;
  hora: string;
  horas: number;
  estado: string;
  nota: string;
  creadoEn?: string;
  actividadId?: string;
  actividadTitulo?: string;
  actividadCurso?: string;
}

export interface Actividad {
  usuarioId: string;
  titulo: string;
  tipo: string;
  curso: string;
  fechaLimite: string;
  horasEstimadas: number;
  subtareas: Subtarea[];
  creadoEn: string;
}
