import type { AgendaAlumno, Feriado, Grupo } from "@/models";
import { grupoOcurreEnFechaConsiderandoAgenda } from "./grupos";

export function debeElegirGrupoDelDia(
  fecha: string | null,
  grupoId: number | null,
  gruposDelDia: Grupo[]
) {
  return !!fecha && !grupoId && gruposDelDia.length > 1;
}

export function seleccionarDatosDelDia(
  agenda: AgendaAlumno[],
  feriados: Feriado[],
  grupos: Grupo[],
  fecha: string | null,
  grupoId: number | null
) {
  const idsConAgenda = new Set(
    agenda.filter(item => item.fecha === fecha).map(item => item.grupo_id)
  );
  const gruposMovidosDesdeElDia = new Set(
    feriados
      .filter(item => item.fecha === fecha && item.grupo_id > 0)
      .map(item => item.grupo_id)
  );
  const gruposDelDia = fecha
    ? grupos.filter(grupo =>
        idsConAgenda.has(grupo.id) || (
          !gruposMovidosDesdeElDia.has(grupo.id) &&
          grupoOcurreEnFechaConsiderandoAgenda(grupo, fecha, agenda)
        )
      )
    : [];
  const grupoDestino = grupoId
    ? grupos.find(grupo => grupo.id === grupoId) || null
    : gruposDelDia.length === 1 ? gruposDelDia[0] : null;
  const personas = agenda.filter(item =>
    item.fecha === fecha && (!grupoId || item.grupo_id === grupoId)
  );
  const feriado = feriados.find(item =>
    item.fecha_recuperacion === fecha && item.grupo_id === (grupoDestino?.id || 0)
  ) || feriados.find(item =>
    item.fecha_recuperacion === fecha && item.grupo_id === 0
  );

  return {
    personas,
    feriado,
    gruposDelDia,
    grupoDestino,
    idsOcupados: agenda
      .filter(item => item.fecha === fecha)
      .map(item => item.alumno_id),
  };
}
