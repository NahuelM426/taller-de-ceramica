import { AgendaAlumno, Alumno } from "@/models";

export type FiltroAlumnos = "todos" | "pendientes";
export type TipoOcupacion =
  | "recuperacion"
  | "recuperacion_extra"
  | "extra_debe"
  | "cambio"
  | "fijar";

export function pendientesExtraAlumno(alumno: Alumno) {
  return Math.max(alumno.pendientes_extra || 0, 0);
}

export function pendientesRegularesAlumno(alumno: Alumno) {
  if (typeof alumno.pendientes_regulares === "number") {
    return Math.max(alumno.pendientes_regulares, 0);
  }
  return Math.max(alumno.pendientes - pendientesExtraAlumno(alumno), 0);
}

export function ordenarAlumnosParaElegir(
  alumnos: Alumno[]
) {
  return [...alumnos].sort((a, b) =>
    Number(b.pendientes > 0) - Number(a.pendientes > 0) ||
    b.pendientes - a.pendientes ||
    a.nombre.localeCompare(b.nombre, "es")
  );
}

export function filtrarAlumnosParaAgregar(
  alumnos: Alumno[],
  idsOcupados: number[],
  busqueda: string,
  filtro: FiltroAlumnos
) {
  const ocupados = new Set(idsOcupados);
  const termino = busqueda.trim().toLocaleLowerCase("es");
  return ordenarAlumnosParaElegir(alumnos.filter(alumno => {
    if (ocupados.has(alumno.id)) return false;
    if (filtro === "pendientes" && alumno.pendientes < 1) return false;
    return !termino ||
      alumno.nombre.toLocaleLowerCase("es").includes(termino) ||
      (alumno.grupo_nombre || "").toLocaleLowerCase("es").includes(termino);
  }));
}

export function buscarProximaClaseHabitual(
  agenda: AgendaAlumno[], alumno: Alumno | undefined, fecha: string
) {
  if (!alumno || alumno.sin_grupo) return undefined;
  return agenda.find(item =>
    item.alumno_id === alumno.id && item.tipo === "regular" &&
    item.estado === "programada" && item.fecha >= fecha &&
    item.grupo_id === alumno.grupo_id
  );
}

export function ocupacionInicial(
  alumno: Alumno | undefined,
  origen: AgendaAlumno | undefined
): TipoOcupacion | null {
  if (alumno && pendientesRegularesAlumno(alumno) > 0) return "recuperacion";
  if (alumno && pendientesExtraAlumno(alumno) > 0) return "recuperacion_extra";
  return origen ? "cambio" : null;
}
