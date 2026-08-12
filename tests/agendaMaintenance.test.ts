import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

import {
  generarAgendaHasta,
  reajustarAgendaDosClasesPorMes,
} from "../database/agendaMaintenance";
import { crearEsquema, crearIndices, migrarColumnas } from "../database/schema";
import {
  databasePromise,
  reiniciarBasePrueba,
} from "./helpers/connection";

async function prepararBase() {
  await reiniciarBasePrueba();
  const db = await databasePromise;
  await crearEsquema(db as unknown as Parameters<typeof crearEsquema>[0]);
  await db.runAsync(
    `INSERT INTO grupos
     (id,nombre,dia,hora,capacidad,color,frecuencia,fecha_inicio)
     VALUES (1,'Viernes',5,'18:00',4,'#315B50','semanal','2026-08-07')`
  );
  await db.runAsync(
    `INSERT INTO alumnos
     (id,nombre,frecuencia,grupo_id,fecha_inicio)
     VALUES (1,'Ana','semanal',1,'2026-08-07')`
  );
  return db;
}

describe("generación incremental de agenda", () => {
  beforeEach(prepararBase);

  test("crea solo fechas faltantes y conserva las ya organizadas", async () => {
    const db = await databasePromise;
    const creadasIniciales = await generarAgendaHasta(
      1, 1, "2026-08-07", "2026-08-28"
    );
    assert.equal(creadasIniciales, 4);

    const antes = await db.getAllAsync<{ id: number; fecha: string }>(
      "SELECT id,fecha FROM agenda_alumnos ORDER BY fecha"
    );
    const idPrimera = antes.find(item => item.fecha === "2026-08-07")?.id;
    await db.runAsync(
      "UPDATE agenda_alumnos SET estado = 'cancelada' WHERE fecha = '2026-08-14'"
    );
    await db.runAsync("DELETE FROM agenda_alumnos WHERE fecha = '2026-08-21'");

    const creadasFaltantes = await generarAgendaHasta(
      1, 1, "2026-08-07", "2026-08-28"
    );
    const despues = await db.getAllAsync<{
      id: number; fecha: string; estado: string;
    }>("SELECT id,fecha,estado FROM agenda_alumnos ORDER BY fecha");

    assert.equal(creadasFaltantes, 1);
    assert.equal(despues.length, 4);
    assert.equal(
      despues.find(item => item.fecha === "2026-08-07")?.id,
      idPrimera
    );
    assert.equal(
      despues.find(item => item.fecha === "2026-08-14")?.estado,
      "cancelada"
    );
    assert.equal(
      despues.find(item => item.fecha === "2026-08-21")?.estado,
      "programada"
    );
    assert.equal(
      await generarAgendaHasta(1, 1, "2026-08-07", "2026-08-28"),
      0
    );
  });
});

describe("índices SQLite", () => {
  beforeEach(prepararBase);

  test("crea los índices de las consultas frecuentes", async () => {
    const db = await databasePromise;
    await migrarColumnas(db as unknown as Parameters<typeof migrarColumnas>[0]);
    await crearIndices(db as unknown as Parameters<typeof crearIndices>[0]);
    const indices = await db.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master
       WHERE type = 'index' AND name LIKE 'idx_%' ORDER BY name`
    );
    const nombres = new Set(indices.map(indice => indice.name));

    assert.equal(nombres.has("idx_agenda_fecha_estado_grupo"), true);
    assert.equal(nombres.has("idx_agenda_grupo_fecha_tipo_estado"), true);
    assert.equal(nombres.has("idx_agenda_alumno_tipo_fecha_estado"), true);
    assert.equal(nombres.has("idx_movimientos_alumno_id"), true);
    assert.equal(nombres.has("idx_movimientos_agenda_tipo_id"), true);
  });
});

describe("reajuste a dos clases por mes", () => {
  test("cancela terceras clases guardadas y conserva movimientos manuales", async () => {
    await reiniciarBasePrueba();
    const db = await databasePromise;
    await crearEsquema(db as unknown as Parameters<typeof crearEsquema>[0]);
    await db.runAsync(
      `INSERT INTO grupos
       (id,nombre,dia,hora,capacidad,color,frecuencia,fecha_inicio)
       VALUES (1,'Martes',2,'18:00',4,'#315B50','quincenal','2026-09-01')`
    );
    await db.runAsync(
      `INSERT INTO alumnos
       (id,nombre,frecuencia,grupo_id,fecha_inicio)
       VALUES (1,'Ana','quincenal',1,'2026-09-01')`
    );
    await db.runAsync(
      `INSERT INTO agenda_alumnos (alumno_id,grupo_id,fecha,tipo,estado)
       VALUES (1,1,'2026-09-29','regular','programada'),
              (1,1,'2026-10-13','manual','programada')`
    );

    assert.equal(await reajustarAgendaDosClasesPorMes(
      db as unknown as Parameters<typeof reajustarAgendaDosClasesPorMes>[0],
      "2026-09-01"
    ), 1);
    const filas = await db.getAllAsync<{ fecha: string; estado: string }>(
      "SELECT fecha,estado FROM agenda_alumnos ORDER BY fecha"
    );
    assert.deepEqual(filas, [
      { fecha: "2026-09-29", estado: "cancelada" },
      { fecha: "2026-10-13", estado: "programada" },
    ]);
  });
});
