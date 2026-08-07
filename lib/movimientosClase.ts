import { TipoMovimientoClase } from "@/models";

export function motivoMovimientoClase(tipo: TipoMovimientoClase) {
  return tipo === "feriado" ? "Feriado / taller cerrado" : "Compromiso / cambio de fecha";
}

export function etiquetaRecuperacion(
  tipo: TipoMovimientoClase | null | undefined,
  fechaOrigen: string
) {
  const fecha = `${fechaOrigen.slice(8, 10)}/${fechaOrigen.slice(5, 7)}`;
  return tipo === "compromiso"
    ? `Recuperación por compromiso del ${fecha}`
    : `Recuperación por feriado del ${fecha}`;
}
