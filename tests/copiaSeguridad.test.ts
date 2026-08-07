import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

import { crearEsquema } from "../database/schema";
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
import { reiniciarArchivosPrueba } from "./helpers/expoFileSystem";
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
     VALUES (1,'Ana','2474000000','semanal',1,1,'2026-08-07')`
  );
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

    await db.runAsync("UPDATE alumnos SET nombre = 'Ana modificada', pendientes = 5 WHERE id = 1");
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
});
