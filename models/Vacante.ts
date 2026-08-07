import { AgendaAlumno } from "./Agenda";
import { Grupo } from "./Grupo";

export interface ClaseProgramada {
  key: string;
  fecha: string;
  grupo: Grupo;
  agenda: AgendaAlumno[];
}

export interface Vacante {
  key: string;
  fecha: string;
  grupo: Grupo;
  vienen: AgendaAlumno[];
  lugares: number;
  liberados: number;
}
