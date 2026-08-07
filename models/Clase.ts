export type EstadoClase = "programada" | "presente" | "ausente" | "recuperacion";

export interface Clase {
  id: number;
  alumno_id: number;
  alumno_nombre?: string;
  grupo_id: number;
  grupo_nombre?: string;
  fecha: string;
  estado: EstadoClase;
}
