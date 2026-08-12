import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

import { crearEsquema } from "../database/schema";
import { agendaRepository } from "../repositories/agendaRepository";
import { feriadoRepository } from "../repositories/feriadoRepository";
import { databasePromise, reiniciarBasePrueba } from "./helpers/connection";

const fechaOriginal = "2026-08-07";
const fechaRecuperacion = "2026-08-08";

async function prepararBase() {
  await reiniciarBasePrueba();
  const db = await databasePromise;
  await crearEsquema(db as unknown as Parameters<typeof crearEsquema>[0]);
  await db.runAsync(
    `INSERT INTO grupos
     (id,nombre,dia,hora,capacidad,color,frecuencia,fecha_inicio)
     VALUES (1,'Viernes',5,'18:00',4,'#315B50','semanal',?)`,
    fechaOriginal
  );
  await db.runAsync(
    `INSERT INTO alumnos
     (id,nombre,frecuencia,grupo_id,pendientes,fecha_inicio)
     VALUES (1,'Ana','semanal',1,0,?)`,
    fechaOriginal
  );
  await db.runAsync(
    `INSERT INTO agenda_alumnos
     (id,alumno_id,grupo_id,fecha,tipo,estado)
     VALUES (10,1,1,?,'regular','programada')`,
    fechaOriginal
  );
  return db;
}

describe("movimientos aislados por feriado o compromiso", () => {
  beforeEach(prepararBase);

  test("mueve una sola clase y permite deshacer el feriado", async () => {
    const db = await databasePromise;
    await feriadoRepository.mover(fechaOriginal, fechaRecuperacion, "feriado");
    const movida = await db.getFirstAsync<{
      fecha: string; tipo: string; feriado_origen: string; motivo_movimiento: string;
    }>("SELECT fecha,tipo,feriado_origen,motivo_movimiento FROM agenda_alumnos WHERE id = 10");
    assert.deepEqual(movida, {
      fecha: fechaRecuperacion,
      tipo: "manual",
      feriado_origen: fechaOriginal,
      motivo_movimiento: "feriado",
    });
    assert.equal(await feriadoRepository.quitar(fechaOriginal), 1);
    const restaurada = await db.getFirstAsync<{ fecha: string; tipo: string }>(
      "SELECT fecha,tipo FROM agenda_alumnos WHERE id = 10"
    );
    assert.deepEqual(restaurada, { fecha: fechaOriginal, tipo: "regular" });
  });

  test("compromiso no cambia las siguientes clases habituales", async () => {
    const db = await databasePromise;
    await db.runAsync(
      `INSERT INTO agenda_alumnos
       (id,alumno_id,grupo_id,fecha,tipo,estado)
       VALUES (11,1,1,'2026-08-14','regular','programada')`
    );
    await feriadoRepository.mover(fechaOriginal, fechaRecuperacion, "compromiso");
    const siguiente = await db.getFirstAsync<{ fecha: string; tipo: string }>(
      "SELECT fecha,tipo FROM agenda_alumnos WHERE id = 11"
    );
    const grupo = await db.getFirstAsync<{ fecha_inicio: string }>(
      "SELECT fecha_inicio FROM grupos WHERE id = 1"
    );
    assert.deepEqual(siguiente, { fecha: "2026-08-14", tipo: "regular" });
    assert.equal(grupo?.fecha_inicio, fechaOriginal);
  });

  test("al revertir elimina la ausencia de la fecha movida y su pendiente", async () => {
    const db = await databasePromise;
    await feriadoRepository.mover(fechaOriginal, fechaRecuperacion, "compromiso");
    await agendaRepository.registrarAusencia(1, 1, fechaRecuperacion);
    await feriadoRepository.quitar(fechaOriginal);
    const estado = await db.getFirstAsync<{ pendientes: number; ausencias: number }>(`
      SELECT
        (SELECT pendientes FROM alumnos WHERE id = 1) AS pendientes,
        (SELECT COUNT(*) FROM clases WHERE estado = 'ausente') AS ausencias
    `);
    assert.deepEqual(estado, { pendientes: 0, ausencias: 0 });
  });
});
