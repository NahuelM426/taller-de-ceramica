import type { TipoMovimientoClase } from "./Feriado";

export type TipoAgenda = "regular" | "recuperacion" | "manual";
export type EstadoAgenda = "programada" | "presente" | "ausente" | "cancelada";

export interface AgendaAlumno {
  id: number;
  alumno_id: number;
  alumno_nombre: string;
  alumno_grupo_id?: number | null;
  alumno_grupo_nombre?: string | null;
  grupo_id: number;
  grupo_nombre: string;
  grupo_color: string;
  hora: string;
  fecha: string;
  tipo: TipoAgenda;
  estado: EstadoAgenda;
  modelo_id: number | null;
  modelo_nombre: string | null;
  modelo_ids?: number[];
  modelo_nombres?: string[];
  necesidades: string | null;
  cubre_agenda_id?: number | null;
  origen_agenda_id?: number | null;
  feriado_origen?: string | null;
  feriado_tipo_origen?: TipoAgenda | null;
  motivo_movimiento?: TipoMovimientoClase | null;
  pago_extra_mes?: string | null;
  extra_adeudada?: number;
}
