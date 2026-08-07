import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { grupoOcurreEnFecha, intervaloGrupo, siguienteFechaDelGrupo } from "../lib/grupos";
import type { Grupo } from "../models";

function crearGrupo(cambios: Partial<Grupo> = {}): Grupo {
  return {
    id: 1,
    nombre: "Viernes",
    dia: 5,
    hora: "18:00",
    capacidad: 6,
    color: "#315B50",
    notificacion: 0,
    minutos_antes: 1440,
    activo: 1,
    frecuencia: "semanal",
    fecha_inicio: "2026-08-07",
    ...cambios,
  };
}

describe("agenda semanal", () => {
  const grupo = crearGrupo();

  test("usa un intervalo de siete días", () => {
    assert.equal(intervaloGrupo("semanal"), 7);
  });

  test("ocurre todas las semanas desde la primera clase", () => {
    assert.equal(grupoOcurreEnFecha(grupo, "2026-08-07"), true);
    assert.equal(grupoOcurreEnFecha(grupo, "2026-08-14"), true);
    assert.equal(grupoOcurreEnFecha(grupo, "2026-08-21"), true);
  });

  test("no ocurre otro día ni antes de la primera clase", () => {
    assert.equal(grupoOcurreEnFecha(grupo, "2026-08-06"), false);
    assert.equal(grupoOcurreEnFecha(grupo, "2026-07-31"), false);
  });
});

describe("agenda quincenal", () => {
  const viernesA = crearGrupo({
    id: 10,
    nombre: "Viernes A",
    frecuencia: "quincenal",
    fecha_inicio: "2026-08-07",
  });
  const viernesB = crearGrupo({
    id: 11,
    nombre: "Viernes B",
    frecuencia: "quincenal",
    fecha_inicio: "2026-08-14",
  });

  test("usa un intervalo de catorce días", () => {
    assert.equal(intervaloGrupo("quincenal"), 14);
  });

  test("dos grupos del mismo horario pueden alternarse sin superponerse", () => {
    const viernes = ["2026-08-07", "2026-08-14", "2026-08-21", "2026-08-28"];
    const esperadoA = [true, false, true, false];
    const esperadoB = [false, true, false, true];

    viernes.forEach((fecha, indice) => {
      const ocurreA = grupoOcurreEnFecha(viernesA, fecha);
      const ocurreB = grupoOcurreEnFecha(viernesB, fecha);
      assert.equal(ocurreA, esperadoA[indice]);
      assert.equal(ocurreB, esperadoB[indice]);
      assert.equal(ocurreA && ocurreB, false);
    });
  });

  test("encuentra la próxima clase de cada turno", () => {
    assert.equal(siguienteFechaDelGrupo(viernesA, "2026-08-08"), "2026-08-21");
    assert.equal(siguienteFechaDelGrupo(viernesB, "2026-08-08"), "2026-08-14");
  });

  test("mantiene la quincena al cambiar de mes", () => {
    const grupo = crearGrupo({
      frecuencia: "quincenal",
      fecha_inicio: "2026-08-28",
    });

    assert.equal(grupoOcurreEnFecha(grupo, "2026-09-04"), false);
    assert.equal(grupoOcurreEnFecha(grupo, "2026-09-11"), true);
    assert.equal(siguienteFechaDelGrupo(grupo, "2026-08-29"), "2026-09-11");
  });
});
