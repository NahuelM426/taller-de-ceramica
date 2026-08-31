export type FrecuenciaAlumno = "semanal" | "quincenal";

export interface Alumno {
  id: number;
  nombre: string;
  telefono: string | null;
  frecuencia: FrecuenciaAlumno;
  grupo_id: number;
  sin_grupo: number;
  grupo_nombre?: string;
  grupo_color?: string;
  molde_id: number | null;
  molde_nombre?: string | null;
  pendientes: number;
  pendientes_regulares?: number;
  pendientes_extra?: number;
  fecha_inicio: string | null;
}

export type AlumnoInput = Omit<
  Alumno,
  "id" | "sin_grupo" | "grupo_nombre" | "grupo_color" | "molde_nombre" | "pendientes"
>;
