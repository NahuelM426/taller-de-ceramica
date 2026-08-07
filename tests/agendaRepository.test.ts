import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

import { crearEsquema } from "../database/schema";
import { agendaRepository } from "../repositories/agendaRepository";
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
     VALUES (1,'Viernes A',5,'18:00',4,'#315B50','quincenal','2026-08-07')`
  );
  await db.runAsync(
    `INSERT INTO grupos
     (id,nombre,dia,hora,capacidad,color,frecuencia,fecha_inicio)
     VALUES (2,'Viernes B',5,'18:00',4,'#C96F4A','quincenal','2026-08-14')`
  );
  await db.runAsync(
    `INSERT INTO alumnos
     (id,nombre,frecuencia,grupo_id,pendientes,fecha_inicio)
     VALUES (1,'Ana','quincenal',2,0,'2026-08-14')`
  );
  await db.runAsync(
    `INSERT INTO alumnos
     (id,nombre,frecuencia,grupo_id,pendientes,fecha_inicio)
     VALUES (2,'Bea','quincenal',1,0,'2026-08-07')`
  );
  return db;
}

beforeEach(prepararBase);

describe("ausencias y reversión", () => {
  test("una ausencia suma un solo pendiente y puede revertirse", async () => {
    const db = await databasePromise;
    await db.runAsync(
      `INSERT INTO agenda_alumnos
       (id,alumno_id,grupo_id,fecha,tipo,estado)
       VALUES (10,1,2,'2026-08-14','regular','programada')`
    );

    await agendaRepository.registrarAusencia(1, 2, "2026-08-14");
    await agendaRepository.registrarAusencia(1, 2, "2026-08-14");

    const alumnoAusente = await db.getFirstAsync<{ pendientes: number }>(
      "SELECT pendientes FROM alumnos WHERE id = 1"
    );
    const agendaAusente = await db.getFirstAsync<{ estado: string }>(
      "SELECT estado FROM agenda_alumnos WHERE id = 10"
    );
    const ausencias = await db.getFirstAsync<{ cantidad: number }>(
      "SELECT COUNT(*) AS cantidad FROM clases WHERE estado = 'ausente'"
    );
    assert.equal(alumnoAusente?.pendientes, 1);
    assert.equal(agendaAusente?.estado, "ausente");
    assert.equal(ausencias?.cantidad, 1);

    await agendaRepository.revertirAusencia(1, 2, "2026-08-14");

    const alumnoRevertido = await db.getFirstAsync<{ pendientes: number }>(
      "SELECT pendientes FROM alumnos WHERE id = 1"
    );
    const agendaRevertida = await db.getFirstAsync<{ estado: string }>(
      "SELECT estado FROM agenda_alumnos WHERE id = 10"
    );
    const ausenciasRestantes = await db.getFirstAsync<{ cantidad: number }>(
      "SELECT COUNT(*) AS cantidad FROM clases WHERE estado = 'ausente'"
    );
    assert.equal(alumnoRevertido?.pendientes, 0);
    assert.equal(agendaRevertida?.estado, "programada");
    assert.equal(ausenciasRestantes?.cantidad, 0);
  });
});

describe("pendientes y recuperaciones", () => {
  test("asignar y quitar una recuperación descuenta y devuelve el pendiente", async () => {
    const db = await databasePromise;
    await db.runAsync("UPDATE alumnos SET pendientes = 2 WHERE id = 1");
    await db.runAsync(
      `INSERT INTO agenda_alumnos
       (id,alumno_id,grupo_id,fecha,tipo,estado)
       VALUES (20,2,1,'2026-08-07','regular','ausente')`
    );

    await agendaRepository.asignarRecuperacion(1, 1, "2026-08-07");

    const recuperacion = await db.getFirstAsync<{
      id: number; tipo: string; cubre_agenda_id: number;
    }>(
      "SELECT id,tipo,cubre_agenda_id FROM agenda_alumnos WHERE alumno_id = 1 AND fecha = '2026-08-07'"
    );
    const pendienteUsado = await db.getFirstAsync<{ pendientes: number }>(
      "SELECT pendientes FROM alumnos WHERE id = 1"
    );
    assert.equal(recuperacion?.tipo, "recuperacion");
    assert.equal(recuperacion?.cubre_agenda_id, 20);
    assert.equal(pendienteUsado?.pendientes, 1);

    assert.ok(recuperacion);
    await agendaRepository.quitar(recuperacion.id);

    const recuperacionQuitada = await db.getFirstAsync<{ estado: string }>(
      "SELECT estado FROM agenda_alumnos WHERE id = ?", recuperacion.id
    );
    const pendienteDevuelto = await db.getFirstAsync<{ pendientes: number }>(
      "SELECT pendientes FROM alumnos WHERE id = 1"
    );
    const clasesRecuperacion = await db.getFirstAsync<{ cantidad: number }>(
      "SELECT COUNT(*) AS cantidad FROM clases WHERE estado = 'recuperacion'"
    );
    assert.equal(recuperacionQuitada?.estado, "cancelada");
    assert.equal(pendienteDevuelto?.pendientes, 2);
    assert.equal(clasesRecuperacion?.cantidad, 0);
  });

  test("cambiar una clase para cubrir no crea un pendiente", async () => {
    const db = await databasePromise;
    await db.runAsync(
      `INSERT INTO agenda_alumnos
       (id,alumno_id,grupo_id,fecha,tipo,estado)
       VALUES (30,1,2,'2026-08-14','regular','programada')`
    );
    await db.runAsync(
      `INSERT INTO agenda_alumnos
       (id,alumno_id,grupo_id,fecha,tipo,estado)
       VALUES (31,2,1,'2026-08-07','regular','ausente')`
    );

    await agendaRepository.cambiarClaseParaCubrir(1, 30, 1, "2026-08-07");

    const origen = await db.getFirstAsync<{ estado: string }>(
      "SELECT estado FROM agenda_alumnos WHERE id = 30"
    );
    const cobertura = await db.getFirstAsync<{
      id: number; tipo: string; origen_agenda_id: number; cubre_agenda_id: number;
    }>(
      "SELECT id,tipo,origen_agenda_id,cubre_agenda_id FROM agenda_alumnos WHERE alumno_id = 1 AND fecha = '2026-08-07'"
    );
    const alumno = await db.getFirstAsync<{ pendientes: number }>(
      "SELECT pendientes FROM alumnos WHERE id = 1"
    );
    assert.equal(origen?.estado, "ausente");
    assert.equal(cobertura?.tipo, "manual");
    assert.equal(cobertura?.origen_agenda_id, 30);
    assert.equal(cobertura?.cubre_agenda_id, 31);
    assert.equal(alumno?.pendientes, 0);

    assert.ok(cobertura);
    await agendaRepository.quitar(cobertura.id);
    const origenRestaurado = await db.getFirstAsync<{ estado: string }>(
      "SELECT estado FROM agenda_alumnos WHERE id = 30"
    );
    assert.equal(origenRestaurado?.estado, "programada");
  });
});
