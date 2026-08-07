import type { AgendaAlumno, Feriado, Grupo } from "@/models";
import { grupoOcurreEnFecha } from "./grupos";

export function seleccionarDatosDelDia(
  agenda: AgendaAlumno[],
  feriados: Feriado[],
  grupos: Grupo[],
  fecha: string | null,
  grupoId: number | null
) {
  const personas = agenda.filter(item =>
    item.fecha === fecha && (!grupoId || item.grupo_id === grupoId)
  );
  const feriado = feriados.find(item => item.fecha === fecha);
  const idsConAgenda = new Set(
    agenda.filter(item => item.fecha === fecha).map(item => item.grupo_id)
  );
  const gruposDelDia = fecha
    ? grupos.filter(grupo =>
        grupoOcurreEnFecha(grupo, fecha) || idsConAgenda.has(grupo.id)
      )
    : [];
  const grupoDestino = grupoId
    ? grupos.find(grupo => grupo.id === grupoId) || null
    : gruposDelDia.length === 1 ? gruposDelDia[0] : null;

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
