export type TipoMovimientoClase = "feriado" | "compromiso" | "reajuste";

export interface Feriado {
  fecha: string;
  motivo: string;
  fecha_recuperacion: string | null;
  tipo: TipoMovimientoClase;
}
