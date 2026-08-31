import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

import { crearEsquema } from "../database/schema";
import { ajustarSaldoPendientes } from "../database/pendientes";
import { reajusteRepository } from "../repositories/reajusteRepository";
import {
  compartirCopiaSeguridad,
  elegirCopiaSeguridad,
  hayCopiaDeEmergencia,
  restaurarCopiaDeEmergencia,
  restaurarCopiaSeguridad,
} from "../lib/copiaSeguridad";
import {
  databasePromise,
  reiniciarBasePrueba,
} from "./helpers/connection";
import { elegirDocumentoPrueba } from "./helpers/expoDocumentPicker";
import { File, reiniciarArchivosPrueba } from "./helpers/expoFileSystem";
import {
  reiniciarCompartidosPrueba,
  ultimoArchivoCompartido,
} from "./helpers/expoSharing";

async function prepararBase() {
  await reiniciarBasePrueba();
  reiniciarArchivosPrueba();
  reiniciarCompartidosPrueba();
  const db = await databasePromise;
  await crearEsquema(db as unknown as Parameters<typeof crearEsquema>[0]);
  await db.runAsync(
    `INSERT INTO grupos
     (id,nombre,dia,hora,capacidad,color,frecuencia,fecha_inicio)
     VALUES (1,'Viernes',5,'18:00',4,'#315B50','semanal','2026-08-07')`
  );
  await db.runAsync(
    `INSERT INTO alumnos
     (id,nombre,telefono,frecuencia,grupo_id,pendientes,fecha_inicio)
     VALUES (1,'Ana','2474000000','semanal',1,0,'2026-08-07')`
  );
  await ajustarSaldoPendientes(db, 1, 1, "test:saldo:respaldo");
  await db.runAsync(
    `INSERT INTO agenda_alumnos
     (id,alumno_id,grupo_id,fecha,tipo,estado,necesidades)
     VALUES (1,1,1,'2026-08-07','regular','ausente','Taza')`
  );
  return db;
}

