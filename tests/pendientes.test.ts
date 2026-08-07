import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

import {
  ajustarSaldoPendientes,
  auditarConsistenciaPendientes,
  migrarSaldoInicialPendientes,
  registrarMovimientoPendiente,
  saldoPendientes,
  verificarConsistenciaPendientes,
} from "../database/pendientes";
import { crearEsquema } from "../database/schema";
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
     (id,nombre,frecuencia,grupo_id,pendientes,fecha_inicio)
     VALUES (1,'Ana','semanal',1,0,'2026-08-07')`
  );
  return db;
}

describe("libro de movimientos de pendientes", () => {
  beforeEach(prepararBase);

  test("migra el saldo actual una sola vez", async () => {
    const db = await databasePromise;
    await db.runAsync("UPDATE alumnos SET pendientes = 3 WHERE id = 1");

    await migrarSaldoInicialPendientes(db);
    await migrarSaldoInicialPendientes(db);

    const movimientos = await db.getAllAsync<{ delta: number; tipo: string }>(
      "SELECT delta,tipo FROM movimientos_pendientes WHERE alumno_id = 1"
    );
    assert.deepEqual(movimientos, [{ delta: 3, tipo: "saldo_inicial" }]);
    assert.equal(await saldoPendientes(db, 1), 3);
    assert.deepEqual(await auditarConsistenciaPendientes(db), []);
  });

  test("una clave repetida no duplica el saldo", async () => {
    const db = await databasePromise;
    const movimiento = {
      alumnoId: 1,
      delta: 1,
      tipo: "ausencia" as const,
      clave: "ausencia:agenda:10",
      agendaId: null,
      fecha: "2026-08-07",
    };

    const primero = await registrarMovimientoPendiente(db, movimiento);
    const segundo = await registrarMovimientoPendiente(db, movimiento);

    const cantidad = await db.getFirstAsync<{ total: number }>(
      "SELECT COUNT(*) AS total FROM movimientos_pendientes"
    );
    assert.equal(primero.creado, true);
    assert.equal(segundo.creado, false);
    assert.equal(cantidad?.total, 1);
    assert.equal(await saldoPendientes(db, 1), 1);
  });

  test("los ajustes manuales dejan historial y actualizan el caché", async () => {
    const db = await databasePromise;
    await ajustarSaldoPendientes(db, 1, 4, "ajuste:test:1");
    await ajustarSaldoPendientes(db, 1, 2, "ajuste:test:2");

    const deltas = await db.getAllAsync<{ delta: number }>(
      "SELECT delta FROM movimientos_pendientes ORDER BY id"
    );
    const alumno = await db.getFirstAsync<{ pendientes: number }>(
      "SELECT pendientes FROM alumnos WHERE id = 1"
    );
    assert.deepEqual(deltas.map(item => item.delta), [4, -2]);
    assert.equal(alumno?.pendientes, 2);
    assert.equal(await saldoPendientes(db, 1), 2);
  });

  test("la auditoría informa un contador alterado y no lo corrige", async () => {
    const db = await databasePromise;
    await ajustarSaldoPendientes(db, 1, 1, "ajuste:test:auditoria");
    await db.runAsync("UPDATE alumnos SET pendientes = 5 WHERE id = 1");

    const inconsistencias = await auditarConsistenciaPendientes(db);
    assert.equal(inconsistencias.length, 1);
    assert.equal(inconsistencias[0].pendientes_cache, 5);
    assert.equal(inconsistencias[0].saldo_calculado, 1);
    await assert.rejects(
      verificarConsistenciaPendientes(db),
      /saldos de pendientes inconsistentes/
    );
    const alumno = await db.getFirstAsync<{ pendientes: number }>(
      "SELECT pendientes FROM alumnos WHERE id = 1"
    );
    assert.equal(alumno?.pendientes, 5);
  });
});
