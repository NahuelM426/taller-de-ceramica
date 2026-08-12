import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { describe } from "node:test";

import { detalleDiaDebeEstarVisible } from "@/lib/flujoReajuste";
import {
  abrirSeleccionMotivo,
  cancelarSeleccionMotivo,
  confirmarSeleccionMotivo,
  opcionesMotivoMovimiento,
} from "@/lib/seleccionMotivoMovimiento";
import type { TipoMovimientoClase } from "@/models";

describe("selector de motivo de movimiento", () => {
  test("muestra Feriado, Compromiso y Reajuste en ese orden", () => {
    assert.deepEqual(
      opcionesMotivoMovimiento.map(opcion => opcion.titulo),
      ["Feriado", "Compromiso", "Reajuste"]
    );
  });

  test("abrirlo oculta el selector de fecha y limpia el motivo anterior", () => {
    assert.deepEqual(abrirSeleccionMotivo(), {
      selectorMotivoVisible: true,
      selectorFechaVisible: false,
      motivoMovimiento: null,
    });
  });

  for (const forma of ["Volver", "X", "Atrás de Android", "fondo oscuro"]) {
    test(`${forma} cierra sin elegir ni abrir el selector de fecha`, () => {
      assert.deepEqual(cancelarSeleccionMotivo(), {
        selectorMotivoVisible: false,
        selectorFechaVisible: false,
        motivoMovimiento: null,
      });
    });
  }

  for (const motivo of ["feriado", "compromiso", "reajuste"] as TipoMovimientoClase[]) {
    test(`elegir ${motivo} cierra el motivo y abre el selector de fecha`, () => {
      assert.deepEqual(confirmarSeleccionMotivo(motivo), {
        selectorMotivoVisible: false,
        selectorFechaVisible: true,
        motivoMovimiento: motivo,
      });
    });
  }

  test("el detalle del día queda oculto mientras se elige el motivo", () => {
    assert.equal(
      detalleDiaDebeEstarVisible({
        fechaSeleccionada: "2026-08-12",
        selectorAlumnoVisible: false,
        selectorFechaVisible: false,
        selectorModeloVisible: false,
        selectorMotivoVisible: true,
        reajustePendiente: null,
      }),
      false
    );
  });

  test("al cancelar vuelve a mostrarse el detalle original", () => {
    const cancelado = cancelarSeleccionMotivo();
    assert.equal(
      detalleDiaDebeEstarVisible({
        fechaSeleccionada: "2026-08-12",
        selectorAlumnoVisible: false,
        selectorFechaVisible: cancelado.selectorFechaVisible,
        selectorModeloVisible: false,
        selectorMotivoVisible: cancelado.selectorMotivoVisible,
        reajustePendiente: null,
      }),
      true
    );
  });

  test("el modal conecta cierre por Android, fondo, X y Volver", () => {
    const componente = readFileSync(
      "components/calendario/SeleccionarMotivoMovimientoModal.tsx",
      "utf8"
    );

    assert.match(componente, /onRequestClose=\{onClose\}/);
    assert.match(componente, /onPress=\{onClose\}/);
    assert.match(componente, /accessibilityLabel="Cerrar sin elegir"/);
    assert.match(componente, /accessibilityLabel="Volver sin elegir"/);
  });

  test("el calendario ya no usa el Alert nativo para preguntar el motivo", () => {
    const calendario = readFileSync("app/(tabs)/calendario.tsx", "utf8");
    assert.doesNotMatch(calendario, /¿Por qué se mueve la clase\?/);
  });

  test("el selector visual no accede a repositorios", () => {
    const componente = readFileSync(
      "components/calendario/SeleccionarMotivoMovimientoModal.tsx",
      "utf8"
    );
    assert.doesNotMatch(componente, /repositories\//);
  });
});
