import type { Alumno, EstadoPagoAlumno } from "@/models";
import {
  pendientesExtraAlumno,
  pendientesRegularesAlumno,
} from "@/lib/seleccionAgenda";

export type FiltroListadoAlumnos = "todos" | "pendientes" | "no_pagaron";
export type SubfiltroPendientes = "todos" | "regulares" | "extras";
export type SubfiltroNoPagaron = "todos" | "cuota" | "extras";

export function alumnoPasaFiltro(
  alumno: Alumno,
  pago: EstadoPagoAlumno | undefined,
  filtro: FiltroListadoAlumnos,
  subfiltroPendientes: SubfiltroPendientes,
  subfiltroNoPagaron: SubfiltroNoPagaron
) {
  if (filtro === "todos") return true;
  if (filtro === "pendientes") {
    const regulares = pendientesRegularesAlumno(alumno);
    const extras = pendientesExtraAlumno(alumno);
    if (subfiltroPendientes === "regulares") return regulares > 0;
    if (subfiltroPendientes === "extras") return extras > 0;
    return regulares > 0 || extras > 0;
  }
  const debeCuota = pago?.pagado !== 1;
  const debeExtras = (pago?.clases_extra_adeudadas || 0) > 0;
  if (subfiltroNoPagaron === "cuota") return debeCuota;
  if (subfiltroNoPagaron === "extras") return debeExtras;
  return debeCuota || debeExtras;
}
