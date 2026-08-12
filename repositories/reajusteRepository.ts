import { databasePromise, Database } from "@/database/connection";
import { fechaDentroDe } from "@/database/dates";
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
}

interface AgendaReajustada {
  id: number;
  alumno_id: number;
  fecha: string;
  creada: boolean;
}

interface CanceladaDesplazada {
  id: number;
  fecha: string;
}

interface AgendaGeneradaReajuste {
  agendas: AgendaReajustada[];
  canceladasDesplazadas: CanceladaDesplazada[];
}

interface HistorialReajuste {
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
  if (destino <= origen) {
    throw new Error("La nueva fecha debe ser posterior a la clase que se reajusta");
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
    return { agendas: contenido, canceladasDesplazadas: [] };
  }
  return {
    agendas: contenido.agendas || [],
    canceladasDesplazadas: contenido.canceladasDesplazadas || [],
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
       WHERE grupo_id = ? AND fecha >= ? AND tipo = 'regular'`,
      grupoId,
      fechaOrigen
    );
    const fechaHasta = [fechaDentroDe(370), ultima?.fecha || fechaDestino, fechaDestino]
      .sort()
      .at(-1) as string;
    const grupoNuevo: Grupo = { ...grupo, fecha_inicio: fechaDestino };
    const fechasNuevas = fechasDelPatron(grupoNuevo, fechaDestino, fechaHasta);
    const anteriores: AgendaCruda[] = [];
    const agendasPorAlumno = new Map<number, AgendaCruda[]>();
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
          sobrante.fecha,
          sobrante.id
        );
      }
    }

    await db.runAsync("UPDATE grupos SET fecha_inicio = ? WHERE id = ?", fechaDestino, grupoId);
    await db.runAsync(
      `INSERT INTO feriados (fecha,motivo,fecha_recuperacion,tipo)
       VALUES (?,? ,?,'reajuste')
       ON CONFLICT(fecha) DO UPDATE SET motivo=excluded.motivo,
         fecha_recuperacion=excluded.fecha_recuperacion,tipo='reajuste'`,
      fechaOrigen, `Reajuste · ${grupo.nombre}`, fechaDestino
    );
    await db.runAsync(
      "UPDATE reajustes_grupo SET agenda_generada = ? WHERE id = ?",
      JSON.stringify({ agendas: generadas, canceladasDesplazadas }),
      idReajuste
    );
    cantidad = anteriores.length;
  });
  return cantidad;
}

export async function deshacerReajuste(fechaOrigen: string) {
  const db = await databasePromise;
  let restauradas = 0;
  await db.withTransactionAsync(async () => {
    const historial = await db.getFirstAsync<HistorialReajuste>(
      `SELECT * FROM reajustes_grupo
       WHERE fecha_origen = ? AND deshecho_en IS NULL ORDER BY id DESC LIMIT 1`,
      fechaOrigen
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

    for (const anterior of anteriores) {
      const actual = await db.getFirstAsync<AgendaCruda>(
        "SELECT * FROM agenda_alumnos WHERE id = ?",
        anterior.id
      );
      if (actual?.tipo === "regular") {
        await db.runAsync(
          `UPDATE agenda_alumnos SET fecha=?,grupo_id=?,tipo=?,estado=?,modelo_id=?,
            necesidades=?,cubre_agenda_id=?,origen_agenda_id=?,feriado_origen=?,
            feriado_tipo_origen=?,motivo_movimiento=? WHERE id=?`,
          anterior.fecha, anterior.grupo_id, anterior.tipo, "programada",
          actual.modelo_id, actual.necesidades, anterior.cubre_agenda_id,
          anterior.origen_agenda_id, anterior.feriado_origen,
          anterior.feriado_tipo_origen, anterior.motivo_movimiento, anterior.id
        );
      } else {
        await db.runAsync(
          `INSERT INTO agenda_alumnos
           (alumno_id,grupo_id,fecha,tipo,estado,modelo_id,necesidades,cubre_agenda_id,
            origen_agenda_id,feriado_origen,feriado_tipo_origen,motivo_movimiento)
           VALUES (?,?,?,'regular','programada',?,?,?,?,?,?,?)`,
          anterior.alumno_id, anterior.grupo_id, anterior.fecha,
          anterior.modelo_id, anterior.necesidades, anterior.cubre_agenda_id,
          anterior.origen_agenda_id, anterior.feriado_origen,
          anterior.feriado_tipo_origen, anterior.motivo_movimiento
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
      "DELETE FROM feriados WHERE fecha = ? AND tipo = 'reajuste'",
      fechaOrigen
    );
  });
  return restauradas;
}

export const reajusteRepository = {
  reajustar: reajustarGrupo,
  deshacer: deshacerReajuste,
};
