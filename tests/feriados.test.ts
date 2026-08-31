import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

import { crearEsquema } from "../database/schema";
import { agendaRepository } from "../repositories/agendaRepository";
import { feriadoRepository } from "../repositories/feriadoRepository";
import { grupoRepository } from "../repositories/grupoRepository";
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
    await feriadoRepository.mover(fechaOriginal, fechaRecuperacion, "feriado", 1);
    const movida = await db.getFirstAsync<{
      fecha: string; tipo: string; feriado_origen: string; motivo_movimiento: string;
    }>("SELECT fecha,tipo,feriado_origen,motivo_movimiento FROM agenda_alumnos WHERE id = 10");
    assert.deepEqual(movida, {
      fecha: fechaRecuperacion,
      tipo: "manual",
      feriado_origen: fechaOriginal,
      motivo_movimiento: "feriado",
    });
    assert.equal(await feriadoRepository.quitar(fechaOriginal, 1), 1);
    const restaurada = await db.getFirstAsync<{ fecha: string; tipo: string }>(
      "SELECT fecha,tipo FROM agenda_alumnos WHERE id = 10"
    );
    assert.deepEqual(restaurada, { fecha: fechaOriginal, tipo: "regular" });
  });

  test("encuentra el movimiento al consultar solamente la fecha de destino", async () => {
    await feriadoRepository.mover(fechaOriginal, fechaRecuperacion, "feriado", 1);

    const movimientos = await feriadoRepository.listar(
      fechaRecuperacion,
      fechaRecuperacion
    );

    assert.equal(movimientos.length, 1);
    assert.equal(movimientos[0].fecha, fechaOriginal);
    assert.equal(movimientos[0].fecha_recuperacion, fechaRecuperacion);
    assert.equal(movimientos[0].grupo_id, 1);
  });

  test("compromiso no cambia las siguientes clases habituales", async () => {
    const db = await databasePromise;
    await db.runAsync(
      `INSERT INTO agenda_alumnos
       (id,alumno_id,grupo_id,fecha,tipo,estado)
       VALUES (11,1,1,'2026-08-14','regular','programada')`
    );
    await feriadoRepository.mover(fechaOriginal, fechaRecuperacion, "compromiso", 1);
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
    await feriadoRepository.mover(fechaOriginal, fechaRecuperacion, "compromiso", 1);
    await agendaRepository.registrarAusencia(1, 1, fechaRecuperacion);
    await feriadoRepository.quitar(fechaOriginal, 1);
    const estado = await db.getFirstAsync<{ pendientes: number; ausencias: number }>(`
      SELECT
        (SELECT pendientes FROM alumnos WHERE id = 1) AS pendientes,
        (SELECT COUNT(*) FROM clases WHERE estado = 'ausente') AS ausencias
    `);
    assert.deepEqual(estado, { pendientes: 0, ausencias: 0 });
  });

  test("con dos grupos el mismo día mueve y deshace solamente el grupo elegido", async () => {
    const db = await databasePromise;
    await db.execAsync(`
      INSERT INTO grupos
        (id,nombre,dia,hora,capacidad,color,frecuencia,fecha_inicio)
      VALUES (2,'Viernes tarde',5,'14:00',4,'#B66A4A','semanal','2026-08-07');
      INSERT INTO alumnos
        (id,nombre,frecuencia,grupo_id,pendientes,fecha_inicio)
      VALUES (2,'Berta','semanal',2,0,'2026-08-07');
      INSERT INTO agenda_alumnos
        (id,alumno_id,grupo_id,fecha,tipo,estado)
      VALUES (20,2,2,'2026-08-07','regular','programada');
    `);

    await feriadoRepository.mover(fechaOriginal, fechaRecuperacion, "feriado", 1);

    const agendas = await db.getAllAsync<{ id: number; fecha: string }>(
      "SELECT id,fecha FROM agenda_alumnos WHERE id IN (10,20) ORDER BY id"
    );
    assert.deepEqual(agendas, [
      { id: 10, fecha: fechaRecuperacion },
      { id: 20, fecha: fechaOriginal },
    ]);
    const marca = await db.getFirstAsync<{ grupo_id: number }>(
      "SELECT grupo_id FROM feriados WHERE fecha = ?",
      fechaOriginal
    );
    assert.equal(marca?.grupo_id, 1);

    await feriadoRepository.quitar(fechaOriginal, 1);
    const restauradas = await db.getAllAsync<{ id: number; fecha: string }>(
      "SELECT id,fecha FROM agenda_alumnos WHERE id IN (10,20) ORDER BY id"
    );
    assert.deepEqual(restauradas, [
      { id: 10, fecha: fechaOriginal },
      { id: 20, fecha: fechaOriginal },
    ]);
  });

  test("permite registrar movimientos distintos para dos grupos en la misma fecha", async () => {
    const db = await databasePromise;
    await db.execAsync(`
      INSERT INTO grupos
        (id,nombre,dia,hora,capacidad,color,frecuencia,fecha_inicio)
      VALUES (2,'Viernes tarde',5,'14:00',4,'#B66A4A','semanal','2026-08-07');
      INSERT INTO alumnos
        (id,nombre,frecuencia,grupo_id,pendientes,fecha_inicio)
      VALUES (2,'Berta','semanal',2,0,'2026-08-07');
      INSERT INTO agenda_alumnos
        (id,alumno_id,grupo_id,fecha,tipo,estado)
      VALUES (20,2,2,'2026-08-07','regular','programada');
    `);

    await feriadoRepository.mover(fechaOriginal, "2026-08-08", "feriado", 1);
    await feriadoRepository.mover(fechaOriginal, "2026-08-09", "compromiso", 2);
    const marcas = await db.getAllAsync<{ grupo_id: number; tipo: string }>(
      "SELECT grupo_id,tipo FROM feriados WHERE fecha = ? ORDER BY grupo_id",
      fechaOriginal
    );
    assert.deepEqual(marcas, [
      { grupo_id: 1, tipo: "feriado" },
      { grupo_id: 2, tipo: "compromiso" },
    ]);
  });

  test("no lista reajustes pertenecientes a grupos ya eliminados", async () => {
    const db = await databasePromise;
    await db.execAsync(`
      INSERT INTO grupos
        (id,nombre,dia,hora,capacidad,color,frecuencia,fecha_inicio)
      VALUES (2,'Grupo activo',5,'14:00',4,'#B66A4A','semanal','2026-08-07');
      INSERT INTO feriados (fecha,grupo_id,motivo,fecha_recuperacion,tipo)
      VALUES
        ('2026-08-21',1,'Reajuste eliminado','2026-08-14','reajuste'),
        ('2026-08-21',2,'Reajuste activo','2026-08-14','reajuste'),
        ('2026-08-22',0,'Feriado general','2026-08-23','feriado');
      UPDATE grupos SET activo = 0 WHERE id = 1;
    `);

    const visibles = await feriadoRepository.listar("2026-08-01", "2026-08-31");

    assert.deepEqual(
      visibles.map(item => ({ grupo_id: item.grupo_id, tipo: item.tipo })),
      [
        { grupo_id: 2, tipo: "reajuste" },
        { grupo_id: 0, tipo: "feriado" },
      ]
    );
  });

  test("oculta reajustes generales antiguos si su grupo fue eliminado", async () => {
    const db = await databasePromise;
    await db.execAsync(`
      INSERT INTO grupos
        (id,nombre,dia,hora,capacidad,color,frecuencia,fecha_inicio)
      VALUES (2,'Grupo activo',5,'14:00',4,'#B66A4A','quincenal','2026-08-07');
      UPDATE grupos SET activo = 0 WHERE id = 1;
      INSERT INTO feriados (fecha,grupo_id,motivo,fecha_recuperacion,tipo)
      VALUES
        ('2026-08-21',0,'Reajuste viejo eliminado','2026-08-14','reajuste'),
        ('2026-08-22',0,'Reajuste viejo activo','2026-08-15','reajuste'),
        ('2026-08-23',0,'Feriado general','2026-08-24','feriado');
      INSERT INTO reajustes_grupo
        (grupo_id,fecha_origen,fecha_destino,fecha_inicio_anterior,
         fecha_inicio_nueva,fecha_hasta,agenda_anterior,agenda_generada,creado_en)
      VALUES
        (1,'2026-08-21','2026-08-14','2026-08-07','2026-08-14',
         '2027-08-21','[]','[]','2026-08-01T12:00:00.000Z'),
        (2,'2026-08-22','2026-08-15','2026-08-08','2026-08-15',
         '2027-08-22','[]','[]','2026-08-01T12:00:00.000Z');
    `);

    const visibles = await feriadoRepository.listar("2026-08-01", "2026-08-31");

    assert.deepEqual(
      visibles.map(item => ({ fecha: item.fecha, grupo_id: item.grupo_id, tipo: item.tipo })),
      [
        { fecha: "2026-08-22", grupo_id: 2, tipo: "reajuste" },
        { fecha: "2026-08-23", grupo_id: 0, tipo: "feriado" },
      ]
    );
  });

  test("al eliminar un grupo limpia solamente sus marcas del calendario", async () => {
    const db = await databasePromise;
    await db.execAsync(`
      INSERT INTO grupos
        (id,nombre,dia,hora,capacidad,color,frecuencia,fecha_inicio)
      VALUES (2,'Otro grupo',5,'14:00',4,'#B66A4A','semanal','2026-08-07');
      INSERT INTO feriados (fecha,grupo_id,motivo,fecha_recuperacion,tipo)
      VALUES
        ('2026-08-21',1,'Reajuste del grupo','2026-08-14','reajuste'),
        ('2026-08-21',2,'Compromiso de otro grupo','2026-08-22','compromiso'),
        ('2026-08-22',0,'Feriado general','2026-08-23','feriado');
    `);

    await grupoRepository.eliminar(1);

    const guardadas = await db.getAllAsync<{ grupo_id: number; tipo: string }>(
      "SELECT grupo_id,tipo FROM feriados ORDER BY grupo_id"
    );
    const historial = await db.getFirstAsync<{ activo: number }>(
      "SELECT activo FROM grupos WHERE id=1"
    );
    assert.deepEqual(guardadas, [
      { grupo_id: 0, tipo: "feriado" },
      { grupo_id: 2, tipo: "compromiso" },
    ]);
    assert.equal(historial?.activo, 0);
  });
});
