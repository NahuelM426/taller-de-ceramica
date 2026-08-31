import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { debeElegirGrupoDelDia, seleccionarDatosDelDia } from "../lib/calendario";
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

  test("pide elegir al tocar un día con dos grupos", () => {
    assert.equal(debeElegirGrupoDelDia("2026-08-07", null, grupos), true);
    assert.equal(debeElegirGrupoDelDia("2026-08-07", 1, grupos), false);
    assert.equal(debeElegirGrupoDelDia("2026-08-07", null, [grupos[0]]), false);
  });

  test("sin grupo específico incluye todas las personas y evita elegir entre dos grupos", () => {
    const seleccion = seleccionarDatosDelDia(
      items, [], grupos, "2026-08-07", null
    );

    assert.deepEqual(seleccion.personas.map(item => item.id), [10, 11]);
    assert.equal(seleccion.grupoDestino, null);
    assert.deepEqual(seleccion.gruposDelDia.map(item => item.id), [1, 2]);
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

  test("selecciona el movimiento en la fecha de destino del grupo", () => {
    const movido = { ...agenda(12, 2, 2), fecha: "2026-08-09" };
    const seleccion = seleccionarDatosDelDia(
      [movido],
      [
        {
          fecha: "2026-08-07", grupo_id: 1, motivo: "Feriado",
          fecha_recuperacion: "2026-08-08", tipo: "feriado",
        },
        {
          fecha: "2026-08-07", grupo_id: 2, motivo: "Compromiso",
          fecha_recuperacion: "2026-08-09", tipo: "compromiso",
        },
      ],
      grupos,
      "2026-08-09",
      2
    );

    assert.equal(seleccion.feriado?.grupo_id, 2);
    assert.equal(seleccion.feriado?.tipo, "compromiso");
  });

  test("oculta el grupo en el origen y permite deshacer desde el destino", () => {
    const gruposMismoDia = [
      grupo(1, "2026-08-14"),
      grupo(2, "2026-08-07"),
    ];
    const movimiento = {
      fecha: "2026-08-07",
      grupo_id: 1,
      motivo: "Reajuste · Viernes 1",
      fecha_recuperacion: "2026-08-14",
      tipo: "reajuste" as const,
    };
    const seleccionDia = seleccionarDatosDelDia(
      [agenda(20, 2, 2)],
      [movimiento],
      gruposMismoDia,
      "2026-08-07",
      null
    );

    assert.deepEqual(seleccionDia.gruposDelDia.map(item => item.id), [2]);
    assert.equal(seleccionDia.grupoDestino?.id, 2);

    const grupoReajustado = seleccionarDatosDelDia(
      [{ ...agenda(21, 1, 1), fecha: "2026-08-14" }],
      [movimiento],
      gruposMismoDia,
      "2026-08-14",
      1
    );
    assert.equal(grupoReajustado.feriado?.tipo, "reajuste");
    assert.equal(grupoReajustado.personas.length, 1);
  });

  test("no muestra con cero una tercera fecha teórica tras mover 15 al 8", () => {
    const reajustado = grupo(1, "2026-09-08");
    const agendaPrimero = {
      ...agenda(30, 1, 1),
      fecha: "2026-09-01",
    };
    const agendaOcho = {
      ...agenda(31, 1, 1),
      fecha: "2026-09-08",
    };

    const seleccion = seleccionarDatosDelDia(
      [agendaPrimero, agendaOcho],
      [],
      [reajustado],
      "2026-09-22",
      null
    );

    assert.equal(seleccion.gruposDelDia.length, 0);
    assert.equal(seleccion.grupoDestino, null);
  });
});
