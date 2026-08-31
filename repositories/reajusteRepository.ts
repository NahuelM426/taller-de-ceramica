import { databasePromise, Database } from "@/database/connection";
import { fechaDentroDe, fechaLocal } from "@/database/dates";
import { cancelarPendientesPorAusenciasFuturas } from "@/database/pendientes";
import { grupoOcurreEnFecha } from "@/lib/grupos";
import type { EstadoAgenda, Grupo, TipoAgenda } from "@/models";

interface AgendaCruda {
  id: number;
  alumno_id: number;
  grupo_id: number;
  fecha: string;
  tipo: TipoAgenda;
  estado: EstadoAgenda;
  modelo_id: number | null;
  necesidades: string | null;
  cubre_agenda_id: number | null;
  origen_agenda_id: number | null;
  feriado_origen: string | null;
  feriado_tipo_origen: TipoAgenda | null;
  motivo_movimiento: string | null;
  pago_extra_mes: string | null;
}

interface AgendaReajustada {
  id: number;
  alumno_id: number;
  fecha: string;
  creada: boolean;
}

interface AgendaAcompananteReajuste {
  id: number;
  alumno_id: number;
  fecha: string;
  tipo: TipoAgenda;
}

interface CanceladaDesplazada {
  id: number;
  fecha: string;
}

interface AgendaGeneradaReajuste {
  agendas: AgendaReajustada[];
  canceladasDesplazadas: CanceladaDesplazada[];
  acompanantes: AgendaAcompananteReajuste[];
}

export interface HistorialReajusteActivo {
  id: number;
  grupo_id: number;
  fecha_origen: string;
  fecha_destino: string;
  fecha_inicio_anterior: string | null;
  fecha_inicio_nueva: string;
  fecha_hasta: string;
  agenda_anterior: string;
  agenda_generada: string;
}

export async function obtenerUltimoReajusteActivo(grupoId: number) {
  const db = await databasePromise;
  return db.getFirstAsync<HistorialReajusteActivo>(
    `SELECT * FROM reajustes_grupo
     WHERE grupo_id = ? AND deshecho_en IS NULL
     ORDER BY id DESC LIMIT 1`,
    grupoId
  );
}

function fechaMediodia(fecha: string) {
  return new Date(`${fecha}T12:00:00`);
}

function fechasDelPatron(grupo: Grupo, desde: string, hasta: string) {
  const fechas: string[] = [];
  const fecha = fechaMediodia(desde);
  while (fecha.toISOString().slice(0, 10) <= hasta) {
    const texto = fecha.toISOString().slice(0, 10);
    if (grupoOcurreEnFecha(grupo, texto)) fechas.push(texto);
    fecha.setDate(fecha.getDate() + 1);
  }
  return fechas;
}

function validarDestino(grupo: Grupo, origen: string, destino: string) {
  if (grupo.frecuencia !== "quincenal") {
    throw new Error("El reajuste solamente se puede usar en grupos de 2 veces por mes");
  }
  if (destino === origen) {
    throw new Error("La nueva fecha debe ser distinta de la clase que se reajusta");
  }
  if (fechaMediodia(destino).getDay() !== grupo.dia) {
    throw new Error("La nueva fecha debe caer el mismo día de la semana del grupo");
  }
}

function esAgendaSimple(fila: AgendaCruda) {
  return fila.tipo === "regular" && fila.estado === "programada" &&
    fila.modelo_id == null && !fila.necesidades && fila.cubre_agenda_id == null &&
    fila.origen_agenda_id == null && fila.feriado_origen == null &&
    fila.motivo_movimiento == null;
}

async function conflictoEnFecha(
  db: Database,
  alumnoId: number,
  fecha: string,
  idsIgnorados: Set<number>
) {
  const filas = await db.getAllAsync<{ id: number; estado: EstadoAgenda }>(
    "SELECT id,estado FROM agenda_alumnos WHERE alumno_id = ? AND fecha = ?",
    alumnoId,
    fecha
  );
  return filas.find(fila => fila.estado !== "cancelada" && !idsIgnorados.has(fila.id));
}

