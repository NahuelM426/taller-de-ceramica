import { opcionesMotivoMovimiento } from "@/lib/seleccionMotivoMovimiento";

export interface ReajustePendiente {
  grupoId: number;
  grupoNombre: string;
  fechaOrigen: string;
  fechaDestino: string;
}

export interface BloqueoReajuste {
  actual: boolean;
}

export const motivosMovimientoCalendario = opcionesMotivoMovimiento.map(opcion => ({
  tipo: opcion.tipo,
  etiqueta: opcion.titulo,
}));

export function prepararConfirmacionReajuste(
  grupo: { id: number; nombre: string },
  fechaOrigen: string,
  fechaDestino: string
) {
  return {
    selectorFechaVisible: false,
    reajustePendiente: {
      grupoId: grupo.id,
      grupoNombre: grupo.nombre,
      fechaOrigen,
      fechaDestino,
    } satisfies ReajustePendiente,
  };
}

export function cancelarConfirmacionReajuste() {
  return null;
}

export function detalleDiaDebeEstarVisible(input: {
  fechaSeleccionada: string | null;
  selectorAlumnoVisible: boolean;
  selectorFechaVisible: boolean;
  selectorModeloVisible: boolean;
  selectorMotivoVisible?: boolean;
  reajustePendiente: ReajustePendiente | null;
}) {
  return !!input.fechaSeleccionada &&
    !input.selectorAlumnoVisible &&
    !input.selectorFechaVisible &&
    !input.selectorModeloVisible &&
    !input.selectorMotivoVisible &&
    !input.reajustePendiente;
}

export function controlesReajusteDeshabilitados(guardando: boolean) {
  return guardando;
}

export async function ejecutarReajusteUnaVez(
  pendiente: ReajustePendiente,
  bloqueo: BloqueoReajuste,
  acciones: {
    reajustar: (pendiente: ReajustePendiente) => Promise<void>;
    reprogramarNotificaciones: () => Promise<void>;
    recargar: () => Promise<void>;
  }
) {
  if (bloqueo.actual) return false;
  bloqueo.actual = true;
  try {
    await acciones.reajustar(pendiente);
    await acciones.reprogramarNotificaciones();
    await acciones.recargar();
    return true;
  } finally {
    bloqueo.actual = false;
  }
}
