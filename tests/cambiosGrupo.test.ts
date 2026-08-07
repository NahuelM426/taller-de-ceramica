import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

import { crearEsquema } from "../database/schema";
import { fechaLocal } from "../database/dates";
import { ajustarSaldoPendientes } from "../database/pendientes";
import { calcularLugaresDisponibles } from "../lib/vacantes";
import type { AgendaAlumno, Grupo } from "../models";
import { alumnoRepository } from "../repositories/alumnoRepository";
import {
  databasePromise,
  reiniciarBasePrueba,
} from "./helpers/connection";

function fechaConDiferencia(dias: number) {
  const fecha = new Date();
  fecha.setHours(12, 0, 0, 0);
  fecha.setDate(fecha.getDate() + dias);
  return fechaLocal(fecha);
}

function diaDeSemana(fecha: string) {
  return new Date(`${fecha}T12:00:00`).getDay();
}

const hoy = fechaConDiferencia(0);
const manana = fechaConDiferencia(1);
const ayer = fechaConDiferencia(-1);

async function prepararBase() {
  await reiniciarBasePrueba();
  const db = await databasePromise;
  await crearEsquema(db as unknown as Parameters<typeof crearEsquema>[0]);
  await db.runAsync(
    `INSERT INTO grupos
     (id,nombre,dia,hora,capacidad,color,frecuencia,fecha_inicio)
     VALUES (1,'Grupo anterior',?,'18:00',1,'#315B50','semanal',?)`,
    diaDeSemana(hoy), hoy
  );
  await db.runAsync(
    `INSERT INTO grupos
     (id,nombre,dia,hora,capacidad,color,frecuencia,fecha_inicio)
     VALUES (2,'Grupo nuevo',?,'18:00',1,'#C96F4A','semanal',?)`,
    diaDeSemana(manana), manana
  );
  return db;
}

describe("cambios permanentes de grupo", () => {
  beforeEach(prepararBase);

  test("asigna una persona sin grupo y genera su agenda habitual", async () => {
    const db = await databasePromise;
    await db.runAsync(
      `INSERT INTO alumnos
       (id,nombre,frecuencia,grupo_id,pendientes,fecha_inicio,sin_grupo)
       VALUES (1,'Ana','semanal',1,0,?,1)`,
      hoy
    );

    await alumnoRepository.fijarEnGrupo(1, 2, manana);

    const alumno = await db.getFirstAsync<{
      grupo_id: number; sin_grupo: number; frecuencia: string; fecha_inicio: string;
    }>("SELECT grupo_id,sin_grupo,frecuencia,fecha_inicio FROM alumnos WHERE id = 1");
    const primeraClase = await db.getFirstAsync<{
      grupo_id: number; fecha: string; tipo: string; estado: string;
    }>(
      `SELECT grupo_id,fecha,tipo,estado FROM agenda_alumnos
       WHERE alumno_id = 1 ORDER BY fecha LIMIT 1`
    );

    assert.deepEqual(alumno, {
      grupo_id: 2,
      sin_grupo: 0,
      frecuencia: "semanal",
      fecha_inicio: manana,
    });
    assert.deepEqual(primeraClase, {
      grupo_id: 2,
      fecha: manana,
      tipo: "regular",
      estado: "programada",
    });
  });

  test("mover de grupo libera el cupo anterior y ocupa el nuevo", async () => {
    const db = await databasePromise;
    await db.runAsync(
      `INSERT INTO alumnos
       (id,nombre,frecuencia,grupo_id,pendientes,fecha_inicio)
       VALUES (1,'Ana','semanal',1,0,?)`,
      hoy
    );
    await db.runAsync(
      `INSERT INTO agenda_alumnos
       (alumno_id,grupo_id,fecha,tipo,estado)
       VALUES (1,1,?,'regular','programada')`,
      hoy
    );

    const grupoAnterior = await db.getFirstAsync<Grupo>(
      "SELECT * FROM grupos WHERE id = 1"
    );
    const agendaAntes = await db.getAllAsync<AgendaAlumno>(
      `SELECT * FROM agenda_alumnos
       WHERE grupo_id = 1 AND fecha = ? AND estado != 'cancelada'`,
      hoy
    );
    assert.ok(grupoAnterior);
    assert.equal(calcularLugaresDisponibles(grupoAnterior, agendaAntes), 0);

    await alumnoRepository.fijarEnGrupo(1, 2, manana);

    const agendaAnterior = await db.getAllAsync<AgendaAlumno>(
      `SELECT * FROM agenda_alumnos
       WHERE grupo_id = 1 AND fecha >= ? AND estado != 'cancelada'`,
      hoy
    );
    const agendaNueva = await db.getAllAsync<AgendaAlumno>(
      `SELECT * FROM agenda_alumnos
       WHERE alumno_id = 1 AND grupo_id = 2 AND fecha = ? AND estado != 'cancelada'`,
      manana
    );
    assert.equal(agendaAnterior.length, 0);
    assert.equal(calcularLugaresDisponibles(grupoAnterior, agendaAnterior), 1);
    assert.equal(agendaNueva.length, 1);
    assert.equal(agendaNueva[0].estado, "programada");
  });

  test("elimina solo el pendiente de una ausencia futura cancelada por el cambio", async () => {
    const db = await databasePromise;
    await db.runAsync(
      `INSERT INTO alumnos
       (id,nombre,frecuencia,grupo_id,pendientes,fecha_inicio)
       VALUES (1,'Ana','semanal',1,0,?)`,
      hoy
    );
    await ajustarSaldoPendientes(db, 1, 2, "test:saldo:cambio-grupo");
    await db.runAsync(
      `INSERT INTO agenda_alumnos
       (alumno_id,grupo_id,fecha,tipo,estado)
       VALUES (1,1,?,'regular','ausente')`,
      hoy
    );
    await db.runAsync(
      "INSERT INTO clases (alumno_id,grupo_id,fecha,estado) VALUES (1,1,?,'ausente')",
      hoy
    );
    await db.runAsync(
      "INSERT INTO clases (alumno_id,grupo_id,fecha,estado) VALUES (1,1,?,'ausente')",
      ayer
    );

    await alumnoRepository.fijarEnGrupo(1, 2, manana);

    const alumno = await db.getFirstAsync<{ pendientes: number }>(
      "SELECT pendientes FROM alumnos WHERE id = 1"
    );
    const ausencias = await db.getAllAsync<{ fecha: string }>(
      "SELECT fecha FROM clases WHERE alumno_id = 1 AND estado = 'ausente' ORDER BY fecha"
    );
    assert.equal(alumno?.pendientes, 1);
    assert.deepEqual(ausencias.map(item => item.fecha), [ayer]);
  });
});
