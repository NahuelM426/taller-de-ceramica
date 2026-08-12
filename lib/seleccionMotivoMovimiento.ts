import type { TipoMovimientoClase } from "@/models";

export const opcionesMotivoMovimiento = [
  {
    tipo: "feriado",
    titulo: "Feriado",
    descripcion: "Mueve solamente esta clase a otra fecha.",
    icono: "calendar-outline",
  },
  {
    tipo: "compromiso",
    titulo: "Compromiso",
    descripcion: "Mueve solamente esta clase por un compromiso.",
    icono: "person-outline",
  },
  {
    tipo: "reajuste",
    titulo: "Reajuste",
    descripcion: "Cambia esta fecha y el patrón de las clases habituales siguientes.",
    icono: "sync-outline",
  },
] as const satisfies ReadonlyArray<{
  tipo: TipoMovimientoClase;
  titulo: string;
  descripcion: string;
  icono: string;
}>;

export interface EstadoSeleccionMotivo {
  selectorMotivoVisible: boolean;
  selectorFechaVisible: boolean;
  motivoMovimiento: TipoMovimientoClase | null;
}

export function abrirSeleccionMotivo(): EstadoSeleccionMotivo {
  return {
    selectorMotivoVisible: true,
    selectorFechaVisible: false,
    motivoMovimiento: null,
  };
}

export function cancelarSeleccionMotivo(): EstadoSeleccionMotivo {
  return {
    selectorMotivoVisible: false,
    selectorFechaVisible: false,
    motivoMovimiento: null,
  };
}

export function confirmarSeleccionMotivo(
  motivoMovimiento: TipoMovimientoClase
): EstadoSeleccionMotivo {
  return {
    selectorMotivoVisible: false,
    selectorFechaVisible: true,
    motivoMovimiento,
  };
}