function leerAgendaGenerada(valor: string): AgendaGeneradaReajuste {
  const contenido = JSON.parse(valor) as AgendaReajustada[] | AgendaGeneradaReajuste;
  if (Array.isArray(contenido)) {
    return { agendas: contenido, canceladasDesplazadas: [], acompanantes: [] };
  }
  return {
    agendas: contenido.agendas || [],
    canceladasDesplazadas: contenido.canceladasDesplazadas || [],
    acompanantes: contenido.acompanantes || [],
  };
}

export async function reajustarGrupo(
  grupoId: number,
  fechaOrigen: string,
  fechaDestino: string
) {
  const db = await databasePromise;
  let cantidad = 0;
  await db.withTransactionAsync(async () => {
    const grupo = await db.getFirstAsync<Grupo>(
      "SELECT * FROM grupos WHERE id = ? AND activo = 1",
      grupoId
    );
    if (!grupo) throw new Error("No se encontró el grupo");
    validarDestino(grupo, fechaOrigen, fechaDestino);

    const claseOrigen = await db.getFirstAsync<{ cantidad: number }>(
      `SELECT COUNT(*) AS cantidad FROM agenda_alumnos
       WHERE grupo_id = ? AND fecha = ? AND tipo = 'regular' AND estado != 'cancelada'`,
      grupoId,
      fechaOrigen
    );
    if (!claseOrigen?.cantidad) {
      throw new Error("No hay una clase habitual del grupo en la fecha seleccionada");
    }

    const alumnos = await db.getAllAsync<{ id: number; nombre: string }>(
      `SELECT id,nombre FROM alumnos
       WHERE grupo_id = ? AND activo = 1 AND sin_grupo = 0 ORDER BY id`,
      grupoId
    );
    const ultima = await db.getFirstAsync<{ fecha: string | null }>(
      `SELECT MAX(fecha) AS fecha FROM agenda_alumnos
       WHERE grupo_id = ? AND fecha >= ? AND tipo = 'regular'
         AND fecha GLOB '????-??-??'`,
      grupoId,
      fechaOrigen
    );
    const fechaHasta = [fechaDentroDe(370), ultima?.fecha || fechaDestino, fechaDestino]
      .sort()
      .at(-1) as string;
    const grupoNuevo: Grupo = { ...grupo, fecha_inicio: fechaDestino };
    let fechasNuevas = fechasDelPatron(grupoNuevo, fechaDestino, fechaHasta);
    if (fechaDestino < fechaOrigen) {
      const mesDestino = fechaDestino.slice(0, 7);
      const clasesPrevias = await db.getFirstAsync<{ cantidad: number }>(
        `SELECT COUNT(DISTINCT fecha) AS cantidad FROM agenda_alumnos
         WHERE grupo_id = ? AND estado != 'cancelada'
           AND (
             tipo = 'regular'
             OR (tipo = 'manual' AND feriado_tipo_origen = 'regular')
           )
           AND substr(fecha,1,7) = ? AND fecha < ?`,
        grupoId, mesDestino, fechaOrigen
      );
      const disponiblesEnMes = Math.max(0, 2 - (clasesPrevias?.cantidad || 0));
      if (!disponiblesEnMes) {
        throw new Error("El grupo ya tiene dos clases habituales en el mes elegido");
      }
      let usadasEnMes = 0;
      fechasNuevas = fechasNuevas.filter(fecha => {
        if (fecha.slice(0, 7) !== mesDestino) return true;
        usadasEnMes += 1;
        return usadasEnMes <= disponiblesEnMes;
      });
    }
    const anteriores: AgendaCruda[] = [];
    const agendasPorAlumno = new Map<number, AgendaCruda[]>();
    const acompanantes = await db.getAllAsync<AgendaCruda>(
      `SELECT * FROM agenda_alumnos
       WHERE grupo_id = ? AND fecha = ? AND estado = 'programada'
         AND tipo != 'regular' ORDER BY id`,
      grupoId, fechaOrigen
    );
    const canceladasDesplazadas: CanceladaDesplazada[] = [];
    const idsCanceladasDesplazadas = new Set<number>();

    for (const alumno of alumnos) {
      await cancelarPendientesPorAusenciasFuturas(
        db, alumno.id, fechaOrigen, "reajuste_grupo", grupoId
      );
      await db.runAsync(
        `UPDATE agenda_alumnos SET estado = 'programada'
         WHERE alumno_id = ? AND grupo_id = ? AND fecha >= ?
           AND tipo = 'regular' AND estado = 'ausente'`,
        alumno.id, grupoId, fechaOrigen
      );
      const filas = await db.getAllAsync<AgendaCruda>(
        `SELECT * FROM agenda_alumnos
         WHERE alumno_id = ? AND grupo_id = ? AND fecha >= ?
           AND tipo = 'regular' AND estado != 'cancelada'
         ORDER BY fecha,id`,
        alumno.id, grupoId, fechaOrigen
      );
      agendasPorAlumno.set(alumno.id, filas);
      anteriores.push(...filas);
      const ignorados = new Set(filas.map(fila => fila.id));
      for (const fecha of fechasNuevas) {
        if (await conflictoEnFecha(db, alumno.id, fecha, ignorados)) {
          throw new Error(`${alumno.nombre} ya tiene una clase cargada el ${fecha}`);
        }
        const canceladas = await db.getAllAsync<{ id: number; fecha: string }>(
          `SELECT id,fecha FROM agenda_alumnos
           WHERE alumno_id = ? AND fecha = ? AND estado = 'cancelada'`,
          alumno.id, fecha
        );
        for (const cancelada of canceladas) {
          if (ignorados.has(cancelada.id) || idsCanceladasDesplazadas.has(cancelada.id)) continue;
          idsCanceladasDesplazadas.add(cancelada.id);
          canceladasDesplazadas.push(cancelada);
        }
      }
    }

    for (const acompanante of acompanantes) {
      const alumno = await db.getFirstAsync<{ nombre: string }>(
        "SELECT nombre FROM alumnos WHERE id = ?",
        acompanante.alumno_id
      );
      const ignorados = new Set([acompanante.id]);
      if (await conflictoEnFecha(db, acompanante.alumno_id, fechaDestino, ignorados)) {
        throw new Error(`${alumno?.nombre || "La persona"} ya tiene una clase cargada el ${fechaDestino}`);
      }
      const canceladas = await db.getAllAsync<{ id: number; fecha: string }>(
        `SELECT id,fecha FROM agenda_alumnos
         WHERE alumno_id = ? AND fecha = ? AND estado = 'cancelada'`,
        acompanante.alumno_id, fechaDestino
      );
      for (const cancelada of canceladas) {
        if (idsCanceladasDesplazadas.has(cancelada.id)) continue;
        idsCanceladasDesplazadas.add(cancelada.id);
        canceladasDesplazadas.push(cancelada);
      }
    }

    const creadoEn = new Date().toISOString();
    const historial = await db.runAsync(
      `INSERT INTO reajustes_grupo
       (grupo_id,fecha_origen,fecha_destino,fecha_inicio_anterior,fecha_inicio_nueva,
        fecha_hasta,agenda_anterior,agenda_generada,creado_en)
       VALUES (?,?,?,?,?,?,?,'[]',?)`,
      grupoId, fechaOrigen, fechaDestino, grupo.fecha_inicio, fechaDestino,
      fechaHasta, JSON.stringify(anteriores), creadoEn
    );
    const idReajuste = historial.lastInsertRowId;
    const generadas: AgendaReajustada[] = [];

    for (const cancelada of canceladasDesplazadas) {
      await db.runAsync(
        "UPDATE agenda_alumnos SET fecha = ? WHERE id = ? AND estado = 'cancelada'",
        `0000-00-00#reajuste_${idReajuste}_${cancelada.id}`,
        cancelada.id
      );
    }

    for (const acompanante of acompanantes) {
      await db.runAsync(
        "UPDATE agenda_alumnos SET fecha = ? WHERE id = ?",
        fechaDestino,
        acompanante.id
      );
      if (acompanante.tipo === "recuperacion") {
        await db.runAsync(
          `UPDATE clases SET fecha = ?
           WHERE alumno_id = ? AND grupo_id = ? AND fecha = ? AND estado = 'recuperacion'`,
          fechaDestino, acompanante.alumno_id, grupoId, fechaOrigen
        );
      }
      await db.runAsync(
        "UPDATE movimientos_pendientes SET fecha = ? WHERE agenda_id = ?",
        fechaDestino,
        acompanante.id
      );
    }

    for (const filas of agendasPorAlumno.values()) {
      for (const fila of filas) {
        await db.runAsync(
          "UPDATE agenda_alumnos SET fecha = ? WHERE id = ?",
          `__reajuste_${idReajuste}_${fila.id}`,
          fila.id
        );
      }
    }

    for (const alumno of alumnos) {
      const filas = agendasPorAlumno.get(alumno.id) || [];
      for (let indice = 0; indice < fechasNuevas.length; indice++) {
        const fecha = fechasNuevas[indice];
        const existente = filas[indice];
        if (existente) {
          const esOrigen = existente.fecha === fechaOrigen;
          await db.runAsync(
            `UPDATE agenda_alumnos SET fecha = ?, estado = 'programada',
              feriado_origen = ?, feriado_tipo_origen = ?, motivo_movimiento = ?
             WHERE id = ?`,
            fecha,
            esOrigen ? fechaOrigen : null,
            esOrigen ? "regular" : null,
            esOrigen ? "reajuste" : null,
            existente.id
          );
          generadas.push({ id: existente.id, alumno_id: alumno.id, fecha, creada: false });
        } else {
          const resultado = await db.runAsync(
            `INSERT INTO agenda_alumnos
             (alumno_id,grupo_id,fecha,tipo,estado)
             VALUES (?,?,?,'regular','programada')`,
            alumno.id, grupoId, fecha
          );
          generadas.push({
            id: resultado.lastInsertRowId,
            alumno_id: alumno.id,
            fecha,
            creada: true,
          });
        }
      }
      for (const sobrante of filas.slice(fechasNuevas.length)) {
        await db.runAsync(
          `UPDATE agenda_alumnos SET fecha = ?, estado = 'cancelada',
            feriado_origen = NULL, feriado_tipo_origen = NULL, motivo_movimiento = NULL
           WHERE id = ?`,
          `__reajuste_sobrante_${idReajuste}_${sobrante.id}`,
          sobrante.id
        );
      }
    }

    await db.runAsync("UPDATE grupos SET fecha_inicio = ? WHERE id = ?", fechaDestino, grupoId);
    await db.runAsync(
      `INSERT INTO feriados (fecha,grupo_id,motivo,fecha_recuperacion,tipo)
       VALUES (?,?,? ,?,'reajuste')
       ON CONFLICT(fecha,grupo_id) DO UPDATE SET motivo=excluded.motivo,
         fecha_recuperacion=excluded.fecha_recuperacion,tipo='reajuste'`,
      fechaOrigen, grupoId, `Reajuste · ${grupo.nombre}`, fechaDestino
    );
    await db.runAsync(
      "UPDATE reajustes_grupo SET agenda_generada = ? WHERE id = ?",
      JSON.stringify({
        agendas: generadas,
        canceladasDesplazadas,
        acompanantes: acompanantes.map(item => ({
          id: item.id,
          alumno_id: item.alumno_id,
          fecha: item.fecha,
          tipo: item.tipo,
        })),
      }),
      idReajuste
    );
    cantidad = anteriores.length + acompanantes.length;
  });
  return cantidad;
}

