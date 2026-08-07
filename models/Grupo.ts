export type FrecuenciaGrupo = "semanal" | "quincenal";

export interface Grupo {
  id: number;
  nombre: string;
  dia: number;
  hora: string;
  capacidad: number;
  color: string;
  notificacion: number;
  minutos_antes: number;
  activo: number;
  frecuencia: FrecuenciaGrupo;
  fecha_inicio: string | null;
}

export type GrupoInput = Omit<Grupo, "id" | "activo">;
