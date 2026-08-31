import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  alturaCeldaCalendarioCompartible,
  ejecutarCompartirCalendarioUnaVez,
  filtrarGruposCompartibles,
  nombreArchivoCalendario,
  puedeCompartirVistaPrevia,
  prepararCalendarioCompartible,
} from "../lib/calendarioCompartible";
import type { AgendaAlumno, Grupo } from "../models";

function grupo(overrides: Partial<Grupo> = {}): Grupo {
  return {
    id: 1,
    nombre: "Lunes tarde",
    dia: 1,
    hora: "14:00",
    capacidad: 5,
    color: "#C87551",
    notificacion: 0,
    minutos_antes: 0,
    activo: 1,
    frecuencia: "semanal",
    fecha_inicio: "2026-08-03",
    ...overrides,
  };
}

function agendaHabitual(id: number, fecha: string): AgendaAlumno {
  return {
    id,
    alumno_id: 1,
    alumno_nombre: "Ana",
    grupo_id: 1,
    grupo_nombre: "Martes",
    grupo_color: "#C87551",
    hora: "14:00",
    fecha,
    tipo: "regular",
    estado: "programada",
    modelo_id: null,
    modelo_nombre: null,
    necesidades: null,
  };
}

const fechasGrupo = (data: ReturnType<typeof prepararCalendarioCompartible>, grupoId: number) =>
  data.celdas.filter(celda => celda.marcas.some(marca => marca.grupoId === grupoId)).map(celda => celda.fecha);

