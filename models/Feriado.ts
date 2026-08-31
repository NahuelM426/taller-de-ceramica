export type TipoMovimientoClase = "feriado" | "compromiso" | "reajuste";

export interface Feriado {
  fecha: string;
  grupo_id: number;
  motivo: string;
  fecha_recuperacion: string | null;
  tipo: TipoMovimientoClase;
}
