import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import {
  filtrarAlumnosParaAgregar,
  ocupacionInicial,
  ordenarAlumnosParaElegir,
} from "../lib/seleccionAgenda";
import { alumnoPasaFiltro } from "../lib/filtrosAlumnos";
import type { EstadoPagoAlumno } from "../models";
import type { Alumno } from "../models";

const alumno = (id: number, nombre: string, pendientes = 0): Alumno => ({
  id,
  nombre,
  telefono: null,
  frecuencia: "semanal",
  grupo_id: 1,
  sin_grupo: 0,
  grupo_nombre: "Martes",
  molde_id: null,
  pendientes,
  fecha_inicio: "2026-08-04",
});

describe("selección de personas para agregar a una clase", () => {
  test("muestra primero a quienes tienen pendientes", () => {
    const alumnos = [alumno(1, "Sin pendiente"), alumno(2, "Otro"), alumno(3, "Pendiente", 1)];
    const ordenados = ordenarAlumnosParaElegir(alumnos);
    assert.equal(ordenados[0].id, 3);
  });

  test("el filtro de pendientes respeta las personas ya ocupadas", () => {
    const alumnos = [alumno(1, "Uno"), alumno(2, "Dos"), alumno(3, "Tres")];
    alumnos[0].pendientes = 1;
    alumnos[1].pendientes = 2;
    const visibles = filtrarAlumnosParaAgregar(
      alumnos,
      [2],
      "",
      "pendientes"
    );
    assert.deepEqual(visibles.map(item => item.id), [1]);
  });

  test("propone pendiente antes que cambio de clase", () => {
    const sinPendiente = alumno(1, "Cambio");
    const conPendiente = alumno(2, "Pendiente", 2);
    const origen = { alumno_id: 1 } as Parameters<typeof ocupacionInicial>[1];
    assert.equal(ocupacionInicial(conPendiente, undefined), "recuperacion");
    assert.equal(ocupacionInicial(sinPendiente, origen), "cambio");
  });

  test("propone una extra pendiente cuando no tiene pendientes habituales", () => {
    const conExtra = {
      ...alumno(4, "Extra"),
      pendientes: 1,
      pendientes_regulares: 0,
      pendientes_extra: 1,
    };
    assert.equal(ocupacionInicial(conExtra, undefined), "recuperacion_extra");
  });

  test("los subfiltros separan pendientes habituales, extras a favor y deudas", () => {
    const persona = {
      ...alumno(5, "Filtros", 2),
      pendientes_regulares: 1,
      pendientes_extra: 1,
    };
    const pago = {
      alumno_id: 5,
      pagado: 0,
      clases_extra_adeudadas: 2,
    } as EstadoPagoAlumno;
    assert.equal(alumnoPasaFiltro(persona, pago, "pendientes", "regulares", "todos"), true);
    assert.equal(alumnoPasaFiltro(persona, pago, "pendientes", "extras", "todos"), true);
    assert.equal(alumnoPasaFiltro(persona, pago, "no_pagaron", "todos", "cuota"), true);
    assert.equal(alumnoPasaFiltro(persona, pago, "no_pagaron", "todos", "extras"), true);
  });

  test("la interfaz ofrece extra a cobrar y recuperación de una extra pendiente", () => {
    const selector = readFileSync("components/agenda/AgregarPersonaModal.tsx", "utf8");
    const pago = readFileSync("components/alumnos/PagoAlumnoModal.tsx", "utf8");
    assert.match(selector, /Clase extra a cobrar/);
    assert.match(selector, /Recupera una clase extra pendiente/);
    assert.doesNotMatch(selector, /Usa una clase extra pagada/);
    assert.doesNotMatch(selector, /Con extras/);
    assert.doesNotMatch(pago, /Clases extra pagadas/);
    assert.match(pago, /Cobrar junto con la cuota/);
    assert.match(pago, /Cobrar solo extras/);
  });
});
