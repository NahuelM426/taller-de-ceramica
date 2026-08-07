import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  calcularLugaresDisponibles,
  calcularVacantesLiberadas,
} from "../lib/vacantes";
import type { AgendaAlumno, Grupo } from "../models";

const grupo: Grupo = {
  id: 1,
  nombre: "Viernes A",
  dia: 5,
  hora: "18:00",
  capacidad: 4,
  color: "#315B50",
  notificacion: 0,
  minutos_antes: 1440,
  activo: 1,
  frecuencia: "quincenal",
  fecha_inicio: "2026-08-07",
};

function agenda(
  id: number,
  tipo: AgendaAlumno["tipo"] = "regular",
  estado: AgendaAlumno["estado"] = "programada",
  cubreAgendaId: number | null = null
): AgendaAlumno {
  return {
    id,
    alumno_id: id,
    alumno_nombre: `Persona ${id}`,
    grupo_id: 1,
    grupo_nombre: "Viernes A",
    grupo_color: "#315B50",
    hora: "18:00",
    fecha: "2026-08-07",
    tipo,
    estado,
    modelo_id: null,
    modelo_nombre: null,
    necesidades: null,
    cubre_agenda_id: cubreAgendaId,
  };
}

describe("vacantes y coberturas", () => {
  test("distingue el cupo estructural del lugar liberado por ausencia", () => {
    const asistentes = [agenda(1), agenda(2), agenda(3)];
    assert.equal(calcularLugaresDisponibles(grupo, asistentes), 1);
    assert.equal(calcularVacantesLiberadas(asistentes), 0);

    asistentes[1] = agenda(2, "regular", "ausente");
    assert.equal(calcularLugaresDisponibles(grupo, asistentes), 2);
    assert.equal(calcularVacantesLiberadas(asistentes), 1);
  });

  test("una cobertura vinculada ocupa el lugar y deja de mostrarlo como liberado", () => {
    const ausencia = agenda(2, "regular", "ausente");
    const items = [
      agenda(1),
      ausencia,
      agenda(3),
      agenda(4, "manual", "programada", ausencia.id),
    ];

    assert.equal(calcularLugaresDisponibles(grupo, items), 1);
    assert.equal(calcularVacantesLiberadas(items), 0);
  });
});
