import { AgendaAlumno, Alumno } from "@/models";

export type FiltroAlumnos = "todos" | "pendientes";
export type TipoOcupacion = "recuperacion" | "cambio" | "fijar";

export function ordenarAlumnosParaElegir(alumnos: Alumno[]) {
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
  if (alumno?.pendientes) return "recuperacion";
  return origen ? "cambio" : null;
}
