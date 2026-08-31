import assert from "node:assert/strict";
import { test } from "node:test";

import { crearEsquema, migrarColumnas } from "../database/schema";
import { databasePromise, reiniciarBasePrueba } from "./helpers/connection";

test("migra la restricción de movimientos y conserva los datos existentes", async () => {
  await reiniciarBasePrueba();
  const db = await databasePromise;
  await crearEsquema(db as unknown as Parameters<typeof crearEsquema>[0]);
  await db.execAsync(`
    DROP TABLE feriados;
    CREATE TABLE feriados (
      fecha TEXT PRIMARY KEY,
      motivo TEXT NOT NULL DEFAULT 'Feriado',
      fecha_recuperacion TEXT,
      tipo TEXT NOT NULL DEFAULT 'feriado'
        CHECK(tipo IN ('feriado','compromiso'))
    );
    INSERT INTO feriados (fecha,motivo,fecha_recuperacion,tipo) VALUES
      ('2026-08-07','Taller cerrado','2026-08-08','feriado'),
      ('2026-08-14','Compromiso','2026-08-15','compromiso');
  `);

  await migrarColumnas(db as unknown as Parameters<typeof migrarColumnas>[0]);

  const existentes = await db.getAllAsync<{ fecha: string; grupo_id: number; tipo: string }>(
    "SELECT fecha,grupo_id,tipo FROM feriados ORDER BY fecha"
  );
  assert.deepEqual(existentes, [
    { fecha: "2026-08-07", grupo_id: 0, tipo: "feriado" },
    { fecha: "2026-08-14", grupo_id: 0, tipo: "compromiso" },
  ]);
  await db.runAsync(
    `INSERT INTO feriados (fecha,motivo,fecha_recuperacion,tipo)
     VALUES ('2026-08-21','Reajuste del mes siguiente','2026-08-22','reajuste')`
  );
  const reajuste = await db.getFirstAsync<{ tipo: string }>(
    "SELECT tipo FROM feriados WHERE fecha = '2026-08-21'"
  );
  assert.equal(reajuste?.tipo, "reajuste");
  await db.runAsync(
    `INSERT INTO feriados (fecha,grupo_id,motivo,fecha_recuperacion,tipo)
     VALUES ('2026-08-21',2,'Otro grupo','2026-08-23','compromiso')`
  );

  await migrarColumnas(db as unknown as Parameters<typeof migrarColumnas>[0]);
  const cantidad = await db.getFirstAsync<{ total: number }>(
    "SELECT COUNT(*) AS total FROM feriados"
  );
  assert.equal(cantidad?.total, 4);
});

test("agrega el historial de reajustes a una base existente de forma idempotente", async () => {
  await reiniciarBasePrueba();
  const db = await databasePromise;
  await crearEsquema(db as unknown as Parameters<typeof crearEsquema>[0]);
  await db.runAsync(
    `INSERT INTO grupos
     (id,nombre,dia,hora,capacidad,color,frecuencia,fecha_inicio)
     VALUES (1,'Existente',2,'18:00',4,'#315B50','quincenal','2026-09-01')`
  );
  await db.execAsync("DROP TABLE reajustes_grupo");

  await crearEsquema(db as unknown as Parameters<typeof crearEsquema>[0]);
  await crearEsquema(db as unknown as Parameters<typeof crearEsquema>[0]);

  const grupo = await db.getFirstAsync<{ nombre: string }>(
    "SELECT nombre FROM grupos WHERE id=1"
  );
  const tabla = await db.getFirstAsync<{ nombre: string }>(
    "SELECT name AS nombre FROM sqlite_master WHERE type='table' AND name='reajustes_grupo'"
  );
  assert.equal(grupo?.nombre, "Existente");
  assert.equal(tabla?.nombre, "reajustes_grupo");
});