export interface ResultadoReajusteFechaInicio {
  reajustado: boolean;
  fechaOrigen: string;
  fechaDestino: string;
}

export async function reajustarGrupoDesdeFechaInicio(
  grupoId: number,
  fechaInicioNueva: string,
  desde = fechaLocal()
): Promise<ResultadoReajusteFechaInicio> {
  const db = await databasePromise;
  const grupo = await db.getFirstAsync<Grupo>(
    "SELECT * FROM grupos WHERE id = ? AND activo = 1",
    grupoId
  );
  if (!grupo) throw new Error("No se encontró el grupo");
  if (grupo.frecuencia !== "quincenal") {
    throw new Error("El reajuste de fecha de inicio requiere un grupo de 2 veces por mes");
  }
  if (fechaMediodia(fechaInicioNueva).getDay() !== grupo.dia) {
    throw new Error("La nueva fecha debe caer el mismo día de la semana del grupo");
  }

  const primeraFutura = await db.getFirstAsync<{ fecha: string | null }>(
    `SELECT MIN(fecha) AS fecha FROM agenda_alumnos
     WHERE grupo_id = ? AND fecha >= ? AND tipo = 'regular'
       AND estado != 'cancelada' AND fecha GLOB '????-??-??'`,
    grupoId,
    desde
  );
  if (!primeraFutura?.fecha) {
    throw new Error("No hay una clase habitual futura que se pueda reajustar");
  }

  const grupoNuevo: Grupo = { ...grupo, fecha_inicio: fechaInicioNueva };
  const limiteDestino = fechaMediodia(desde);
  limiteDestino.setDate(limiteDestino.getDate() + 62);
  const fechaDestino = fechaInicioNueva >= desde
    ? fechaInicioNueva
    : fechasDelPatron(grupoNuevo, desde, limiteDestino.toISOString().slice(0, 10))[0];
  if (!fechaDestino) {
    throw new Error("No se pudo calcular la próxima clase del nuevo patrón");
  }

  if (primeraFutura.fecha === fechaDestino) {
    await db.runAsync(
      "UPDATE grupos SET fecha_inicio = ? WHERE id = ? AND activo = 1",
      fechaDestino,
      grupoId
    );
    return {
      reajustado: false,
      fechaOrigen: primeraFutura.fecha,
      fechaDestino,
    };
  }

  await reajustarGrupo(grupoId, primeraFutura.fecha, fechaDestino);
  return {
    reajustado: true,
    fechaOrigen: primeraFutura.fecha,
    fechaDestino,
  };
}

