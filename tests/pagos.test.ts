import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

import { crearEsquema } from "../database/schema";
import {
  calcularImportePago,
  cantidadClasesSugerida,
  mesPagoSiguiente,
  PRECIO_CLASE_EXTRA,
} from "../lib/pagos";
import { pagoRepository } from "../repositories/pagoRepository";
import { agendaRepository } from "../repositories/agendaRepository";
import { alumnoRepository } from "../repositories/alumnoRepository";
import { databasePromise, reiniciarBasePrueba } from "./helpers/connection";

describe("pagos mensuales de alumnos", () => {
  beforeEach(async () => {
    await reiniciarBasePrueba();
    const db = await databasePromise;
    await crearEsquema(db as unknown as Parameters<typeof crearEsquema>[0]);
    await db.execAsync(`
      INSERT INTO grupos
        (id,nombre,dia,hora,capacidad,color,frecuencia,fecha_inicio)
      VALUES
        (1,'Semanal',2,'14:00',4,'#315B50','semanal','2026-08-04'),
        (2,'Dos veces',5,'18:00',4,'#B66A4A','quincenal','2026-08-07');
      INSERT INTO alumnos
        (id,nombre,frecuencia,grupo_id,pendientes,fecha_inicio)
      VALUES
        (1,'Ana','semanal',1,0,'2026-08-04'),
        (2,'Berta','quincenal',2,0,'2026-08-07');
    `);
  });

  test("un mes nuevo muestra a todos como no pagados con su cantidad sugerida", async () => {
    const pagos = await pagoRepository.listarMes("2026-08");

    assert.deepEqual(
      pagos.map(pago => ({
        nombre: pago.alumno_nombre,
        pagado: pago.pagado,
        clases: pago.clases_pagadas,
        extras: pago.clases_extra,
      })),
      [
        { nombre: "Ana", pagado: 0, clases: 4, extras: 0 },
        { nombre: "Berta", pagado: 0, clases: 2, extras: 0 },
      ]
    );
  });

  test("guarda pago, clases y extras sin afectar el mes siguiente", async () => {
    await pagoRepository.guardar(1, "2026-08", true, 4, 2);

    const agosto = await pagoRepository.listarMes("2026-08");
    const septiembre = await pagoRepository.listarMes("2026-09");
    const pagoAna = agosto.find(pago => pago.alumno_id === 1);
    const septiembreAna = septiembre.find(pago => pago.alumno_id === 1);

    assert.equal(pagoAna?.pagado, 1);
    assert.equal(pagoAna?.clases_pagadas, 4);
    assert.equal(pagoAna?.clases_extra, 2);
    assert.ok(pagoAna?.fecha_pago);
    assert.equal(septiembreAna?.pagado, 0);
    assert.equal(septiembreAna?.clases_extra, 0);
    assert.equal(septiembreAna?.clases_extra_disponibles, 2);
  });

  test("volver a no pagó conserva cantidades pero limpia la fecha de pago", async () => {
    await pagoRepository.guardar(2, "2026-08", true, 2, 1);
    await pagoRepository.guardar(2, "2026-08", false, 2, 1);

    const pago = (await pagoRepository.listarMes("2026-08"))
      .find(item => item.alumno_id === 2);
    assert.equal(pago?.pagado, 0);
    assert.equal(pago?.clases_pagadas, 2);
    assert.equal(pago?.clases_extra, 1);
    assert.equal(pago?.fecha_pago, null);
  });

  test("calcula las cuotas informadas por el taller", () => {
    assert.equal(cantidadClasesSugerida("quincenal"), 2);
    assert.equal(cantidadClasesSugerida("semanal"), 4);
    assert.equal(calcularImportePago(2, 0), 68_000);
    assert.equal(calcularImportePago(4, 2), 128_000 + 2 * PRECIO_CLASE_EXTRA);
  });

  test("permite identificar el mes siguiente incluso al cambiar de año", () => {
    assert.equal(mesPagoSiguiente("2026-08"), "2026-09");
    assert.equal(mesPagoSiguiente("2026-12"), "2027-01");
  });

  test("permite registrar el mes siguiente sin marcar como pago el actual", async () => {
    await pagoRepository.guardar(1, "2026-09", true, 4, 1);
    const agosto = (await pagoRepository.listarMes("2026-08"))
      .find(item => item.alumno_id === 1);
    const septiembre = (await pagoRepository.listarMes("2026-09"))
      .find(item => item.alumno_id === 1);
    assert.equal(agosto?.pagado, 0);
    assert.equal(septiembre?.pagado, 1);
    assert.equal(septiembre?.clases_extra, 1);
  });

  test("usa una clase extra pagada y la descuenta del saldo disponible", async () => {
    const db = await databasePromise;
    await pagoRepository.guardar(1, "2026-08", true, 4, 2);

    await agendaRepository.asignarClaseExtra(1, 1, "2026-08-11");

    const pago = (await pagoRepository.listarMes("2026-08"))
      .find(item => item.alumno_id === 1);
    const agenda = await db.getFirstAsync<{
      id: number; tipo: string; estado: string; pago_extra_mes: string;
    }>(
      "SELECT id,tipo,estado,pago_extra_mes FROM agenda_alumnos WHERE alumno_id=1 AND fecha='2026-08-11'"
    );
    assert.equal(pago?.clases_extra_usadas, 1);
    assert.equal(pago?.clases_extra_disponibles, 1);
    assert.equal(agenda?.tipo, "manual");
    assert.equal(agenda?.estado, "programada");
    assert.equal(agenda?.pago_extra_mes, "2026-08");
  });

  test("quitar una clase extra pagada la deja como extra a favor", async () => {
    const db = await databasePromise;
    await pagoRepository.guardar(1, "2026-08", true, 4, 1);
    await agendaRepository.asignarClaseExtra(1, 1, "2026-08-11");
    const agenda = await db.getFirstAsync<{ id: number }>(
      "SELECT id FROM agenda_alumnos WHERE alumno_id=1 AND fecha='2026-08-11'"
    );
    assert.ok(agenda);

    await agendaRepository.quitar(agenda.id);

    const pago = (await pagoRepository.listarMes("2026-08"))
      .find(item => item.alumno_id === 1);
    const estado = await db.getFirstAsync<{ estado: string }>(
      "SELECT estado FROM agenda_alumnos WHERE id=?",
      agenda.id
    );
    const alumno = await db.getFirstAsync<{ pendientes: number }>(
      "SELECT pendientes FROM alumnos WHERE id=1"
    );
    const movimiento = await db.getFirstAsync<{ categoria: string; delta: number }>(
      `SELECT categoria,delta FROM movimientos_pendientes
       WHERE agenda_id=? AND clave LIKE 'cancelacion_extra_pagada:%'`,
      agenda.id
    );
    assert.equal(pago?.clases_extra_usadas, 1);
    assert.equal(pago?.clases_extra_disponibles, 0);
    assert.equal(alumno?.pendientes, 1);
    assert.deepEqual(movimiento, { categoria: "extra", delta: 1 });
    assert.equal(estado?.estado, "cancelada");
  });

  test("no permite usar más extras que las pagadas ni quitar un pago utilizado", async () => {
    await pagoRepository.guardar(1, "2026-08", true, 4, 1);
    await agendaRepository.asignarClaseExtra(1, 1, "2026-08-11");

    await assert.rejects(
      agendaRepository.asignarClaseExtra(1, 1, "2026-08-18"),
      /no tiene clases extra pagadas disponibles/i
    );
    await assert.rejects(
      pagoRepository.guardar(1, "2026-08", false, 4, 1),
      /ya tiene clases extra utilizadas/i
    );
  });

  test("una extra pagada en un mes aparece y puede usarse en el mes siguiente", async () => {
    const db = await databasePromise;
    await pagoRepository.guardar(1, "2026-08", true, 4, 2);

    const septiembreAntes = (await pagoRepository.listarMes("2026-09"))
      .find(item => item.alumno_id === 1);
    assert.equal(septiembreAntes?.pagado, 0);
    assert.equal(septiembreAntes?.clases_extra, 0);
    assert.equal(septiembreAntes?.clases_extra_disponibles, 2);

    await agendaRepository.asignarClaseExtra(1, 1, "2026-09-08");

    const septiembreDespues = (await pagoRepository.listarMes("2026-09"))
      .find(item => item.alumno_id === 1);
    const agenda = await db.getFirstAsync<{ pago_extra_mes: string }>(
      "SELECT pago_extra_mes FROM agenda_alumnos WHERE alumno_id=1 AND fecha='2026-09-08'"
    );
    assert.equal(septiembreDespues?.clases_extra_disponibles, 1);
    assert.equal(agenda?.pago_extra_mes, "2026-08");
  });

  test("al cerrar el mes convierte en pendiente una clase pagada que no se usó", async () => {
    const db = await databasePromise;
    await pagoRepository.guardar(2, "2026-08", true, 2, 0);
    await db.runAsync(
      `INSERT INTO agenda_alumnos
       (alumno_id,grupo_id,fecha,tipo,estado)
       VALUES (2,2,'2026-08-07','regular','programada')`
    );

    assert.equal(await pagoRepository.cerrarMesesVencidos(new Date(2026, 8, 1)), 1);
    assert.equal(await pagoRepository.cerrarMesesVencidos(new Date(2026, 8, 2)), 0);

    const alumno = await db.getFirstAsync<{ pendientes: number }>(
      "SELECT pendientes FROM alumnos WHERE id = 2"
    );
    const movimientos = await db.getAllAsync<{ delta: number; clave: string }>(
      "SELECT delta,clave FROM movimientos_pendientes WHERE alumno_id = 2"
    );
    assert.equal(alumno?.pendientes, 1);
    assert.deepEqual(movimientos, [{
      delta: 1,
      clave: "cuota_no_usada:alumno:2:mes:2026-08",
    }]);
  });

  test("no cierra el mes actual ni duplica el pendiente de una ausencia", async () => {
    const db = await databasePromise;
    await pagoRepository.guardar(2, "2026-08", true, 2, 0);
    await db.execAsync(`
      INSERT INTO agenda_alumnos
        (id,alumno_id,grupo_id,fecha,tipo,estado)
      VALUES
        (21,2,2,'2026-08-07','regular','programada'),
        (22,2,2,'2026-08-21','regular','programada');
    `);
    await agendaRepository.registrarAusencia(2, 2, "2026-08-21");

    assert.equal(await pagoRepository.cerrarMesesVencidos(new Date(2026, 7, 25)), 0);
    assert.equal(await pagoRepository.cerrarMesesVencidos(new Date(2026, 8, 1)), 0);
    const alumno = await db.getFirstAsync<{ pendientes: number }>(
      "SELECT pendientes FROM alumnos WHERE id = 2"
    );
    assert.equal(alumno?.pendientes, 1);
  });

  test("agenda una clase extra a cobrar sin consumir créditos pagados", async () => {
    const db = await databasePromise;
    await agendaRepository.asignarClaseExtraAdeudada(1, 1, "2026-08-11");

    const pago = (await pagoRepository.listarMes("2026-08"))
      .find(item => item.alumno_id === 1);
    const agenda = await db.getFirstAsync<{
      tipo: string; extra_adeudada: number; pago_extra_mes: string | null;
    }>(
      "SELECT tipo,extra_adeudada,pago_extra_mes FROM agenda_alumnos WHERE alumno_id=1 AND fecha='2026-08-11'"
    );
    assert.equal(pago?.clases_extra_adeudadas, 1);
    assert.equal(pago?.clases_extra_disponibles, 0);
    assert.deepEqual(agenda, {
      tipo: "manual",
      extra_adeudada: 1,
      pago_extra_mes: null,
    });
  });

  test("al registrar el pago salda primero la clase extra adeudada", async () => {
    const db = await databasePromise;
    await pagoRepository.guardar(1, "2026-08", true, 4, 0);
    await agendaRepository.asignarClaseExtraAdeudada(1, 1, "2026-08-11");

    await pagoRepository.guardar(1, "2026-08", true, 4, 1);

    const pago = (await pagoRepository.listarMes("2026-08"))
      .find(item => item.alumno_id === 1);
    const agenda = await db.getFirstAsync<{
      extra_adeudada: number; pago_extra_mes: string | null;
    }>(
      "SELECT extra_adeudada,pago_extra_mes FROM agenda_alumnos WHERE alumno_id=1 AND fecha='2026-08-11'"
    );
    assert.equal(pago?.clases_extra_adeudadas, 0);
    assert.equal(pago?.clases_extra_usadas, 1);
    assert.equal(pago?.clases_extra_disponibles, 0);
    assert.deepEqual(agenda, { extra_adeudada: 0, pago_extra_mes: "2026-08" });
  });

  test("cobra solamente las extras sin modificar el pago de la cuota", async () => {
    const db = await databasePromise;
    await agendaRepository.asignarClaseExtraAdeudada(1, 1, "2026-08-11");

    assert.equal(await pagoRepository.cobrarExtrasAdeudadas(1, "2026-08"), 1);

    const pagoGuardado = await db.getFirstAsync<{ pagado: number }>(
      "SELECT pagado FROM pagos_alumnos WHERE alumno_id=1 AND mes='2026-08'"
    );
    const pagoVisible = (await pagoRepository.listarMes("2026-08"))
      .find(item => item.alumno_id === 1);
    const agenda = await db.getFirstAsync<{
      extra_adeudada: number; pago_extra_mes: string | null;
    }>(
      "SELECT extra_adeudada,pago_extra_mes FROM agenda_alumnos WHERE alumno_id=1 AND fecha='2026-08-11'"
    );

    assert.equal(pagoGuardado, null);
    assert.equal(pagoVisible?.pagado, 0);
    assert.equal(pagoVisible?.clases_extra_adeudadas, 0);
    assert.deepEqual(agenda, { extra_adeudada: 0, pago_extra_mes: "2026-08" });
  });

  test("una extra pagada sola y luego quitada queda a favor", async () => {
    const db = await databasePromise;
    await agendaRepository.asignarClaseExtraAdeudada(1, 1, "2026-08-11");
    await pagoRepository.cobrarExtrasAdeudadas(1, "2026-08");
    const agenda = await db.getFirstAsync<{ id: number }>(
      "SELECT id FROM agenda_alumnos WHERE alumno_id=1 AND fecha='2026-08-11'"
    );
    assert.ok(agenda);

    await agendaRepository.quitar(agenda.id);

    const alumno = (await alumnoRepository.listar()).find(item => item.id === 1);
    const pago = (await pagoRepository.listarMes("2026-08"))
      .find(item => item.alumno_id === 1);
    assert.equal(pago?.pagado, 0);
    assert.equal(pago?.clases_extra_adeudadas, 0);
    assert.equal(alumno?.pendientes_regulares, 0);
    assert.equal(alumno?.pendientes_extra, 1);
  });

  test("marcar no viene y luego quitar una extra pagada no duplica el saldo", async () => {
    const db = await databasePromise;
    await agendaRepository.asignarClaseExtraAdeudada(1, 1, "2026-08-11");
    await pagoRepository.cobrarExtrasAdeudadas(1, "2026-08");
    await agendaRepository.registrarAusencia(1, 1, "2026-08-11");
    const agenda = await db.getFirstAsync<{ id: number }>(
      "SELECT id FROM agenda_alumnos WHERE alumno_id=1 AND fecha='2026-08-11'"
    );
    assert.ok(agenda);

    await agendaRepository.quitar(agenda.id);

    const alumno = (await alumnoRepository.listar()).find(item => item.id === 1);
    const movimientos = await db.getFirstAsync<{ total: number }>(
      `SELECT COUNT(*) AS total FROM movimientos_pendientes
       WHERE alumno_id=1 AND categoria='extra'`
    );
    assert.equal(alumno?.pendientes_extra, 1);
    assert.equal(movimientos?.total, 1);
  });

  test("cobra la cuota y todas las extras adeudadas en la misma operación", async () => {
    const db = await databasePromise;
    await agendaRepository.asignarClaseExtraAdeudada(1, 1, "2026-08-11");
    await agendaRepository.asignarClaseExtraAdeudada(1, 1, "2026-08-18");

    await pagoRepository.guardar(1, "2026-08", true, 4, 0, true);

    const pago = (await pagoRepository.listarMes("2026-08"))
      .find(item => item.alumno_id === 1);
    const extras = await db.getAllAsync<{
      extra_adeudada: number; pago_extra_mes: string | null;
    }>(
      `SELECT extra_adeudada,pago_extra_mes FROM agenda_alumnos
       WHERE alumno_id=1 ORDER BY fecha`
    );

    assert.equal(pago?.pagado, 1);
    assert.equal(pago?.clases_extra, 0);
    assert.equal(pago?.clases_extra_usadas, 0);
    assert.equal(pago?.clases_extra_adeudadas, 0);
    assert.deepEqual(extras, [
      { extra_adeudada: 0, pago_extra_mes: "2026-08" },
      { extra_adeudada: 0, pago_extra_mes: "2026-08" },
    ]);
  });

  test("cobrar extras respeta el mes elegido y no adelanta deudas futuras", async () => {
    const db = await databasePromise;
    await agendaRepository.asignarClaseExtraAdeudada(1, 1, "2026-08-11");
    await agendaRepository.asignarClaseExtraAdeudada(1, 1, "2026-09-08");

    assert.equal(await pagoRepository.cobrarExtrasAdeudadas(1, "2026-08"), 1);

    const extras = await db.getAllAsync<{
      fecha: string; extra_adeudada: number; pago_extra_mes: string | null;
    }>(
      `SELECT fecha,extra_adeudada,pago_extra_mes FROM agenda_alumnos
       WHERE alumno_id=1 ORDER BY fecha`
    );
    assert.deepEqual(extras, [
      { fecha: "2026-08-11", extra_adeudada: 0, pago_extra_mes: "2026-08" },
      { fecha: "2026-09-08", extra_adeudada: 1, pago_extra_mes: null },
    ]);
  });

  test("una extra pagada que se cancela queda como extra a favor", async () => {
    const db = await databasePromise;
    await pagoRepository.guardar(1, "2026-08", true, 4, 1);
    await agendaRepository.asignarClaseExtra(1, 1, "2026-08-11");

    await agendaRepository.registrarAusencia(1, 1, "2026-08-11");

    const movimiento = await db.getFirstAsync<{
      delta: number; categoria: string;
    }>(
      `SELECT delta,categoria FROM movimientos_pendientes
       WHERE alumno_id=1 AND tipo='ausencia'`
    );
    const alumno = (await alumnoRepository.listar()).find(item => item.id === 1);
    assert.deepEqual(movimiento, { delta: 1, categoria: "extra" });
    assert.equal(alumno?.pendientes, 1);
    assert.equal(alumno?.pendientes_regulares, 0);
    assert.equal(alumno?.pendientes_extra, 1);
  });

  test("una extra a cobrar que se cancela no queda como deuda ni como pendiente", async () => {
    const db = await databasePromise;
    await agendaRepository.asignarClaseExtraAdeudada(1, 1, "2026-08-11");

    await agendaRepository.registrarAusencia(1, 1, "2026-08-11");

    const pago = (await pagoRepository.listarMes("2026-08"))
      .find(item => item.alumno_id === 1);
    const movimientos = await db.getFirstAsync<{ total: number }>(
      "SELECT COUNT(*) AS total FROM movimientos_pendientes WHERE alumno_id=1"
    );
    const alumno = await db.getFirstAsync<{ pendientes: number }>(
      "SELECT pendientes FROM alumnos WHERE id=1"
    );
    assert.equal(pago?.clases_extra_adeudadas, 0);
    assert.equal(movimientos?.total, 0);
    assert.equal(alumno?.pendientes, 0);
  });

  test("permite quitar una extra a cobrar ausente sin crear saldos negativos", async () => {
    const db = await databasePromise;
    await agendaRepository.asignarClaseExtraAdeudada(1, 1, "2026-08-11");
    await agendaRepository.registrarAusencia(1, 1, "2026-08-11");
    const agenda = await db.getFirstAsync<{ id: number }>(
      "SELECT id FROM agenda_alumnos WHERE alumno_id=1 AND fecha='2026-08-11'"
    );
    assert.ok(agenda);

    await agendaRepository.quitar(agenda.id);

    const estado = await db.getFirstAsync<{ estado: string }>(
      "SELECT estado FROM agenda_alumnos WHERE id=?",
      agenda.id
    );
    const alumno = await db.getFirstAsync<{ pendientes: number }>(
      "SELECT pendientes FROM alumnos WHERE id=1"
    );
    assert.equal(estado?.estado, "cancelada");
    assert.equal(alumno?.pendientes, 0);
  });

  test("permite usar y devolver una extra pendiente como recuperación", async () => {
    const db = await databasePromise;
    await pagoRepository.guardar(1, "2026-08", true, 4, 1);
    await agendaRepository.asignarClaseExtra(1, 1, "2026-08-11");
    await agendaRepository.registrarAusencia(1, 1, "2026-08-11");

    await agendaRepository.asignarRecuperacion(1, 1, "2026-08-18", "extra");
    let alumno = (await alumnoRepository.listar()).find(item => item.id === 1);
    assert.equal(alumno?.pendientes_extra, 0);

    await agendaRepository.registrarAusencia(1, 1, "2026-08-18");
    alumno = (await alumnoRepository.listar()).find(item => item.id === 1);
    const categorias = await db.getAllAsync<{ tipo: string; categoria: string }>(
      `SELECT tipo,categoria FROM movimientos_pendientes
       WHERE alumno_id=1 ORDER BY id`
    );
    assert.equal(alumno?.pendientes_extra, 1);
    assert.deepEqual(categorias, [
      { tipo: "ausencia", categoria: "extra" },
      { tipo: "recuperacion", categoria: "extra" },
      { tipo: "ausencia", categoria: "extra" },
    ]);
  });
});
