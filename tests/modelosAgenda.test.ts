import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

import { crearEsquema, migrarModelosMultiples } from "../database/schema";
import {
  agendaDelDia,
  asignarModelosAgenda,
  asignarRecuperacion,
  pedidoModelosPendienteAlumno,
  quitarFechaAgenda,
  registrarAusencia,
} from "../repositories/agendaRepository";
import { notificacionRepository } from "../repositories/notificacionRepository";
import {
  databasePromise,
  reiniciarBasePrueba,
} from "./helpers/connection";

async function prepararBase() {
  await reiniciarBasePrueba();
  const db = await databasePromise;
  await crearEsquema(db as unknown as Parameters<typeof crearEsquema>[0]);
  await db.execAsync(`
    INSERT INTO grupos
      (id,nombre,dia,hora,capacidad,color,frecuencia,fecha_inicio)
    VALUES (1,'Martes',2,'18:00',4,'#315B50','semanal','2026-09-01');
    INSERT INTO alumnos
      (id,nombre,frecuencia,grupo_id,fecha_inicio)
    VALUES (1,'Ana','semanal',1,'2026-09-01');
    INSERT INTO modelos (id,nombre,tipo_arcilla)
    VALUES (1,'Taza','Blanca'),(2,'Plato','Roja'),(3,'Jarrón','Blanca');
    INSERT INTO agenda_alumnos
      (id,alumno_id,grupo_id,fecha,tipo,estado)
    VALUES
      (10,1,1,'2026-09-01','regular','programada'),
      (11,1,1,'2026-09-08','regular','programada'),
      (12,1,1,'2026-09-15','regular','programada');
  `);
  return db;
}

describe("modelos múltiples por persona y clase", () => {
  beforeEach(prepararBase);

  test("guarda y devuelve más de un modelo en el orden elegido", async () => {
    const db = await databasePromise;
    await asignarModelosAgenda(10, [2, 1, 2], "Dos moldes");

    const [agenda] = await agendaDelDia("2026-09-01");
    assert.deepEqual(agenda.modelo_ids, [2, 1]);
    assert.deepEqual(agenda.modelo_nombres, ["Plato", "Taza"]);
    assert.equal(agenda.modelo_id, 2);
    assert.equal(agenda.necesidades, "Dos moldes");

    const relaciones = await db.getAllAsync<{ modelo_id: number; orden: number }>(
      "SELECT modelo_id,orden FROM agenda_modelos WHERE agenda_id=10 ORDER BY orden"
    );
    assert.deepEqual(relaciones, [
      { modelo_id: 2, orden: 0 },
      { modelo_id: 1, orden: 1 },
    ]);
  });

  test("permite indicar que no necesita y elimina todas las selecciones", async () => {
    const db = await databasePromise;
    await asignarModelosAgenda(10, [1, 3], "Materiales");
    await asignarModelosAgenda(10, [], "No necesita");

    const [agenda] = await agendaDelDia("2026-09-01");
    const total = await db.getFirstAsync<{ total: number }>(
      "SELECT COUNT(*) AS total FROM agenda_modelos WHERE agenda_id=10"
    );
    assert.deepEqual(agenda.modelo_ids, []);
    assert.equal(agenda.modelo_id, null);
    assert.equal(agenda.necesidades, "No necesita");
    assert.equal(total?.total, 0);
  });

  test("migra el modelo único anterior sin duplicarlo", async () => {
    const db = await databasePromise;
    await db.runAsync("UPDATE agenda_alumnos SET modelo_id=3 WHERE id=10");

    await migrarModelosMultiples(db as unknown as Parameters<typeof migrarModelosMultiples>[0]);
    await migrarModelosMultiples(db as unknown as Parameters<typeof migrarModelosMultiples>[0]);

    const relaciones = await db.getAllAsync<{ modelo_id: number }>(
      "SELECT modelo_id FROM agenda_modelos WHERE agenda_id=10"
    );
    assert.deepEqual(relaciones, [{ modelo_id: 3 }]);
  });

  test("permite usar en el recuperatorio el pedido de una clase ausente", async () => {
    await asignarModelosAgenda(10, [1], "Arcilla blanca");
    await registrarAusencia(1, 1, "2026-09-01");

    const pedido = await pedidoModelosPendienteAlumno(1, "2026-09-03");
    assert.deepEqual(pedido, {
      modelo_nombres: ["Taza"],
      necesidades: ["Arcilla blanca"],
      proxima_clase_fecha: "2026-09-08",
    });

    await asignarRecuperacion(1, 1, "2026-09-03", "regular", "recuperacion");

    const [ausencia] = await agendaDelDia("2026-09-01");
    const [recuperacion] = await agendaDelDia("2026-09-03");
    const personasAviso = await notificacionRepository.listarPersonas(1, "2026-09-03");
    assert.deepEqual(ausencia.modelo_nombres, []);
    assert.equal(ausencia.necesidades, null);
    assert.deepEqual(recuperacion.modelo_nombres, ["Taza"]);
    assert.equal(recuperacion.necesidades, "Arcilla blanca");
    assert.deepEqual(personasAviso, [{ nombre: "Ana", modelo_nombres: ["Taza"] }]);
  });

  test("deja el pedido para la próxima clase y combina modelos sin duplicarlos", async () => {
    await asignarModelosAgenda(10, [1], "Molde grande");
    await asignarModelosAgenda(11, [2, 1], "Esmalte rojo");
    await registrarAusencia(1, 1, "2026-09-01");

    await asignarRecuperacion(1, 1, "2026-09-03", "regular", "proxima_clase");

    const [recuperacion] = await agendaDelDia("2026-09-03");
    const [proxima] = await agendaDelDia("2026-09-08");
    assert.deepEqual(recuperacion.modelo_nombres, []);
    assert.deepEqual(proxima.modelo_nombres, ["Taza", "Plato"]);
    assert.equal(proxima.necesidades, "Esmalte rojo · Molde grande");
  });

  test("quitar el recuperatorio devuelve el pedido a pendientes", async () => {
    await asignarModelosAgenda(10, [1], "Asa ancha");
    await registrarAusencia(1, 1, "2026-09-01");
    await asignarRecuperacion(1, 1, "2026-09-03", "regular", "recuperacion");
    const [recuperacion] = await agendaDelDia("2026-09-03");

    await quitarFechaAgenda(recuperacion.id);

    const pedido = await pedidoModelosPendienteAlumno(1, "2026-09-04");
    const [ausencia] = await agendaDelDia("2026-09-01");
    assert.deepEqual(pedido?.modelo_nombres, ["Taza"]);
    assert.deepEqual(ausencia.modelo_nombres, ["Taza"]);
    assert.equal(ausencia.necesidades, "Asa ancha");
  });
});
