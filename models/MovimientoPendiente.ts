export type TipoMovimientoPendiente =
  | "saldo_inicial"
  | "ausencia"
  | "recuperacion"
  | "ajuste_manual"
  | "reversion";

export type CategoriaPendiente = "regular" | "extra";

export interface MovimientoPendiente {
  id: number;
  alumno_id: number;
  agenda_id: number | null;
  delta: number;
  tipo: TipoMovimientoPendiente;
  categoria: CategoriaPendiente;
  clave: string;
  revierte_movimiento_id: number | null;
  fecha: string;
  creado_en: string;
}
