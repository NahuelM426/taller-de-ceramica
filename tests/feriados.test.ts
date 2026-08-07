import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

import { crearEsquema } from "../database/schema";
import { agendaRepository } from "../repositories/agendaRepository";
import { feriadoRepository } from "../repositories/feriadoRepository";
import {
  databasePromise,
  reiniciarBasePrueba,
} from "./helpers/connection";

const fechaOriginal = "2026-08-07";
const fechaRecuperacion = "2026-08-08";

async function prepararBase() {
  await reiniciarBasePrueba();
  const db = await databasePromise;
  await crearEsquema(db as unknown as Parameters<typeof crearEsquema>[0]);
  await db.runAsync(
    `INSERT INTO grupos
     (id,nombre,dia,hora,capacidad,color,frecuencia,fecha_inicio)
     VALUES (1,'Viernes',5,'18:00',4,'#315B50','semanal',?)`,
    fechaOriginal
  );
  await db.runAsync(
    `INSERT INTO alumnos
     (id,nombre,frecuencia,grupo_id,pendientes,fecha_inicio)
     VALUES (1,'Ana','semanal',1,0,?)`,
    fechaOriginal
  );
  await db.runAsync(
    `INSERT INTO agenda_alumnos
     (id,alumno_id,grupo_id,fecha,tipo,estado)
     VALUES (10,1,1,?,'regular','programada')`,
    fechaOriginal
  );
  return db;
}

describe("movimientos por feriado", () => {
  beforeEach(prepararBase);

  test("mueve la clase, registra el origen y permite deshacer el feriado", async () => {
    const db = await databasePromise;
    await agendaRepository.moverDia(fechaOriginal, fechaRecuperacion, "feriado");
    await feriadoRepository.guardar(
      fechaOriginal,
      "Taller cerrado",
      fechaRecuperacion,
      "feriado"
    );

    const movida = await db.getFirstAsync<{
      fecha: string; tipo: string; feriado_origen: string;
      feriado_tipo_origen: string; motivo_movimiento: string;
    }>(
      `SELECT fecha,tipo,feriado_origen,feriado_tipo_origen,motivo_movimiento
       FROM agenda_alumnos WHERE id = 10`
    );
    const marcaOriginal = await db.getFirstAsync<{ estado: string }>(
      `SELECT estado FROM agenda_alumnos
       WHERE alumno_id = 1 AND fecha = ? AND id != 10`,
      fechaOriginal
    );
    assert.deepEqual(movida, {
      fecha: fechaRecuperacion,
      tipo: "manual",
      feriado_origen: fechaOriginal,
      feriado_tipo_origen: "regular",
      motivo_movimiento: "feriado",
    });
    assert.equal(marcaOriginal?.estado, "cancelada");

    const restauradas = await feriadoRepository.quitar(fechaOriginal);

    const restaurada = await db.getFirstAsync<{
      fecha: string; tipo: string; estado: string; feriado_origen: string | null;
    }>("SELECT fecha,tipo,estado,feriado_origen FROM agenda_alumnos WHERE id = 10");
    const feriado = await db.getFirstAsync(
      "SELECT fecha FROM feriados WHERE fecha = ?", fechaOriginal
    );
    assert.equal(restauradas, 1);
    assert.deepEqual(restaurada, {
      fecha: fechaOriginal,
      tipo: "regular",
      estado: "programada",
      feriado_origen: null,
    });
    assert.equal(feriado, null);
  });

  test("al revertir elimina la ausencia de la fecha movida y su pendiente", async () => {
    const db = await databasePromise;
    await agendaRepository.moverDia(fechaOriginal, fechaRecuperacion, "compromiso");
    await feriadoRepository.guardar(
      fechaOriginal,
      "Compromiso",
      fechaRecuperacion,
      "compromiso"
    );
    await agendaRepository.registrarAusencia(1, 1, fechaRecuperacion);

    const pendienteAntes = await db.getFirstAsync<{ pendientes: number }>(
      "SELECT pendientes FROM alumnos WHERE id = 1"
    );
    assert.equal(pendienteAntes?.pendientes, 1);

    await feriadoRepository.quitar(fechaOriginal);

    const alumno = await db.getFirstAsync<{ pendientes: number }>(
      "SELECT pendientes FROM alumnos WHERE id = 1"
    );
    const ausencias = await db.getFirstAsync<{ cantidad: number }>(
      "SELECT COUNT(*) AS cantidad FROM clases WHERE estado = 'ausente'"
    );
    const agenda = await db.getFirstAsync<{ fecha: string; estado: string }>(
      "SELECT fecha,estado FROM agenda_alumnos WHERE id = 10"
    );
    assert.equal(alumno?.pendientes, 0);
    assert.equal(ausencias?.cantidad, 0);
    assert.deepEqual(agenda, { fecha: fechaOriginal, estado: "programada" });
  });
});