async function deshacerReajusteActivo(grupoId: number, fechaOrigen?: string) {
  const db = await databasePromise;
  let restauradas = 0;
  await db.withTransactionAsync(async () => {
    const historial = fechaOrigen
      ? await db.getFirstAsync<HistorialReajusteActivo>(
          `SELECT * FROM reajustes_grupo
           WHERE grupo_id = ? AND fecha_origen = ? AND deshecho_en IS NULL
           ORDER BY id DESC LIMIT 1`,
          grupoId,
          fechaOrigen
        )
      : await db.getFirstAsync<HistorialReajusteActivo>(
          `SELECT * FROM reajustes_grupo
           WHERE grupo_id = ? AND deshecho_en IS NULL
           ORDER BY id DESC LIMIT 1`,
          grupoId
        );
    if (!historial) throw new Error("No se encontró un reajuste activo para deshacer");
    const otroPosterior = await db.getFirstAsync<{ id: number }>(
      `SELECT id FROM reajustes_grupo
       WHERE grupo_id = ? AND deshecho_en IS NULL AND id > ? LIMIT 1`,
      historial.grupo_id,
      historial.id
    );
    if (otroPosterior) {
      throw new Error("No se puede deshacer porque el grupo tiene un reajuste posterior");
    }
    const grupo = await db.getFirstAsync<Grupo>(
      "SELECT * FROM grupos WHERE id = ? AND activo = 1",
      historial.grupo_id
    );
    if (!grupo || grupo.fecha_inicio !== historial.fecha_inicio_nueva) {
      throw new Error("No se puede deshacer porque el patrón del grupo cambió después");
    }

    const anteriores = JSON.parse(historial.agenda_anterior) as AgendaCruda[];
    const datosGenerados = leerAgendaGenerada(historial.agenda_generada);
    const generadas = datosGenerados.agendas;
    const canceladasDesplazadas = datosGenerados.canceladasDesplazadas;
    const acompanantes = datosGenerados.acompanantes;
    const anterioresPorId = new Map(anteriores.map(fila => [fila.id, fila]));
    const idsGenerados = new Set(generadas.map(fila => fila.id));
    const alumnos = [...new Set(anteriores.map(fila => fila.alumno_id))];

    for (const generada of generadas) {
      const actual = await db.getFirstAsync<AgendaCruda>(
        "SELECT * FROM agenda_alumnos WHERE id = ?",
        generada.id
      );
      if (!actual) continue;
      if (generada.creada && actual.tipo === "regular" && !esAgendaSimple(actual)) {
        throw new Error("No se puede deshacer: una clase generada fue modificada después");
      }
    }
    for (const acompanante of acompanantes) {
      const actual = await db.getFirstAsync<AgendaCruda>(
        "SELECT * FROM agenda_alumnos WHERE id = ?",
        acompanante.id
      );
      if (!actual || actual.fecha !== historial.fecha_destino ||
          actual.tipo !== acompanante.tipo || actual.estado !== "programada") {
        throw new Error("No se puede deshacer: una recuperación movida fue modificada después");
      }
    }

    const extrasAEliminar: number[] = [];
    for (const alumnoId of alumnos) {
      const extras = await db.getAllAsync<AgendaCruda>(
        `SELECT * FROM agenda_alumnos
         WHERE alumno_id = ? AND grupo_id = ? AND fecha >= ?
           AND tipo = 'regular' AND estado != 'cancelada' ORDER BY fecha,id`,
        alumnoId, historial.grupo_id, historial.fecha_origen
      );
      for (const extra of extras) {
        if (idsGenerados.has(extra.id)) continue;
        if (!esAgendaSimple(extra)) {
          throw new Error("No se puede deshacer: hay cambios posteriores en la agenda habitual");
        }
        extrasAEliminar.push(extra.id);
      }
    }

    const idsMovibles = new Set<number>();
    for (const generada of generadas) {
      const actual = await db.getFirstAsync<AgendaCruda>(
        "SELECT * FROM agenda_alumnos WHERE id = ?",
        generada.id
      );
      if (actual?.tipo === "regular") idsMovibles.add(actual.id);
    }
    for (const acompanante of acompanantes) idsMovibles.add(acompanante.id);
    for (const acompanante of acompanantes) {
      const conflicto = await conflictoEnFecha(
        db,
        acompanante.alumno_id,
        acompanante.fecha,
        idsMovibles
      );
      if (conflicto && conflicto.id !== acompanante.id) {
        throw new Error("No se puede deshacer porque la fecha original de una recuperación ya está ocupada");
      }
    }
    for (const anterior of anteriores) {
      const conflicto = await conflictoEnFecha(db, anterior.alumno_id, anterior.fecha, idsMovibles);
      if (conflicto && conflicto.id !== anterior.id) {
        throw new Error("No se puede deshacer porque una fecha original ya está ocupada");
      }
    }
    for (const cancelada of canceladasDesplazadas) {
      const fila = await db.getFirstAsync<AgendaCruda>(
        "SELECT * FROM agenda_alumnos WHERE id = ? AND estado = 'cancelada'",
        cancelada.id
      );
      if (!fila) {
        throw new Error("No se puede deshacer porque cambió una clase cancelada del historial");
      }
      const conflicto = await conflictoEnFecha(
        db,
        fila.alumno_id,
        cancelada.fecha,
        idsMovibles
      );
      if (conflicto) {
        throw new Error("No se puede deshacer porque una fecha archivada ya está ocupada");
      }
    }

    for (const id of idsMovibles) {
      await db.runAsync(
        "UPDATE agenda_alumnos SET fecha = ? WHERE id = ?",
        `__deshacer_reajuste_${historial.id}_${id}`,
        id
      );
    }
    for (const generada of generadas.filter(fila => fila.creada)) {
      const actual = await db.getFirstAsync<AgendaCruda>(
        "SELECT * FROM agenda_alumnos WHERE id = ?",
        generada.id
      );
      if (actual?.tipo === "regular") {
        await db.runAsync("DELETE FROM agenda_alumnos WHERE id = ?", generada.id);
      }
    }
    for (const id of extrasAEliminar) {
      await db.runAsync("DELETE FROM agenda_alumnos WHERE id = ?", id);
    }
    for (const cancelada of canceladasDesplazadas) {
      await db.runAsync(
        "UPDATE agenda_alumnos SET fecha = ? WHERE id = ? AND estado = 'cancelada'",
        cancelada.fecha,
        cancelada.id
      );
    }
    for (const acompanante of acompanantes) {
      await db.runAsync(
        "UPDATE agenda_alumnos SET fecha = ? WHERE id = ?",
        acompanante.fecha,
        acompanante.id
      );
      if (acompanante.tipo === "recuperacion") {
        await db.runAsync(
          `UPDATE clases SET fecha = ?
           WHERE alumno_id = ? AND grupo_id = ? AND fecha = ? AND estado = 'recuperacion'`,
          acompanante.fecha,
          acompanante.alumno_id,
          historial.grupo_id,
          historial.fecha_destino
        );
      }
      await db.runAsync(
        "UPDATE movimientos_pendientes SET fecha = ? WHERE agenda_id = ?",
        acompanante.fecha,
        acompanante.id
      );
    }

    for (const anterior of anteriores) {
      const actual = await db.getFirstAsync<AgendaCruda>(
        "SELECT * FROM agenda_alumnos WHERE id = ?",
        anterior.id
      );
      if (actual?.tipo === "regular") {
        await db.runAsync(
          `UPDATE agenda_alumnos SET fecha=?,grupo_id=?,tipo=?,estado=?,modelo_id=?,
            necesidades=?,cubre_agenda_id=?,origen_agenda_id=?,feriado_origen=?,
            feriado_tipo_origen=?,motivo_movimiento=?,pago_extra_mes=? WHERE id=?`,
          anterior.fecha, anterior.grupo_id, anterior.tipo, "programada",
          actual.modelo_id, actual.necesidades, anterior.cubre_agenda_id,
          anterior.origen_agenda_id, anterior.feriado_origen,
          anterior.feriado_tipo_origen, anterior.motivo_movimiento,
          anterior.pago_extra_mes ?? null, anterior.id
        );
      } else {
        await db.runAsync(
          `INSERT INTO agenda_alumnos
           (alumno_id,grupo_id,fecha,tipo,estado,modelo_id,necesidades,cubre_agenda_id,
            origen_agenda_id,feriado_origen,feriado_tipo_origen,motivo_movimiento,pago_extra_mes)
           VALUES (?,?,?,'regular','programada',?,?,?,?,?,?,?,?)`,
          anterior.alumno_id, anterior.grupo_id, anterior.fecha,
          anterior.modelo_id, anterior.necesidades, anterior.cubre_agenda_id,
          anterior.origen_agenda_id, anterior.feriado_origen,
          anterior.feriado_tipo_origen, anterior.motivo_movimiento,
          anterior.pago_extra_mes ?? null
        );
      }
      restauradas += 1;
    }

    await db.runAsync(
      "UPDATE grupos SET fecha_inicio = ? WHERE id = ?",
      historial.fecha_inicio_anterior,
      historial.grupo_id
    );
    const grupoAnterior: Grupo = {
      ...grupo,
      fecha_inicio: historial.fecha_inicio_anterior,
    };
    const fechasAnteriores = fechasDelPatron(
      grupoAnterior,
      historial.fecha_origen,
      historial.fecha_hasta
    );
    const alumnosHabituales = await db.getAllAsync<{ id: number }>(
      `SELECT id FROM alumnos
       WHERE grupo_id = ? AND activo = 1 AND sin_grupo = 0`,
      historial.grupo_id
    );
    for (const alumno of alumnosHabituales) {
      for (const fecha of fechasAnteriores) {
        await db.runAsync(
          `INSERT OR IGNORE INTO agenda_alumnos
           (alumno_id,grupo_id,fecha,tipo,estado)
           VALUES (?,?,?,'regular','programada')`,
          alumno.id, historial.grupo_id, fecha
        );
      }
    }
    await db.runAsync(
      "UPDATE reajustes_grupo SET deshecho_en = ? WHERE id = ?",
      new Date().toISOString(),
      historial.id
    );
    await db.runAsync(
      `DELETE FROM feriados
       WHERE fecha = ? AND grupo_id IN (?,0) AND tipo = 'reajuste'`,
      historial.fecha_origen, historial.grupo_id
    );
  });
  return restauradas;
}

export function deshacerReajuste(grupoId: number, fechaOrigen: string) {
  return deshacerReajusteActivo(grupoId, fechaOrigen);
}

export function deshacerUltimoReajuste(grupoId: number) {
  return deshacerReajusteActivo(grupoId);
}

export const reajusteRepository = {
  reajustar: reajustarGrupo,
  reajustarDesdeFechaInicio: reajustarGrupoDesdeFechaInicio,
  deshacer: deshacerReajuste,
  deshacerUltimo: deshacerUltimoReajuste,
  obtenerUltimoActivo: obtenerUltimoReajusteActivo,
};
