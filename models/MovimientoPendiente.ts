export type TipoMovimientoPendiente =
  | "saldo_inicial"
  | "ausencia"
  | "recuperacion"
  | "ajuste_manual"
  | "reversion";

export interface MovimientoPendiente {
  id: number;
  alumno_id: number;
  agenda_id: number | null;
  delta: number;
  tipo: TipoMovimientoPendiente;
  clave: string;
  revierte_movimiento_id: number | null;
  fecha: string;
  creado_en: string;
}