describe("copia y restauración de datos", () => {
  beforeEach(prepararBase);

  test("restaura todas las tablas y permite deshacer la restauración", async () => {
    const db = await databasePromise;
    const resumen = await compartirCopiaSeguridad();
    const uri = ultimoArchivoCompartido();
    assert.ok(uri);
    assert.equal(resumen.alumnos, 1);
    assert.equal(resumen.grupos, 1);
    assert.equal(resumen.clases, 1);

    await db.runAsync("UPDATE alumnos SET nombre = 'Ana modificada' WHERE id = 1");
    await ajustarSaldoPendientes(db, 1, 5, "test:saldo:modificado");
    await db.runAsync(
      `INSERT INTO grupos
       (id,nombre,dia,hora,capacidad,color,frecuencia,fecha_inicio)
       VALUES (2,'Temporal',1,'14:00',2,'#C96F4A','semanal','2026-08-10')`
    );

    elegirDocumentoPrueba(uri);
    const seleccion = await elegirCopiaSeguridad();
    assert.ok(seleccion);
    await restaurarCopiaSeguridad(seleccion.copia);

    const restaurada = await db.getFirstAsync<{ nombre: string; pendientes: number }>(
      "SELECT nombre,pendientes FROM alumnos WHERE id = 1"
    );
    const grupoTemporal = await db.getFirstAsync(
      "SELECT id FROM grupos WHERE id = 2"
    );
    assert.deepEqual(restaurada, { nombre: "Ana", pendientes: 1 });
    assert.equal(grupoTemporal, null);
    assert.equal(hayCopiaDeEmergencia(), true);

    await restaurarCopiaDeEmergencia();

    const estadoAnterior = await db.getFirstAsync<{ nombre: string; pendientes: number }>(
      "SELECT nombre,pendientes FROM alumnos WHERE id = 1"
    );
    const grupoRecuperado = await db.getFirstAsync<{ nombre: string }>(
      "SELECT nombre FROM grupos WHERE id = 2"
    );
    assert.deepEqual(estadoAnterior, { nombre: "Ana modificada", pendientes: 5 });
    assert.equal(grupoRecuperado?.nombre, "Temporal");
    assert.equal(hayCopiaDeEmergencia(), false);
  });

  test("convierte un respaldo de formato 1 en un saldo inicial", async () => {
    const db = await databasePromise;
    await compartirCopiaSeguridad();
    const uriActual = ultimoArchivoCompartido();
    assert.ok(uriActual);
    const contenido = JSON.parse(await new File(uriActual).text()) as {
      versionFormato: number;
      tablas: Record<string, unknown>;
    };
    contenido.versionFormato = 1;
    delete contenido.tablas.movimientos_pendientes;
    const archivoAnterior = new File("memory://cache/respaldo-v1.json");
    archivoAnterior.create();
    archivoAnterior.write(JSON.stringify(contenido));

    await ajustarSaldoPendientes(db, 1, 3, "test:saldo:posterior");
    elegirDocumentoPrueba(archivoAnterior.uri);
    const seleccion = await elegirCopiaSeguridad();
    assert.ok(seleccion);
    await restaurarCopiaSeguridad(seleccion.copia);

    const alumno = await db.getFirstAsync<{ pendientes: number }>(
      "SELECT pendientes FROM alumnos WHERE id = 1"
    );
    const movimiento = await db.getFirstAsync<{ delta: number; tipo: string }>(
      "SELECT delta,tipo FROM movimientos_pendientes WHERE alumno_id = 1"
    );
    assert.equal(alumno?.pendientes, 1);
    assert.deepEqual(movimiento, { delta: 1, tipo: "saldo_inicial" });
  });

  test("restaura una copia que contiene un reajuste", async () => {
    const db = await databasePromise;
    await db.runAsync(
      `UPDATE grupos SET frecuencia='quincenal',dia=5,fecha_inicio='2026-08-07'
       WHERE id=1`
    );
    await db.runAsync(
      "UPDATE agenda_alumnos SET estado = 'programada' WHERE id = 1"
    );
    await reajusteRepository.reajustar(1, "2026-08-07", "2026-08-14");
    await compartirCopiaSeguridad();
    const uri = ultimoArchivoCompartido();
    assert.ok(uri);

    await db.runAsync("DELETE FROM feriados");
    await db.runAsync(
      `UPDATE agenda_alumnos
       SET motivo_movimiento = NULL, feriado_origen = NULL
       WHERE id = 1`
    );
    elegirDocumentoPrueba(uri);
    const seleccion = await elegirCopiaSeguridad();
    assert.ok(seleccion);
    await restaurarCopiaSeguridad(seleccion.copia);

    const reajuste = await db.getFirstAsync<{
      tipo: string; fecha_recuperacion: string;
    }>("SELECT tipo,fecha_recuperacion FROM feriados WHERE fecha = '2026-08-07'");
    const agenda = await db.getFirstAsync<{
      fecha: string; motivo_movimiento: string; feriado_origen: string;
    }>("SELECT fecha,motivo_movimiento,feriado_origen FROM agenda_alumnos WHERE id = 1");
    assert.deepEqual(reajuste, {
      tipo: "reajuste",
      fecha_recuperacion: "2026-08-14",
    });
    assert.deepEqual(agenda, {
      fecha: "2026-08-14",
      motivo_movimiento: "reajuste",
      feriado_origen: "2026-08-07",
    });
    const historial = await db.getFirstAsync<{ fecha_inicio_nueva: string }>(
      "SELECT fecha_inicio_nueva FROM reajustes_grupo WHERE fecha_origen='2026-08-07'"
    );
    assert.equal(historial?.fecha_inicio_nueva, "2026-08-14");
  });

  test("acepta una copia anterior de formato 2 sin historial de reajustes", async () => {
    const db = await databasePromise;
    await db.runAsync(
      `INSERT INTO feriados (fecha,grupo_id,motivo,fecha_recuperacion,tipo)
       VALUES ('2026-08-14',1,'Feriado','2026-08-15','feriado')`
    );
    await compartirCopiaSeguridad();
    const uriActual = ultimoArchivoCompartido();
    assert.ok(uriActual);
    const contenido = JSON.parse(await new File(uriActual).text()) as {
      versionFormato: number;
      tablas: Record<string, unknown>;
    };
    contenido.versionFormato = 2;
    delete contenido.tablas.reajustes_grupo;
    for (const movimiento of contenido.tablas.feriados as Array<Record<string, unknown>>) {
      delete movimiento.grupo_id;
    }
    const archivoAnterior = new File("memory://cache/respaldo-v2.json");
    archivoAnterior.create();
    archivoAnterior.write(JSON.stringify(contenido));

    elegirDocumentoPrueba(archivoAnterior.uri);
    const seleccion = await elegirCopiaSeguridad();
    assert.ok(seleccion);
    await restaurarCopiaSeguridad(seleccion.copia);
    const historiales = await db.getFirstAsync<{ total: number }>(
      "SELECT COUNT(*) AS total FROM reajustes_grupo"
    );
    const movimientoLegacy = await db.getFirstAsync<{ grupo_id: number }>(
      "SELECT grupo_id FROM feriados WHERE fecha = '2026-08-14'"
    );
    assert.equal(historiales?.total, 0);
    assert.equal(movimientoLegacy?.grupo_id, 0);
  });

  test("respalda y restaura todos los modelos elegidos para una persona", async () => {
    const db = await databasePromise;
    await db.execAsync(`
      INSERT INTO modelos (id,nombre) VALUES (1,'Taza'),(2,'Plato');
      UPDATE agenda_alumnos SET modelo_id=1 WHERE id=1;
      INSERT INTO agenda_modelos (agenda_id,modelo_id,orden)
      VALUES (1,1,0),(1,2,1);
    `);
    await compartirCopiaSeguridad();
    const uri = ultimoArchivoCompartido();
    assert.ok(uri);

    await db.runAsync("DELETE FROM agenda_modelos WHERE agenda_id=1");
    elegirDocumentoPrueba(uri);
    const seleccion = await elegirCopiaSeguridad();
    assert.ok(seleccion);
    await restaurarCopiaSeguridad(seleccion.copia);

    const relaciones = await db.getAllAsync<{ modelo_id: number; orden: number }>(
      "SELECT modelo_id,orden FROM agenda_modelos WHERE agenda_id=1 ORDER BY orden"
    );
    assert.deepEqual(relaciones, [
      { modelo_id: 1, orden: 0 },
      { modelo_id: 2, orden: 1 },
    ]);
  });

  test("respalda y restaura el historial mensual de pagos", async () => {
    const db = await databasePromise;
    await db.runAsync(
      `INSERT INTO pagos_alumnos
        (alumno_id,mes,pagado,clases_pagadas,clases_extra,clases_extra_usadas,fecha_pago,actualizado_en)
       VALUES (1,'2026-08',1,4,2,1,'2026-08-05T12:00:00.000Z','2026-08-05T12:00:00.000Z')`
    );
    await compartirCopiaSeguridad();
    const uri = ultimoArchivoCompartido();
    assert.ok(uri);

    await db.runAsync("DELETE FROM pagos_alumnos");
    elegirDocumentoPrueba(uri);
    const seleccion = await elegirCopiaSeguridad();
    assert.ok(seleccion);
    await restaurarCopiaSeguridad(seleccion.copia);

    const pago = await db.getFirstAsync<{
      pagado: number; clases_pagadas: number; clases_extra: number; clases_extra_usadas: number;
    }>("SELECT pagado,clases_pagadas,clases_extra,clases_extra_usadas FROM pagos_alumnos WHERE alumno_id=1 AND mes='2026-08'");
    assert.deepEqual(pago, {
      pagado: 1, clases_pagadas: 4, clases_extra: 2, clases_extra_usadas: 1,
    });
  });

  test("acepta una copia de formato 5 sin pagos mensuales", async () => {
    const db = await databasePromise;
    await compartirCopiaSeguridad();
    const uriActual = ultimoArchivoCompartido();
    assert.ok(uriActual);
    const contenido = JSON.parse(await new File(uriActual).text()) as {
      versionFormato: number;
      tablas: Record<string, unknown>;
    };
    contenido.versionFormato = 5;
    delete contenido.tablas.pagos_alumnos;
    const archivoAnterior = new File("memory://cache/respaldo-v5.json");
    archivoAnterior.create();
    archivoAnterior.write(JSON.stringify(contenido));

    elegirDocumentoPrueba(archivoAnterior.uri);
    const seleccion = await elegirCopiaSeguridad();
    assert.ok(seleccion);
    await restaurarCopiaSeguridad(seleccion.copia);

    const pagos = await db.getFirstAsync<{ total: number }>(
      "SELECT COUNT(*) AS total FROM pagos_alumnos"
    );
    assert.equal(pagos?.total, 0);
  });

  test("restaura una copia de formato 6 anterior a los créditos de extras", async () => {
    const db = await databasePromise;
    await db.runAsync(
      `INSERT INTO pagos_alumnos
        (alumno_id,mes,pagado,clases_pagadas,clases_extra,fecha_pago,actualizado_en)
       VALUES (1,'2026-08',1,4,2,'2026-08-05','2026-08-05')`
    );
    await compartirCopiaSeguridad();
    const uriActual = ultimoArchivoCompartido();
    assert.ok(uriActual);
    const contenido = JSON.parse(await new File(uriActual).text()) as {
      versionFormato: number;
      tablas: Record<string, Array<Record<string, unknown>>>;
    };
    contenido.versionFormato = 6;
    for (const pago of contenido.tablas.pagos_alumnos) delete pago.clases_extra_usadas;
    for (const agenda of contenido.tablas.agenda_alumnos) {
      delete agenda.pago_extra_mes;
      delete agenda.extra_adeudada;
    }
    const archivoAnterior = new File("memory://cache/respaldo-v6.json");
    archivoAnterior.create();
    archivoAnterior.write(JSON.stringify(contenido));

    elegirDocumentoPrueba(archivoAnterior.uri);
    const seleccion = await elegirCopiaSeguridad();
    assert.ok(seleccion);
    await restaurarCopiaSeguridad(seleccion.copia);

    const pago = await db.getFirstAsync<{ clases_extra: number; clases_extra_usadas: number }>(
      "SELECT clases_extra,clases_extra_usadas FROM pagos_alumnos WHERE alumno_id=1 AND mes='2026-08'"
    );
    const agenda = await db.getFirstAsync<{
      pago_extra_mes: string | null; extra_adeudada: number;
    }>(
      "SELECT pago_extra_mes,extra_adeudada FROM agenda_alumnos WHERE id=1"
    );
    assert.deepEqual(pago, { clases_extra: 2, clases_extra_usadas: 0 });
    assert.deepEqual(agenda, { pago_extra_mes: null, extra_adeudada: 0 });
  });

  test("respalda y restaura una clase extra que todavía se debe", async () => {
    const db = await databasePromise;
    await db.runAsync(
      "UPDATE agenda_alumnos SET tipo='manual', extra_adeudada=1 WHERE id=1"
    );
    await compartirCopiaSeguridad();
    const uri = ultimoArchivoCompartido();
    assert.ok(uri);

    await db.runAsync("UPDATE agenda_alumnos SET extra_adeudada=0 WHERE id=1");
    elegirDocumentoPrueba(uri);
    const seleccion = await elegirCopiaSeguridad();
    assert.ok(seleccion);
    await restaurarCopiaSeguridad(seleccion.copia);

    const agenda = await db.getFirstAsync<{ extra_adeudada: number }>(
      "SELECT extra_adeudada FROM agenda_alumnos WHERE id=1"
    );
    assert.equal(agenda?.extra_adeudada, 1);
  });

  test("respalda y restaura pendientes de clases extra", async () => {
    const db = await databasePromise;
    await db.runAsync(
      "UPDATE movimientos_pendientes SET categoria='extra' WHERE alumno_id=1"
    );
    await compartirCopiaSeguridad();
    const uri = ultimoArchivoCompartido();
    assert.ok(uri);

    await db.runAsync(
      "UPDATE movimientos_pendientes SET categoria='regular' WHERE alumno_id=1"
    );
    elegirDocumentoPrueba(uri);
    const seleccion = await elegirCopiaSeguridad();
    assert.ok(seleccion);
    await restaurarCopiaSeguridad(seleccion.copia);

    const movimiento = await db.getFirstAsync<{ categoria: string }>(
      "SELECT categoria FROM movimientos_pendientes WHERE alumno_id=1"
    );
    assert.equal(movimiento?.categoria, "extra");
  });

  test("una copia de formato 8 restaura sus pendientes como habituales", async () => {
    const db = await databasePromise;
    await compartirCopiaSeguridad();
    const uriActual = ultimoArchivoCompartido();
    assert.ok(uriActual);
    const contenido = JSON.parse(await new File(uriActual).text()) as {
      versionFormato: number;
      tablas: Record<string, Array<Record<string, unknown>>>;
    };
    contenido.versionFormato = 8;
    for (const movimiento of contenido.tablas.movimientos_pendientes) {
      delete movimiento.categoria;
    }
    const archivoAnterior = new File("memory://cache/respaldo-v8.json");
    archivoAnterior.create();
    archivoAnterior.write(JSON.stringify(contenido));

    elegirDocumentoPrueba(archivoAnterior.uri);
    const seleccion = await elegirCopiaSeguridad();
    assert.ok(seleccion);
    await restaurarCopiaSeguridad(seleccion.copia);

    const movimiento = await db.getFirstAsync<{ categoria: string }>(
      "SELECT categoria FROM movimientos_pendientes WHERE alumno_id=1"
    );
    assert.equal(movimiento?.categoria, "regular");
  });
});