test("agrega créditos usados y vínculo de clase extra a una base existente", async () => {
  await reiniciarBasePrueba();
  const db = await databasePromise;
  await crearEsquema(db as unknown as Parameters<typeof crearEsquema>[0]);
  await db.execAsync(`
    INSERT INTO grupos
      (id,nombre,dia,hora,capacidad,color,frecuencia,fecha_inicio)
    VALUES (1,'Existente',2,'18:00',4,'#315B50','semanal','2026-08-04');
    INSERT INTO alumnos
      (id,nombre,frecuencia,grupo_id,fecha_inicio)
    VALUES (1,'Ana','semanal',1,'2026-08-04');
    DROP TABLE pagos_alumnos;
    CREATE TABLE pagos_alumnos (
      alumno_id INTEGER NOT NULL,
      mes TEXT NOT NULL,
      pagado INTEGER NOT NULL DEFAULT 0,
      clases_pagadas INTEGER NOT NULL,
      clases_extra INTEGER NOT NULL DEFAULT 0,
      fecha_pago TEXT,
      actualizado_en TEXT NOT NULL,
      PRIMARY KEY (alumno_id, mes)
    );
    INSERT INTO pagos_alumnos
      (alumno_id,mes,pagado,clases_pagadas,clases_extra,fecha_pago,actualizado_en)
    VALUES (1,'2026-08',1,4,2,'2026-08-01','2026-08-01');
  `);
  const columnasAgenda = await db.getAllAsync<{ name: string }>("PRAGMA table_info(agenda_alumnos)");
  if (columnasAgenda.some(columna => columna.name === "pago_extra_mes")) {
    await db.execAsync(`
      ALTER TABLE agenda_alumnos RENAME TO agenda_alumnos_nueva;
      CREATE TABLE agenda_alumnos (
        id INTEGER PRIMARY KEY AUTOINCREMENT, alumno_id INTEGER NOT NULL,
        grupo_id INTEGER NOT NULL, fecha TEXT NOT NULL,
        tipo TEXT NOT NULL DEFAULT 'regular', estado TEXT NOT NULL DEFAULT 'programada',
        modelo_id INTEGER, necesidades TEXT, cubre_agenda_id INTEGER,
        origen_agenda_id INTEGER, feriado_origen TEXT, feriado_tipo_origen TEXT,
        motivo_movimiento TEXT, UNIQUE(alumno_id, fecha)
      );
      DROP TABLE agenda_alumnos_nueva;
    `);
  }

  await migrarColumnas(db as unknown as Parameters<typeof migrarColumnas>[0]);
  await migrarColumnas(db as unknown as Parameters<typeof migrarColumnas>[0]);

  const pago = await db.getFirstAsync<{ clases_extra: number; clases_extra_usadas: number }>(
    "SELECT clases_extra,clases_extra_usadas FROM pagos_alumnos WHERE alumno_id=1 AND mes='2026-08'"
  );
  const agenda = await db.getAllAsync<{ name: string }>("PRAGMA table_info(agenda_alumnos)");
  assert.deepEqual(pago, { clases_extra: 2, clases_extra_usadas: 0 });
  assert.ok(agenda.some(columna => columna.name === "pago_extra_mes"));
  assert.ok(agenda.some(columna => columna.name === "extra_adeudada"));
});

test("agrega categorías de pendientes y reconoce ausencias de extras pagadas", async () => {
  await reiniciarBasePrueba();
  const db = await databasePromise;
  await crearEsquema(db as unknown as Parameters<typeof crearEsquema>[0]);
  await db.execAsync(`
    INSERT INTO grupos
      (id,nombre,dia,hora,capacidad,color,frecuencia,fecha_inicio)
    VALUES (1,'Existente',2,'18:00',4,'#315B50','semanal','2026-08-04');
    INSERT INTO alumnos
      (id,nombre,frecuencia,grupo_id,pendientes,fecha_inicio)
    VALUES (1,'Ana','semanal',1,1,'2026-08-04');
    INSERT INTO agenda_alumnos
      (id,alumno_id,grupo_id,fecha,tipo,estado,pago_extra_mes,extra_adeudada)
    VALUES (10,1,1,'2026-08-11','manual','ausente','2026-08',0);
    DROP TABLE movimientos_pendientes;
    CREATE TABLE movimientos_pendientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alumno_id INTEGER NOT NULL,
      agenda_id INTEGER,
      delta INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      clave TEXT NOT NULL UNIQUE,
      revierte_movimiento_id INTEGER UNIQUE,
      fecha TEXT NOT NULL,
      creado_en TEXT NOT NULL
    );
    INSERT INTO movimientos_pendientes
      (id,alumno_id,agenda_id,delta,tipo,clave,fecha,creado_en)
    VALUES (1,1,10,1,'ausencia','ausencia:extra:legacy','2026-08-11','2026-08-11');
  `);

  await migrarColumnas(db as unknown as Parameters<typeof migrarColumnas>[0]);
  await migrarColumnas(db as unknown as Parameters<typeof migrarColumnas>[0]);

  const columnas = await db.getAllAsync<{ name: string }>(
    "PRAGMA table_info(movimientos_pendientes)"
  );
  const movimiento = await db.getFirstAsync<{ categoria: string }>(
    "SELECT categoria FROM movimientos_pendientes WHERE id=1"
  );
  assert.ok(columnas.some(columna => columna.name === "categoria"));
  assert.equal(movimiento?.categoria, "extra");
});
