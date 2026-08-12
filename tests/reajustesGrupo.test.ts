import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

import { crearEsquema, crearIndices } from "../database/schema";
import { etiquetaMovimientoClase, motivoMovimientoClase } from "../lib/movimientosClase";
import { reajusteRepository } from "../repositories/reajusteRepository";
import { databasePromise, reiniciarBasePrueba } from "./helpers/connection";

async function prepararBase(inicio = "2026-09-01") {
  await reiniciarBasePrueba();
  const db = await databasePromise;
  await crearEsquema(db as unknown as Parameters<typeof crearEsquema>[0]);
  await crearIndices(db as unknown as Parameters<typeof crearIndices>[0]);
  await db.runAsync(
    `INSERT INTO grupos
     (id,nombre,dia,hora,capacidad,color,frecuencia,fecha_inicio)
     VALUES (1,'Martes A',2,'18:00',4,'#315B50','quincenal',?)`,
    inicio
  );
  for (const [id, nombre] of [[1, "Ana"], [2, "Berta"]] as const) {
    await db.runAsync(
      `INSERT INTO alumnos
       (id,nombre,frecuencia,grupo_id,pendientes,fecha_inicio)
       VALUES (?,?,'quincenal',1,0,?)`,
      id, nombre, inicio
    );
  }
  const fechas = inicio === "2026-09-01"
    ? ["2026-09-01", "2026-09-15", "2026-10-06", "2026-10-20"]
    : ["2026-09-08", "2026-09-22", "2026-10-13", "2026-10-27"];
  let idAgenda = 10;
  for (const alumnoId of [1, 2]) {
    for (const fecha of fechas) {
      await db.runAsync(
        `INSERT INTO agenda_alumnos
         (id,alumno_id,grupo_id,fecha,tipo,estado)
         VALUES (?,?,1,?,'regular','programada')`,
        idAgenda++, alumnoId, fecha
      );
    }
  }
  return db;
}

async function fechasRegulares(alumnoId = 1) {
  const db = await databasePromise;
  const filas = await db.getAllAsync<{ fecha: string }>(
    `SELECT fecha FROM agenda_alumnos
     WHERE alumno_id = ? AND tipo = 'regular' AND estado != 'cancelada'
       AND fecha BETWEEN '2026-09-01' AND '2026-10-31' ORDER BY fecha`,
    alumnoId
  );
  return filas.map(fila => fila.fecha);
}

