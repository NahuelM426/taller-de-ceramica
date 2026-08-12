import { TipoMovimientoClase } from "@/models";

export function motivoMovimientoClase(tipo: TipoMovimientoClase) {
  if (tipo === "feriado") return "Feriado / taller cerrado";
  if (tipo === "compromiso") return "Compromiso / cambio de fecha";
  return "Reajuste";
}

export function etiquetaRecuperacion(
  tipo: TipoMovimientoClase | null | undefined,
  fechaOrigen: string
) {
  const fecha = `${fechaOrigen.slice(8, 10)}/${fechaOrigen.slice(5, 7)}`;
  if (tipo === "compromiso") return `Recuperación por compromiso del ${fecha}`;
  if (tipo === "reajuste") return `Reajuste del ${fecha}`;
  return `Recuperación por feriado del ${fecha}`;
}

export function etiquetaMovimientoClase(tipo: TipoMovimientoClase) {
  if (tipo === "feriado") return "Feriado";
  if (tipo === "compromiso") return "Compromiso";
  return "Reajuste";
}
