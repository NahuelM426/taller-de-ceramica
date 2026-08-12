import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  cancelarConfirmacionReajuste,
  controlesReajusteDeshabilitados,
  detalleDiaDebeEstarVisible,
  ejecutarReajusteUnaVez,
  motivosMovimientoCalendario,
  prepararConfirmacionReajuste,
} from "../lib/flujoReajuste";

const grupo = { id: 7, nombre: "A" };

describe("confirmación visible de Reajuste", () => {
  test("confirmar la fecha crea el reajuste pendiente", () => {
    const estado = prepararConfirmacionReajuste(grupo, "2026-09-01", "2026-09-08");
    assert.deepEqual(estado.reajustePendiente, {
      grupoId: 7,
      grupoNombre: "A",
      fechaOrigen: "2026-09-01",
      fechaDestino: "2026-09-08",
    });
  });

  test("el detalle queda oculto mientras la confirmación está pendiente", () => {
    const estado = prepararConfirmacionReajuste(grupo, "2026-09-01", "2026-09-08");
    assert.equal(detalleDiaDebeEstarVisible({
      fechaSeleccionada: "2026-09-01",
      selectorAlumnoVisible: false,
      selectorFechaVisible: false,
      selectorModeloVisible: false,
      reajustePendiente: estado.reajustePendiente,
    }), false);
  });

  test("la confirmación queda disponible inmediatamente al cerrar el selector", () => {
    const estado = prepararConfirmacionReajuste(grupo, "2026-09-01", "2026-09-08");
    assert.equal(estado.selectorFechaVisible, false);
    assert.ok(estado.reajustePendiente);
  });

  test("cancelar vuelve a habilitar el detalle original", () => {
    assert.equal(detalleDiaDebeEstarVisible({
      fechaSeleccionada: "2026-09-01",
      selectorAlumnoVisible: false,
      selectorFechaVisible: false,
      selectorModeloVisible: false,
      reajustePendiente: cancelarConfirmacionReajuste(),
    }), true);
  });

  test("cancelar no ejecuta ninguna acción", () => {
    let ejecuciones = 0;
    const pendiente = cancelarConfirmacionReajuste();
    if (pendiente) ejecuciones += 1;
    assert.equal(ejecuciones, 0);
  });

  test("confirmar ejecuta reajuste, notificaciones y recarga una sola vez", async () => {
    const pendiente = prepararConfirmacionReajuste(grupo, "2026-09-01", "2026-09-08").reajustePendiente;
    const pasos: string[] = [];
    assert.equal(await ejecutarReajusteUnaVez(pendiente, { actual: false }, {
      reajustar: async () => { pasos.push("reajustar"); },
      reprogramarNotificaciones: async () => { pasos.push("notificaciones"); },
      recargar: async () => { pasos.push("recargar"); },
    }), true);
    assert.deepEqual(pasos, ["reajustar", "notificaciones", "recargar"]);
  });

  test("un doble toque no ejecuta dos reajustes", async () => {
    const pendiente = prepararConfirmacionReajuste(grupo, "2026-09-01", "2026-09-08").reajustePendiente;
    const bloqueo = { actual: false };
    let liberar: (() => void) | undefined;
    const espera = new Promise<void>(resolve => { liberar = resolve; });
    let ejecuciones = 0;
    const acciones = {
      reajustar: async () => { ejecuciones += 1; await espera; },
      reprogramarNotificaciones: async () => undefined,
      recargar: async () => undefined,
    };
    const primera = ejecutarReajusteUnaVez(pendiente, bloqueo, acciones);
    const segunda = ejecutarReajusteUnaVez(pendiente, bloqueo, acciones);
    assert.equal(await segunda, false);
    liberar?.();
    assert.equal(await primera, true);
    assert.equal(ejecuciones, 1);
  });

  test("durante el guardado los controles quedan deshabilitados", () => {
    assert.equal(controlesReajusteDeshabilitados(true), true);
    assert.equal(controlesReajusteDeshabilitados(false), false);
  });

  test("un error libera el bloqueo y permite reintentar", async () => {
    const pendiente = prepararConfirmacionReajuste(grupo, "2026-09-01", "2026-09-08").reajustePendiente;
    const bloqueo = { actual: false };
    let intentos = 0;
    const acciones = {
      reajustar: async () => {
        intentos += 1;
        if (intentos === 1) throw new Error("conflicto");
      },
      reprogramarNotificaciones: async () => undefined,
      recargar: async () => undefined,
    };
    await assert.rejects(ejecutarReajusteUnaVez(pendiente, bloqueo, acciones), /conflicto/);
    assert.equal(bloqueo.actual, false);
    assert.equal(await ejecutarReajusteUnaVez(pendiente, bloqueo, acciones), true);
  });

  test("Reajuste conserva su lugar junto a Feriado y Compromiso sin filtros", () => {
    assert.deepEqual(
      motivosMovimientoCalendario.map(item => item.etiqueta),
      ["Feriado", "Compromiso", "Reajuste"]
    );
  });

  test("Feriado y Compromiso conservan sus tipos originales", () => {
    assert.deepEqual(
      motivosMovimientoCalendario.slice(0, 2).map(item => item.tipo),
      ["feriado", "compromiso"]
    );
  });
});
