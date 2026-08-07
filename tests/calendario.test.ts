import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { seleccionarDatosDelDia } from "../lib/calendario";
import type { AgendaAlumno, Grupo } from "../models";

function grupo(id: number, fechaInicio: string): Grupo {
  return {
    id,
    nombre: `Viernes ${id}`,
    dia: 5,
    hora: "18:00",
    capacidad: 4,
    color: "#315B50",
    notificacion: 0,
    minutos_antes: 1440,
    activo: 1,
    frecuencia: "quincenal",
    fecha_inicio: fechaInicio,
  };
}

function agenda(id: number, alumnoId: number, grupoId: number): AgendaAlumno {
  return {
    id,
    alumno_id: alumnoId,
    alumno_nombre: `Alumno ${alumnoId}`,
    grupo_id: grupoId,
    grupo_nombre: `Viernes ${grupoId}`,
    grupo_color: "#315B50",
    hora: "18:00",
    fecha: "2026-08-07",
    tipo: "regular",
    estado: "programada",
    modelo_id: null,
    modelo_nombre: null,
    necesidades: null,
  };
}

describe("selección de datos del calendario", () => {
  const grupos = [grupo(1, "2026-08-07"), grupo(2, "2026-08-14")];
  const items = [agenda(10, 1, 1), agenda(11, 2, 2)];

  test("sin grupo específico incluye todas las personas y evita elegir entre dos grupos", () => {
    const seleccion = seleccionarDatosDelDia(
      items, [], grupos, "2026-08-07", null
    );

    assert.deepEqual(seleccion.personas.map(item => item.id), [10, 11]);
    assert.equal(seleccion.grupoDestino, null);
    assert.deepEqual(seleccion.idsOcupados, [1, 2]);
  });

  test("con grupo específico filtra personas y fija el destino", () => {
    const seleccion = seleccionarDatosDelDia(
      items, [], grupos, "2026-08-07", 2
    );

    assert.deepEqual(seleccion.personas.map(item => item.id), [11]);
    assert.equal(seleccion.grupoDestino?.id, 2);
  });

  test("un único grupo habitual queda disponible aunque todavía no tenga agenda", () => {
    const seleccion = seleccionarDatosDelDia(
      [], [], grupos, "2026-08-21", null
    );

    assert.equal(seleccion.grupoDestino?.id, 1);
  });
});
