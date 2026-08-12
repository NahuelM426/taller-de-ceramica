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

  const existentes = await db.getAllAsync<{ fecha: string; tipo: string }>(
    "SELECT fecha,tipo FROM feriados ORDER BY fecha"
  );
  assert.deepEqual(existentes, [
    { fecha: "2026-08-07", tipo: "feriado" },
    { fecha: "2026-08-14", tipo: "compromiso" },
  ]);
  await db.runAsync(
    `INSERT INTO feriados (fecha,motivo,fecha_recuperacion,tipo)
     VALUES ('2026-08-21','Reajuste del mes siguiente','2026-08-22','reajuste')`
  );
  const reajuste = await db.getFirstAsync<{ tipo: string }>(
    "SELECT tipo FROM feriados WHERE fecha = '2026-08-21'"
  );
  assert.equal(reajuste?.tipo, "reajuste");

  await migrarColumnas(db as unknown as Parameters<typeof migrarColumnas>[0]);
  const cantidad = await db.getFirstAsync<{ total: number }>(
    "SELECT COUNT(*) AS total FROM feriados"
  );
  assert.equal(cantidad?.total, 3);
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