describe("calendario compartible", () => {
  test("permite excluir grupos de la imagen compartida", () => {
    const grupos = [
      grupo(),
      grupo({ id: 2, nombre: "Viernes", dia: 5 }),
      grupo({ id: 3, nombre: "Inactivo", activo: 0 }),
    ];
    const incluidos = filtrarGruposCompartibles(grupos, [2, 3]);
    assert.deepEqual(incluidos.map(item => item.id), [2]);
    const data = prepararCalendarioCompartible(new Date(2026, 7, 1), incluidos);
    assert.deepEqual(data.leyenda.map(item => item.nombre), ["Viernes"]);
    assert.equal(JSON.stringify(data).includes("Lunes tarde"), false);
  });

  test("un grupo semanal aparece en todas sus fechas habituales", () => {
    assert.deepEqual(
      fechasGrupo(prepararCalendarioCompartible(new Date(2026, 7, 1), [grupo()]), 1),
      ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31"]
    );
  });

  test("un grupo de dos veces por mes aparece solamente dos veces", () => {
    const data = prepararCalendarioCompartible(new Date(2026, 8, 1), [
      grupo({ dia: 2, frecuencia: "quincenal", fecha_inicio: "2026-09-01" }),
    ]);
    assert.deepEqual(fechasGrupo(data, 1), ["2026-09-01", "2026-09-15"]);
  });

  test("omite la quinta aparición del día para dos veces por mes", () => {
    const data = prepararCalendarioCompartible(new Date(2026, 8, 1), [
      grupo({ dia: 2, frecuencia: "quincenal", fecha_inicio: "2026-09-08" }),
    ]);
    assert.deepEqual(fechasGrupo(data, 1), ["2026-09-08", "2026-09-22"]);
  });

  test("usa el patrón permanente actualmente guardado en fecha_inicio", () => {
    const original = grupo({ dia: 2, frecuencia: "quincenal", fecha_inicio: "2026-09-01" });
    const reajustado = { ...original, fecha_inicio: "2026-09-08" };
    assert.deepEqual(
      fechasGrupo(prepararCalendarioCompartible(new Date(2026, 9, 1), [reajustado]), 1),
      ["2026-10-13", "2026-10-27"]
    );
  });

  test("el calendario compartido tampoco agrega el 22 si el mes ya tiene 1 y 8", () => {
    const reajustado = grupo({
      dia: 2,
      frecuencia: "quincenal",
      fecha_inicio: "2026-09-08",
    });
    const data = prepararCalendarioCompartible(
      new Date(2026, 8, 1),
      [reajustado],
      [agendaHabitual(1, "2026-09-01"), agendaHabitual(2, "2026-09-08")]
    );

    assert.deepEqual(fechasGrupo(data, 1), ["2026-09-01", "2026-09-08"]);
  });

  test("movimientos, recuperaciones y ausencias no cambian sus datos", () => {
    const grupos = [grupo()];
    const base = prepararCalendarioCompartible(new Date(2026, 7, 1), grupos);
    const movimientosOperativos = {
      feriados: [{ tipo: "feriado" }, { tipo: "compromiso" }],
      agenda: [{ tipo: "recuperacion", estado: "ausente", alumno_nombre: "Persona privada" }],
    };
    assert.ok(movimientosOperativos);
    assert.deepEqual(prepararCalendarioCompartible(new Date(2026, 7, 1), grupos), base);
    const serializado = JSON.stringify(base);
    assert.equal(serializado.includes("Persona privada"), false);
    assert.equal(serializado.includes("feriado"), false);
    assert.equal(serializado.includes("compromiso"), false);
    assert.equal(serializado.includes("recuperacion"), false);
    assert.equal(serializado.includes("ausente"), false);
  });

  test("dos grupos el mismo día generan dos marcas de color", () => {
    const data = prepararCalendarioCompartible(new Date(2026, 7, 1), [
      grupo(), grupo({ id: 2, nombre: "Otro", color: "#315B50" }),
    ]);
    const dia3 = data.celdas.find(celda => celda.fecha === "2026-08-03");
    assert.deepEqual(dia3?.marcas, [
      { grupoId: 1, color: "#C87551" },
      { grupoId: 2, color: "#315B50" },
    ]);
  });

  test("la leyenda contiene únicamente grupos activos", () => {
    const data = prepararCalendarioCompartible(new Date(2026, 7, 1), [
      grupo(), grupo({ id: 2, nombre: "Inactivo", activo: 0 }),
    ]);
    assert.deepEqual(data.leyenda.map(item => item.nombre), ["Lunes tarde"]);
  });

  test("el mes y el archivo coinciden con el cursor visible", () => {
    const data = prepararCalendarioCompartible(new Date(2026, 8, 1), []);
    assert.equal(data.tituloMes, "septiembre 2026");
    assert.equal(nombreArchivoCalendario(data), "calendario-septiembre-2026.png");
  });

  test("genera grillas completas de cuatro, cinco y seis filas", () => {
    assert.equal(prepararCalendarioCompartible(new Date(2021, 1, 1), []).filas, 4);
    assert.equal(prepararCalendarioCompartible(new Date(2026, 8, 1), []).filas, 5);
    assert.equal(prepararCalendarioCompartible(new Date(2026, 2, 1), []).filas, 6);
  });

  test("cinco o más grupos aumentan la altura y no omiten cintas", () => {
    const grupos = Array.from({ length: 6 }, (_, indice) => grupo({
      id: indice + 1,
      nombre: `Grupo ${indice + 1}`,
      color: `#315B5${indice}`,
    }));
    const data = prepararCalendarioCompartible(new Date(2026, 7, 1), grupos);
    const dia3 = data.celdas.find(celda => celda.fecha === "2026-08-03");
    assert.equal(data.maxMarcasPorDia, 6);
    assert.equal(dia3?.marcas.length, 6);
    assert.ok(alturaCeldaCalendarioCompartible(data.filas, data.maxMarcasPorDia) > 58);
  });

  test("abrir la vista previa no comparte y espera layout y logo", () => {
    let compartidos = 0;
    const alAbrir = { vistaLista: false, logoListo: false, preparando: false };
    if (puedeCompartirVistaPrevia(alAbrir)) compartidos += 1;
    assert.equal(compartidos, 0);
    assert.equal(puedeCompartirVistaPrevia({ ...alAbrir, vistaLista: true }), false);
    assert.equal(puedeCompartirVistaPrevia({ ...alAbrir, logoListo: true }), false);
  });

  test("habilita compartir solamente después del layout y del logo", () => {
    assert.equal(puedeCompartirVistaPrevia({
      vistaLista: true,
      logoListo: true,
      preparando: false,
    }), true);
    assert.equal(puedeCompartirVistaPrevia({
      vistaLista: true,
      logoListo: true,
      preparando: true,
    }), false);
  });

  test("bloquea un segundo toque mientras comparte", async () => {
    const bloqueo = { actual: false };
    let liberar: (() => void) | undefined;
    const espera = new Promise<void>(resolve => { liberar = resolve; });
    let ejecuciones = 0;
    const accion = async () => { ejecuciones += 1; await espera; };
    const primera = ejecutarCompartirCalendarioUnaVez(bloqueo, accion);
    assert.equal(await ejecutarCompartirCalendarioUnaVez(bloqueo, accion), false);
    liberar?.();
    assert.equal(await primera, true);
    assert.equal(ejecuciones, 1);
  });

  test("un error libera el bloqueo y permite reintentar", async () => {
    const bloqueo = { actual: false };
    let intentos = 0;
    const accion = async () => {
      intentos += 1;
      if (intentos === 1) throw new Error("falló");
    };
    await assert.rejects(ejecutarCompartirCalendarioUnaVez(bloqueo, accion), /falló/);
    assert.equal(bloqueo.actual, false);
    assert.equal(await ejecutarCompartirCalendarioUnaVez(bloqueo, accion), true);
  });
});
