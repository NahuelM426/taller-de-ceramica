import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { agendaRepository, quitarFechaAgenda } from "../repositories/agendaRepository";

describe("retiro de limpieza masiva", () => {
  test("Limpiar este día ya no aparece en el detalle", () => {
    const detalle = readFileSync(
      "components/calendario/DetalleDiaModal.tsx",
      "utf8"
    );
    assert.equal(detalle.includes("Limpiar este día"), false);
    assert.equal(detalle.includes("onLimpiarDia"), false);
  });

  test("la limpieza masiva ya no se exporta ni forma parte del repositorio", () => {
    assert.equal("limpiarDia" in agendaRepository, false);
    const repositorio = readFileSync(
      "repositories/agendaRepository.ts",
      "utf8"
    );
    assert.equal(repositorio.includes("limpiarFechaAgenda"), false);
  });

  test("Quitar individual continúa disponible", () => {
    assert.equal(typeof agendaRepository.quitar, "function");
    assert.equal(typeof quitarFechaAgenda, "function");
  });
});
