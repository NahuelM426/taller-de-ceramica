import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

import { crearEsquema } from "../database/schema";
import { ajustarSaldoPendientes } from "../database/pendientes";
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
});
