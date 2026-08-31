import type { CantidadClasesPagadas } from "@/models";

export const PRECIO_DOS_CLASES = 68_000;
export const PRECIO_CUATRO_CLASES = 128_000;
export const PRECIO_CLASE_EXTRA = 31_000;

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function mesPagoActual(fecha = new Date()) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
}

export function mesPagoSiguiente(mes: string) {
  const [anio, numero] = mes.split("-").map(Number);
  if (!anio || numero < 1 || numero > 12) return mes;
  const fecha = new Date(anio, numero, 1);
  return mesPagoActual(fecha);
}

export function nombreMesPago(mes: string) {
  const [anio, numero] = mes.split("-").map(Number);
  const nombre = MESES[numero - 1];
  return nombre ? `${nombre} ${anio}` : mes;
}

export function cantidadClasesSugerida(frecuencia: "semanal" | "quincenal"): CantidadClasesPagadas {
  return frecuencia === "semanal" ? 4 : 2;
}

export function calcularImportePago(
  clasesPagadas: CantidadClasesPagadas,
  clasesExtra: number
) {
  const cuota = clasesPagadas === 4 ? PRECIO_CUATRO_CLASES : PRECIO_DOS_CLASES;
  return cuota + Math.max(0, Math.floor(clasesExtra)) * PRECIO_CLASE_EXTRA;
}

export function formatearPesos(importe: number) {
  return `$ ${Math.max(0, importe).toLocaleString("es-AR")}`;
}
