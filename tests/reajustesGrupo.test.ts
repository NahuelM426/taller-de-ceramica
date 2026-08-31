import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

import { crearEsquema, crearIndices } from "../database/schema";
import { etiquetaMovimientoClase, motivoMovimientoClase } from "../lib/movimientosClase";
import { grupoOcurreEnFecha } from "../lib/grupos";
import { grupoRepository } from "../repositories/grupoRepository";
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

  test("permite reajustar 01/09 al 15/09 con la agenda anual ya generada", async () => {
    const db = await databasePromise;
    await reiniciarBasePrueba();
    await crearEsquema(db as unknown as Parameters<typeof crearEsquema>[0]);
    await db.execAsync(`
      INSERT INTO grupos
        (id,nombre,dia,hora,capacidad,color,frecuencia,fecha_inicio)
      VALUES (1,'V',2,'18:00',4,'#315B50','quincenal','2026-09-01');
      INSERT INTO alumnos
        (id,nombre,frecuencia,grupo_id,pendientes,fecha_inicio)
      VALUES (1,'Ana','quincenal',1,0,'2026-09-01');
    `);
    const grupo = await db.getFirstAsync<import("../models").Grupo>(
      "SELECT * FROM grupos WHERE id=1"
    );
    assert.ok(grupo);
    const cursor = new Date("2026-09-01T12:00:00");
    let agendaId = 1;
    while (cursor <= new Date("2027-10-31T12:00:00")) {
      const fecha = cursor.toISOString().slice(0, 10);
      if (grupoOcurreEnFecha(grupo, fecha)) {
        await db.runAsync(
          `INSERT INTO agenda_alumnos
           (id,alumno_id,grupo_id,fecha,tipo,estado)
           VALUES (?,1,1,?,'regular','programada')`,
          agendaId++, fecha
        );
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    await reajusteRepository.reajustar(1, "2026-09-01", "2026-09-15");

    const primeras = await db.getAllAsync<{ fecha: string }>(
      `SELECT fecha FROM agenda_alumnos
       WHERE alumno_id=1 AND estado='programada' AND fecha GLOB '????-??-??'
       ORDER BY fecha LIMIT 4`
    );
    const duplicadas = await db.getAllAsync(
      `SELECT fecha,COUNT(*) total FROM agenda_alumnos
       WHERE alumno_id=1 GROUP BY fecha HAVING COUNT(*) > 1`
    );
    const sobrante = await db.getFirstAsync<{ fecha: string; estado: string }>(
      "SELECT fecha,estado FROM agenda_alumnos WHERE fecha LIKE '__reajuste_sobrante_%'"
    );
    assert.deepEqual(primeras.map(item => item.fecha), [
      "2026-09-15", "2026-10-06", "2026-10-20", "2026-11-03",
    ]);
    assert.equal(duplicadas.length, 0);
    assert.equal(sobrante?.estado, "cancelada");

    await reajusteRepository.deshacer(1, "2026-09-01");
    const restaurada = await db.getFirstAsync<{ fecha: string }>(
      `SELECT fecha FROM agenda_alumnos
       WHERE alumno_id=1 AND estado='programada' ORDER BY fecha LIMIT 1`
    );
    assert.equal(restaurada?.fecha, "2026-09-01");
  });

  test("permite el cambio inverso de segunda/cuarta a primera/tercera", async () => {
    await prepararBase("2026-09-08");
    await reajusteRepository.reajustar(1, "2026-09-08", "2026-09-15");
    assert.deepEqual(await fechasRegulares(), [
      "2026-09-15", "2026-10-06", "2026-10-20",
    ]);
  });

  test("permite reajustar hacia una fecha anterior y deshacerlo", async () => {
    const db = await prepararBase("2026-09-08");

    await reajusteRepository.reajustar(1, "2026-09-08", "2026-09-01");

    assert.deepEqual(await fechasRegulares(), [
      "2026-09-01", "2026-09-15", "2026-10-06", "2026-10-20",
    ]);
    const grupoReajustado = await db.getFirstAsync<{ fecha_inicio: string }>(
      "SELECT fecha_inicio FROM grupos WHERE id=1"
    );
    const historial = await db.getFirstAsync<{
      fecha_origen: string;
      fecha_destino: string;
    }>(
      "SELECT fecha_origen,fecha_destino FROM reajustes_grupo WHERE grupo_id=1"
    );
    assert.equal(grupoReajustado?.fecha_inicio, "2026-09-01");
    assert.deepEqual(historial, {
      fecha_origen: "2026-09-08",
      fecha_destino: "2026-09-01",
    });

    await reajusteRepository.deshacer(1, "2026-09-08");

    assert.deepEqual(await fechasRegulares(), [
      "2026-09-08", "2026-09-22", "2026-10-13", "2026-10-27",
    ]);
    const grupoRestaurado = await db.getFirstAsync<{ fecha_inicio: string }>(
      "SELECT fecha_inicio FROM grupos WHERE id=1"
    );
    assert.equal(grupoRestaurado?.fecha_inicio, "2026-09-08");
  });

  test("al mover 15 al 8 conserva el 1 y no genera una tercera clase el 22", async () => {
    await prepararBase("2026-09-01");

    await reajusteRepository.reajustar(1, "2026-09-15", "2026-09-08");

    assert.deepEqual(await fechasRegulares(), [
      "2026-09-01", "2026-09-08", "2026-10-13", "2026-10-27",
    ]);
    const db = await databasePromise;
    const veintidos = await db.getFirstAsync<{ total: number }>(
      `SELECT COUNT(*) AS total FROM agenda_alumnos
       WHERE grupo_id=1 AND fecha='2026-09-22' AND estado!='cancelada'`
    );
    assert.equal(veintidos?.total, 0);
  });

  test("una clase completa movida anteriormente también cuenta dentro de las dos del mes", async () => {
    const db = await prepararBase("2026-09-01");
    await db.runAsync(
      `UPDATE agenda_alumnos
       SET tipo='manual', feriado_origen='2026-09-01',
         feriado_tipo_origen='regular', motivo_movimiento='compromiso'
       WHERE fecha='2026-09-01'`
    );

    await reajusteRepository.reajustar(1, "2026-09-15", "2026-09-08");

    const septiembre = await db.getAllAsync<{ fecha: string }>(
      `SELECT DISTINCT fecha FROM agenda_alumnos
       WHERE grupo_id=1 AND estado!='cancelada'
         AND fecha BETWEEN '2026-09-01' AND '2026-09-30' ORDER BY fecha`
    );
    assert.deepEqual(septiembre.map(item => item.fecha), ["2026-09-01", "2026-09-08"]);
  });

  test("un conflicto en una fecha anterior cancela todo el reajuste", async () => {
    const db = await prepararBase("2026-09-08");
    await db.runAsync(
      `INSERT INTO agenda_alumnos
       (id,alumno_id,grupo_id,fecha,tipo,estado)
       VALUES (99,2,1,'2026-09-01','manual','programada')`
    );

    await assert.rejects(
      reajusteRepository.reajustar(1, "2026-09-08", "2026-09-01"),
      /Berta ya tiene una clase/
    );

    assert.deepEqual(await fechasRegulares(), [
      "2026-09-08", "2026-09-22", "2026-10-13", "2026-10-27",
    ]);
    const grupo = await db.getFirstAsync<{ fecha_inicio: string }>(
      "SELECT fecha_inicio FROM grupos WHERE id=1"
    );
    const historial = await db.getFirstAsync<{ total: number }>(
      "SELECT COUNT(*) AS total FROM reajustes_grupo"
    );
    assert.equal(grupo?.fecha_inicio, "2026-09-08");
    assert.equal(historial?.total, 0);
  });

  test("al mover 20 al 13 conserva la clase del 6, omite el 27 y mueve recuperaciones", async () => {
    await reiniciarBasePrueba();
    const db = await databasePromise;
    await crearEsquema(db as unknown as Parameters<typeof crearEsquema>[0]);
    await db.execAsync(`
      INSERT INTO grupos
        (id,nombre,dia,hora,capacidad,color,frecuencia,fecha_inicio)
      VALUES
        (1,'Martes naranja',2,'18:00',4,'#A66A24','quincenal','2026-10-06'),
        (2,'Otro grupo',5,'18:00',4,'#315B50','quincenal','2026-10-02');
      INSERT INTO alumnos
        (id,nombre,frecuencia,grupo_id,pendientes,fecha_inicio)
      VALUES
        (1,'Ana','quincenal',1,0,'2026-10-06'),
        (2,'Berta','quincenal',1,0,'2026-10-06'),
        (3,'Carla','quincenal',2,0,'2026-10-02');
      INSERT INTO agenda_alumnos
        (id,alumno_id,grupo_id,fecha,tipo,estado,modelo_id,necesidades)
      VALUES
        (10,1,1,'2026-10-06','regular','programada',NULL,NULL),
        (11,1,1,'2026-10-20','regular','programada',NULL,NULL),
        (12,1,1,'2026-11-03','regular','programada',NULL,NULL),
        (13,1,1,'2026-11-17','regular','programada',NULL,NULL),
        (20,2,1,'2026-10-06','regular','programada',NULL,NULL),
        (21,2,1,'2026-10-20','regular','programada',NULL,NULL),
        (22,2,1,'2026-11-03','regular','programada',NULL,NULL),
        (23,2,1,'2026-11-17','regular','programada',NULL,NULL),
        (90,3,1,'2026-10-20','recuperacion','programada',7,'Arcilla roja');
      INSERT INTO clases (alumno_id,grupo_id,fecha,estado)
      VALUES (3,1,'2026-10-20','recuperacion');
      INSERT INTO movimientos_pendientes
        (id,alumno_id,agenda_id,delta,tipo,clave,fecha,creado_en)
      VALUES
        (1,3,NULL,1,'saldo_inicial','saldo:carla','2026-10-01','2026-10-01T12:00:00.000Z'),
        (2,3,90,-1,'recuperacion','recuperacion:carla', '2026-10-20','2026-10-01T12:00:00.000Z');
    `);

    await reajusteRepository.reajustar(1, "2026-10-20", "2026-10-13");

    const octubre = await db.getAllAsync<{ fecha: string }>(
      `SELECT fecha FROM agenda_alumnos
       WHERE alumno_id=1 AND tipo='regular' AND estado!='cancelada'
         AND fecha BETWEEN '2026-10-01' AND '2026-10-31' ORDER BY fecha`
    );
    const noviembre = await db.getAllAsync<{ fecha: string }>(
      `SELECT fecha FROM agenda_alumnos
       WHERE alumno_id=1 AND tipo='regular' AND estado!='cancelada'
         AND fecha BETWEEN '2026-11-01' AND '2026-11-30' ORDER BY fecha`
    );
    const recuperacion = await db.getFirstAsync<{
      fecha: string;
      tipo: string;
      modelo_id: number;
      necesidades: string;
    }>("SELECT fecha,tipo,modelo_id,necesidades FROM agenda_alumnos WHERE id=90");
    const clase = await db.getFirstAsync<{ fecha: string }>(
      "SELECT fecha FROM clases WHERE alumno_id=3 AND estado='recuperacion'"
    );
    const movimiento = await db.getFirstAsync<{ fecha: string }>(
      "SELECT fecha FROM movimientos_pendientes WHERE agenda_id=90"
    );
    assert.deepEqual(octubre.map(item => item.fecha), ["2026-10-06", "2026-10-13"]);
    assert.deepEqual(noviembre.map(item => item.fecha), ["2026-11-10", "2026-11-24"]);
    assert.deepEqual(recuperacion, {
      fecha: "2026-10-13",
      tipo: "recuperacion",
      modelo_id: 7,
      necesidades: "Arcilla roja",
    });
    assert.equal(clase?.fecha, "2026-10-13");
    assert.equal(movimiento?.fecha, "2026-10-13");

    await reajusteRepository.deshacer(1, "2026-10-20");

    const octubreRestaurado = await db.getAllAsync<{ fecha: string }>(
      `SELECT fecha FROM agenda_alumnos
       WHERE alumno_id=1 AND tipo='regular' AND estado!='cancelada'
         AND fecha BETWEEN '2026-10-01' AND '2026-10-31' ORDER BY fecha`
    );
    const recuperacionRestaurada = await db.getFirstAsync<{ fecha: string }>(
      "SELECT fecha FROM agenda_alumnos WHERE id=90"
    );
    assert.deepEqual(octubreRestaurado.map(item => item.fecha), ["2026-10-06", "2026-10-20"]);
    assert.equal(recuperacionRestaurada?.fecha, "2026-10-20");
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
    await reajusteRepository.deshacer(1, "2026-09-01");
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

    await reajusteRepository.deshacer(1, "2026-09-04");
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
      reajusteRepository.deshacer(1, "2026-09-01"),
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

  test("identifica y deshace siempre el último reajuste activo del grupo", async () => {
    await reajusteRepository.reajustar(1, "2026-09-01", "2026-09-08");
    await reajusteRepository.reajustar(1, "2026-09-22", "2026-09-15");

    const ultimo = await reajusteRepository.obtenerUltimoActivo(1);
    assert.equal(ultimo?.fecha_origen, "2026-09-22");
    assert.equal(ultimo?.fecha_destino, "2026-09-15");
    await assert.rejects(
      reajusteRepository.deshacer(1, "2026-09-01"),
      /reajuste posterior/
    );

    await reajusteRepository.deshacerUltimo(1);
    assert.deepEqual(await fechasRegulares(), [
      "2026-09-08", "2026-09-22", "2026-10-13", "2026-10-27",
    ]);
    const anterior = await reajusteRepository.obtenerUltimoActivo(1);
    assert.equal(anterior?.fecha_origen, "2026-09-01");

    await reajusteRepository.deshacerUltimo(1);
    assert.deepEqual(await fechasRegulares(), [
      "2026-09-01", "2026-09-15", "2026-10-06", "2026-10-20",
    ]);
    assert.equal(await reajusteRepository.obtenerUltimoActivo(1), null);
  });

  test("editar la fecha de inicio del grupo crea un reajuste que se puede deshacer", async () => {
    const db = await databasePromise;
    await db.runAsync(
      "UPDATE agenda_alumnos SET modelo_id=7, necesidades='Arcilla roja' WHERE id=10"
    );

    await grupoRepository.editar(1, {
      nombre: "Martes A",
      dia: 2,
      hora: "18:00",
      capacidad: 4,
      color: "#315B50",
      notificacion: 0,
      minutos_antes: 1440,
      frecuencia: "quincenal",
      fecha_inicio: "2026-09-08",
    });

    assert.deepEqual(await fechasRegulares(), [
      "2026-09-08", "2026-09-22", "2026-10-13", "2026-10-27",
    ]);
    const historial = await reajusteRepository.obtenerUltimoActivo(1);
    const modelo = await db.getFirstAsync<{ fecha: string; modelo_id: number; necesidades: string }>(
      "SELECT fecha,modelo_id,necesidades FROM agenda_alumnos WHERE id=10"
    );
    assert.equal(historial?.fecha_origen, "2026-09-01");
    assert.equal(historial?.fecha_destino, "2026-09-08");
    assert.deepEqual(modelo, {
      fecha: "2026-09-08",
      modelo_id: 7,
      necesidades: "Arcilla roja",
    });

    await reajusteRepository.deshacerUltimo(1);
    assert.deepEqual(await fechasRegulares(), [
      "2026-09-01", "2026-09-15", "2026-10-06", "2026-10-20",
    ]);
  });

  test("una fecha de inicio vieja incorrecta usa la primera clase futura real para repararse", async () => {
    const db = await databasePromise;
    await db.runAsync(
      "DELETE FROM agenda_alumnos WHERE grupo_id=1 AND fecha='2026-09-01'"
    );

    await grupoRepository.editar(1, {
      nombre: "Martes A",
      dia: 2,
      hora: "18:00",
      capacidad: 4,
      color: "#315B50",
      notificacion: 0,
      minutos_antes: 1440,
      frecuencia: "quincenal",
      fecha_inicio: "2026-09-08",
    });

    const historial = await reajusteRepository.obtenerUltimoActivo(1);
    assert.equal(historial?.fecha_origen, "2026-09-15");
    assert.equal(historial?.fecha_destino, "2026-09-08");
    assert.deepEqual(await fechasRegulares(), [
      "2026-09-08", "2026-09-22", "2026-10-13", "2026-10-27",
    ]);
  });
});