describe("reajuste del patrón mensual", () => {
  beforeEach(() => prepararBase());

  test("cambia 1/15 por 8/22 y continúa 13/27 el mes siguiente", async () => {
    const db = await databasePromise;
    await reajusteRepository.reajustar(1, "2026-09-01", "2026-09-08");
    assert.deepEqual(await fechasRegulares(), [
      "2026-09-08", "2026-09-22", "2026-10-13", "2026-10-27",
    ]);
    const grupo = await db.getFirstAsync<{ fecha_inicio: string }>(
      "SELECT fecha_inicio FROM grupos WHERE id = 1"
    );
    const marca = await db.getFirstAsync<{ tipo: string; motivo: string }>(
      "SELECT tipo,motivo FROM feriados WHERE fecha = '2026-09-01'"
    );
    assert.equal(grupo?.fecha_inicio, "2026-09-08");
    assert.deepEqual(marca, { tipo: "reajuste", motivo: "Reajuste · Martes A" });
    assert.equal(motivoMovimientoClase("reajuste"), "Reajuste");
    assert.equal(etiquetaMovimientoClase("reajuste"), "Reajuste");
  });

  test("permite el cambio inverso de segunda/cuarta a primera/tercera", async () => {
    await prepararBase("2026-09-08");
    await reajusteRepository.reajustar(1, "2026-09-08", "2026-09-15");
    assert.deepEqual(await fechasRegulares(), [
      "2026-09-15", "2026-10-06", "2026-10-20",
    ]);
  });

  test("conserva modelos, materiales, recuperaciones y movimientos manuales sin pendientes", async () => {
    const db = await databasePromise;
    await db.runAsync("UPDATE agenda_alumnos SET modelo_id=7,necesidades='2 placas' WHERE id=10");
    await db.runAsync(
      `INSERT INTO agenda_alumnos
       (id,alumno_id,grupo_id,fecha,tipo,estado,necesidades)
       VALUES (90,1,1,'2026-09-10','manual','programada','Esmalte'),
              (91,2,1,'2026-09-11','recuperacion','programada','Arcilla')`
    );
    await reajusteRepository.reajustar(1, "2026-09-01", "2026-09-08");
    const conservadas = await db.getAllAsync<{ id: number; tipo: string; necesidades: string }>(
      "SELECT id,tipo,necesidades FROM agenda_alumnos WHERE id IN (90,91) ORDER BY id"
    );
    const modelo = await db.getFirstAsync<{ modelo_id: number; necesidades: string }>(
      "SELECT modelo_id,necesidades FROM agenda_alumnos WHERE id=10"
    );
    const saldo = await db.getFirstAsync<{ pendientes: number; movimientos: number }>(`
      SELECT (SELECT SUM(pendientes) FROM alumnos) AS pendientes,
        (SELECT COUNT(*) FROM movimientos_pendientes) AS movimientos
    `);
    assert.deepEqual(conservadas, [
      { id: 90, tipo: "manual", necesidades: "Esmalte" },
      { id: 91, tipo: "recuperacion", necesidades: "Arcilla" },
    ]);
    assert.deepEqual(modelo, { modelo_id: 7, necesidades: "2 placas" });
    assert.deepEqual(saldo, { pendientes: 0, movimientos: 0 });
  });

  test("un conflicto cancela toda la transacción sin cambios parciales", async () => {
    const db = await databasePromise;
    await db.runAsync(
      `INSERT INTO agenda_alumnos
       (id,alumno_id,grupo_id,fecha,tipo,estado)
       VALUES (99,2,1,'2026-09-08','manual','programada')`
    );
    await assert.rejects(
      reajusteRepository.reajustar(1, "2026-09-01", "2026-09-08"),
      /Berta ya tiene una clase/
    );
    assert.deepEqual(await fechasRegulares(), [
      "2026-09-01", "2026-09-15", "2026-10-06", "2026-10-20",
    ]);
    const historial = await db.getFirstAsync<{ total: number }>(
      "SELECT COUNT(*) AS total FROM reajustes_grupo"
    );
    assert.equal(historial?.total, 0);
  });

  test("deshace el reajuste y conserva movimientos manuales posteriores", async () => {
    const db = await databasePromise;
    await reajusteRepository.reajustar(1, "2026-09-01", "2026-09-08");
    await db.runAsync(
      `INSERT INTO agenda_alumnos
       (id,alumno_id,grupo_id,fecha,tipo,estado)
       VALUES (99,1,1,'2026-09-09','manual','programada')`
    );
    await reajusteRepository.deshacer("2026-09-01");
    assert.deepEqual(await fechasRegulares(), [
      "2026-09-01", "2026-09-15", "2026-10-06", "2026-10-20",
    ]);
    const manual = await db.getFirstAsync<{ tipo: string; fecha: string }>(
      "SELECT tipo,fecha FROM agenda_alumnos WHERE id=99"
    );
    const grupo = await db.getFirstAsync<{ fecha_inicio: string }>(
      "SELECT fecha_inicio FROM grupos WHERE id=1"
    );
    assert.deepEqual(manual, { tipo: "manual", fecha: "2026-09-09" });
    assert.equal(grupo?.fecha_inicio, "2026-09-01");
  });

  test("no crea fechas duplicadas", async () => {
    const db = await databasePromise;
    await reajusteRepository.reajustar(1, "2026-09-01", "2026-09-08");
    const duplicadas = await db.getAllAsync(
      `SELECT alumno_id,fecha,COUNT(*) total FROM agenda_alumnos
       WHERE estado != 'cancelada' GROUP BY alumno_id,fecha HAVING COUNT(*) > 1`
    );
    assert.equal(duplicadas.length, 0);
  });

  test("una regular cancelada en el destino no bloquea y se restaura al deshacer", async () => {
    const db = await databasePromise;
    await reiniciarBasePrueba();
    await crearEsquema(db as unknown as Parameters<typeof crearEsquema>[0]);
    await db.execAsync(`
      INSERT INTO grupos
        (id,nombre,dia,hora,capacidad,color,frecuencia,fecha_inicio)
      VALUES (1,'Viernes',5,'18:00',4,'#315B50','quincenal','2026-09-04');
      INSERT INTO alumnos
        (id,nombre,frecuencia,grupo_id,pendientes,fecha_inicio)
      VALUES (1,'Lucía Bianchi','quincenal',1,0,'2026-09-04');
      INSERT INTO agenda_alumnos
        (id,alumno_id,grupo_id,fecha,tipo,estado)
      VALUES
        (10,1,1,'2026-09-04','regular','programada'),
        (11,1,1,'2026-09-18','regular','programada'),
        (12,1,1,'2026-10-02','regular','programada'),
        (13,1,1,'2026-10-16','regular','programada'),
        (50,1,1,'2026-09-11','regular','cancelada');
    `);

    await reajusteRepository.reajustar(1, "2026-09-04", "2026-09-11");
    const activas = await db.getAllAsync<{ fecha: string }>(
      `SELECT fecha FROM agenda_alumnos
       WHERE alumno_id=1 AND estado!='cancelada' AND fecha BETWEEN '2026-09-01' AND '2026-10-31'
       ORDER BY fecha`
    );
    const canceladaArchivada = await db.getFirstAsync<{ fecha: string; estado: string }>(
      "SELECT fecha,estado FROM agenda_alumnos WHERE id=50"
    );
    assert.deepEqual(activas.map(item => item.fecha), [
      "2026-09-11", "2026-09-25", "2026-10-09", "2026-10-23",
    ]);
    assert.equal(canceladaArchivada?.estado, "cancelada");
    assert.match(canceladaArchivada?.fecha || "", /^0000-00-00#reajuste_/);

    await reajusteRepository.deshacer("2026-09-04");
    const restauradas = await db.getAllAsync<{ id: number; fecha: string; estado: string }>(
      `SELECT id,fecha,estado FROM agenda_alumnos
       WHERE id IN (10,11,12,13,50) ORDER BY id`
    );
    assert.deepEqual(restauradas, [
      { id: 10, fecha: "2026-09-04", estado: "programada" },
      { id: 11, fecha: "2026-09-18", estado: "programada" },
      { id: 12, fecha: "2026-10-02", estado: "programada" },
      { id: 13, fecha: "2026-10-16", estado: "programada" },
      { id: 50, fecha: "2026-09-11", estado: "cancelada" },
    ]);
  });

  test("si aparece un conflicto posterior no deshace parcialmente", async () => {
    const db = await databasePromise;
    await reajusteRepository.reajustar(1, "2026-09-01", "2026-09-08");
    await db.runAsync(
      `INSERT INTO agenda_alumnos
       (id,alumno_id,grupo_id,fecha,tipo,estado)
       VALUES (99,1,1,'2026-09-01','manual','programada')`
    );
    await assert.rejects(
      reajusteRepository.deshacer("2026-09-01"),
      /fecha original ya está ocupada/
    );
    assert.deepEqual(await fechasRegulares(), [
      "2026-09-08", "2026-09-22", "2026-10-13", "2026-10-27",
    ]);
    const grupo = await db.getFirstAsync<{ fecha_inicio: string }>(
      "SELECT fecha_inicio FROM grupos WHERE id=1"
    );
    assert.equal(grupo?.fecha_inicio, "2026-09-08");
  });
});
