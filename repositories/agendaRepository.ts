import {
  AgendaAlumno, CategoriaPendiente, Grupo, TipoMovimientoClase,
} from "@/models";
import { buscarAusenciaSinCubrir } from "@/database/agendaMaintenance";
import { databasePromise, Database } from "@/database/connection";
import {
  registrarMovimientoPendiente,
  registrarMovimientoAgenda,
  revertirMovimientoAgenda,
  saldosPendientesPorCategoria,
} from "@/database/pendientes";

const SELECT_AGENDA = `
  SELECT ag.*, a.nombre AS alumno_nombre,
    CASE WHEN a.sin_grupo = 1 THEN NULL ELSE a.grupo_id END AS alumno_grupo_id,
    CASE WHEN a.sin_grupo = 1 THEN NULL ELSE gh.nombre END AS alumno_grupo_nombre,
    g.nombre AS grupo_nombre,
    g.color AS grupo_color, g.hora, mo.nombre AS modelo_nombre,
    (SELECT GROUP_CONCAT(modelo_id, ',') FROM (
      SELECT am.modelo_id
      FROM agenda_modelos am
      WHERE am.agenda_id = ag.id
      ORDER BY am.orden, am.modelo_id
    )) AS modelo_ids_csv,
    (SELECT GROUP_CONCAT(nombre, char(31)) FROM (
      SELECT modelo_multiple.nombre
      FROM agenda_modelos am
      JOIN modelos modelo_multiple ON modelo_multiple.id = am.modelo_id
      WHERE am.agenda_id = ag.id
      ORDER BY am.orden, am.modelo_id
    )) AS modelo_nombres_csv
  FROM agenda_alumnos ag
  JOIN alumnos a ON a.id = ag.alumno_id
  JOIN grupos g ON g.id = ag.grupo_id
  JOIN grupos gh ON gh.id = a.grupo_id
  LEFT JOIN modelos mo ON mo.id = ag.modelo_id
`;

type AgendaConsulta = AgendaAlumno & {
  modelo_ids_csv: string | null;
  modelo_nombres_csv: string | null;
};

function mapearAgenda(item: AgendaConsulta): AgendaAlumno {
  const modeloIds = item.modelo_ids_csv
    ? item.modelo_ids_csv.split(",").map(Number).filter(Number.isFinite)
    : item.modelo_id ? [item.modelo_id] : [];
  const modeloNombres = item.modelo_nombres_csv
    ? item.modelo_nombres_csv.split(String.fromCharCode(31)).filter(Boolean)
    : item.modelo_nombre ? [item.modelo_nombre] : [];
  return {
    ...item,
    modelo_id: modeloIds[0] || null,
    modelo_nombre: modeloNombres.join(", ") || null,
    modelo_ids: modeloIds,
    modelo_nombres: modeloNombres,
  };
}

type AgendaCancelable = Pick<AgendaAlumno,
  "id" | "alumno_id" | "grupo_id" | "fecha" | "tipo" | "estado" |
  "origen_agenda_id" | "pago_extra_mes" | "extra_adeudada"
>;

async function tieneMovimientoActivo(
  db: Database,
  agendaId: number,
  tipo: "ausencia" | "recuperacion"
) {
  const movimiento = await db.getFirstAsync<{ id: number }>(`
    SELECT m.id FROM movimientos_pendientes m
    WHERE m.agenda_id = ? AND m.tipo = ?
      AND NOT EXISTS (
        SELECT 1 FROM movimientos_pendientes reversion
        WHERE reversion.revierte_movimiento_id = m.id
      )
    ORDER BY m.id DESC LIMIT 1
  `, agendaId, tipo);
  return !!movimiento;
}

async function categoriaRecuperacionActiva(db: Database, agendaId: number) {
  const movimiento = await db.getFirstAsync<{ categoria: CategoriaPendiente }>(`
    SELECT m.categoria FROM movimientos_pendientes m
    WHERE m.agenda_id = ? AND m.tipo = 'recuperacion'
      AND NOT EXISTS (
        SELECT 1 FROM movimientos_pendientes reversion
        WHERE reversion.revierte_movimiento_id = m.id
      )
    ORDER BY m.id DESC LIMIT 1
  `, agendaId);
  return movimiento?.categoria || "regular";
}

export async function cancelarAgendaEnDb(
  db: Database,
  item: AgendaCancelable,
  contexto: string
) {
  if (item.estado === "cancelada") return false;
  const esExtraPagada = !!item.pago_extra_mes && !item.extra_adeudada;
  let extraPendienteYaRegistrada = false;

  if (item.estado === "ausente") {
    const ausenciaAuxiliar = await db.getFirstAsync<{ id: number }>(
      `SELECT id FROM clases
       WHERE alumno_id = ? AND grupo_id = ? AND fecha = ? AND estado = 'ausente'
       ORDER BY id DESC LIMIT 1`,
      item.alumno_id, item.grupo_id, item.fecha
    );
    const movimientoAusenciaActivo = await tieneMovimientoActivo(db, item.id, "ausencia");
    extraPendienteYaRegistrada = esExtraPagada && movimientoAusenciaActivo;
    if (!esExtraPagada &&
        (movimientoAusenciaActivo || (ausenciaAuxiliar && !item.extra_adeudada))) {
      await revertirMovimientoAgenda(db, {
        alumnoId: item.alumno_id,
        agendaId: item.id,
        tipoOriginal: "ausencia",
        deltaLegacy: -1,
        contextoLegacy: `${contexto}_ausencia`,
        fecha: item.fecha,
      });
    }
    await db.runAsync(
      `DELETE FROM clases
       WHERE alumno_id = ? AND grupo_id = ? AND fecha = ? AND estado = 'ausente'`,
      item.alumno_id, item.grupo_id, item.fecha
    );
  }

  if (esExtraPagada && !extraPendienteYaRegistrada) {
    await registrarMovimientoPendiente(db, {
      alumnoId: item.alumno_id,
      agendaId: item.id,
      delta: 1,
      tipo: "ajuste_manual",
      categoria: "extra",
      clave: `cancelacion_extra_pagada:agenda:${item.id}`,
      fecha: item.fecha,
    });
  }

  if (item.tipo === "recuperacion") {
    const recuperacionAuxiliar = await db.getFirstAsync<{ id: number }>(
      `SELECT id FROM clases
       WHERE alumno_id = ? AND grupo_id = ? AND fecha = ? AND estado = 'recuperacion'
       ORDER BY id DESC LIMIT 1`,
      item.alumno_id, item.grupo_id, item.fecha
    );
    if (recuperacionAuxiliar || await tieneMovimientoActivo(db, item.id, "recuperacion")) {
      await revertirMovimientoAgenda(db, {
        alumnoId: item.alumno_id,
        agendaId: item.id,
        tipoOriginal: "recuperacion",
        deltaLegacy: 1,
        contextoLegacy: `${contexto}_recuperacion`,
        fecha: item.fecha,
      });
    }
    await db.runAsync(
      `DELETE FROM clases
       WHERE alumno_id = ? AND grupo_id = ? AND fecha = ? AND estado = 'recuperacion'`,
      item.alumno_id, item.grupo_id, item.fecha
    );
  }

  if (item.tipo === "manual" && item.origen_agenda_id) {
    await db.runAsync(
      `UPDATE agenda_alumnos SET estado = 'programada'
       WHERE id = ? AND estado = 'ausente'
         AND NOT EXISTS (
           SELECT 1 FROM movimientos_pendientes m
           WHERE m.agenda_id = agenda_alumnos.id AND m.tipo = 'ausencia'
             AND NOT EXISTS (
               SELECT 1 FROM movimientos_pendientes r
               WHERE r.revierte_movimiento_id = m.id
             )
         )`,
      item.origen_agenda_id
    );
  }

  await db.runAsync("UPDATE agenda_alumnos SET estado = 'cancelada' WHERE id = ?", item.id);
  return true;
}

export async function moverAgendaDelDiaEnDb(
  db: Database,
  fechaOrigen: string,
  fechaDestino: string,
  motivo: TipoMovimientoClase,
  grupoId: number
) {
  if (fechaOrigen === fechaDestino) {
    throw new Error("La nueva fecha debe ser diferente de la fecha original");
  }
  const items = await db.getAllAsync<AgendaAlumno>(
    `SELECT ag.*, a.nombre AS alumno_nombre
     FROM agenda_alumnos ag
     JOIN alumnos a ON a.id = ag.alumno_id
     WHERE ag.fecha = ? AND ag.grupo_id = ? AND ag.estado = 'programada'
     ORDER BY ag.id`,
    fechaOrigen, grupoId
  );

  for (const item of items) {
    const conflicto = await db.getFirstAsync<{ id: number }>(
      `SELECT id FROM agenda_alumnos
       WHERE alumno_id = ? AND fecha = ? AND id != ?`,
      item.alumno_id, fechaDestino, item.id
    );
    if (conflicto) {
      throw new Error(`${item.alumno_nombre} ya tiene una clase cargada en la fecha elegida`);
    }
  }

  for (const item of items) {
    await db.runAsync(
      `UPDATE agenda_alumnos
       SET fecha = ?, tipo = 'manual', feriado_origen = ?,
         feriado_tipo_origen = ?, motivo_movimiento = ? WHERE id = ?`,
      fechaDestino, fechaOrigen, item.tipo, motivo, item.id
    );
    if (item.tipo === "regular") {
      await db.runAsync(
        `INSERT INTO agenda_alumnos
         (alumno_id,grupo_id,fecha,tipo,estado,origen_agenda_id)
         VALUES (?,?,?,'regular','cancelada',?)`,
        item.alumno_id, item.grupo_id, fechaOrigen, item.id
      );
    }
  }
  return items.length;
}

export const agendaRepository = {
  async listarEntre(inicio: string, fin: string) {
    const db = await databasePromise;
    const items = await db.getAllAsync<AgendaConsulta>(`${SELECT_AGENDA}
      WHERE ag.fecha BETWEEN ? AND ? AND ag.estado != 'cancelada'
      ORDER BY ag.fecha, g.hora, a.nombre COLLATE NOCASE`, inicio, fin);
    return items.map(mapearAgenda);
  },

  async listarDia(fecha: string) {
    const db = await databasePromise;
    const items = await db.getAllAsync<AgendaConsulta>(`${SELECT_AGENDA}
      WHERE ag.fecha = ? AND ag.estado != 'cancelada'
      ORDER BY g.hora, a.nombre COLLATE NOCASE`, fecha);
    return items.map(mapearAgenda);
  },

  async registrarAusencia(alumnoId: number, grupoId: number, fecha: string) {
    const db = await databasePromise;
    await db.withTransactionAsync(async () => {
      const agenda = await db.getFirstAsync<{
        id: number;
        estado: string;
        tipo: AgendaAlumno["tipo"];
        pago_extra_mes: string | null;
        extra_adeudada: number;
      }>(
        `SELECT id,estado,tipo,pago_extra_mes,extra_adeudada
         FROM agenda_alumnos WHERE alumno_id = ? AND grupo_id = ? AND fecha = ?`,
        alumnoId, grupoId, fecha
      );
      if (!agenda || agenda.estado === "ausente") return;
      await db.runAsync(
        "INSERT INTO clases (alumno_id,grupo_id,fecha,estado) VALUES (?,?,?,'ausente')",
        alumnoId, grupoId, fecha
      );
      await db.runAsync(
        "UPDATE agenda_alumnos SET estado = 'ausente' WHERE id = ?",
        agenda.id
      );
      // Una extra a cobrar que finalmente no se usa deja de ser deuda. En cambio,
      // una extra ya pagada vuelve como crédito pendiente a favor del alumno.
      if (!agenda.extra_adeudada) {
        const categoria: CategoriaPendiente = agenda.tipo === "recuperacion"
          ? await categoriaRecuperacionActiva(db, agenda.id)
          : agenda.pago_extra_mes ? "extra" : "regular";
        await registrarMovimientoAgenda(db, {
          alumnoId,
          agendaId: agenda.id,
          delta: 1,
          tipo: "ausencia",
          categoria,
          fecha,
        });
      }
    });
  },

  async revertirAusencia(alumnoId: number, grupoId: number, fecha: string) {
    const db = await databasePromise;
    await db.withTransactionAsync(async () => {
      const agenda = await db.getFirstAsync<{
        id: number; estado: string; extra_adeudada: number;
      }>(
        `SELECT id,estado,extra_adeudada FROM agenda_alumnos
         WHERE alumno_id = ? AND grupo_id = ? AND fecha = ?`,
        alumnoId, grupoId, fecha
      );
      if (!agenda || agenda.estado !== "ausente") return;
      const ausencia = await db.getFirstAsync<{ id: number }>(
        `SELECT id FROM clases WHERE alumno_id = ? AND grupo_id = ?
         AND fecha = ? AND estado = 'ausente' ORDER BY id DESC LIMIT 1`,
        alumnoId, grupoId, fecha
      );
      const movimiento = await db.getFirstAsync<{ id: number }>(
        `SELECT id FROM movimientos_pendientes
         WHERE agenda_id = ? AND tipo = 'ausencia' LIMIT 1`,
        agenda.id
      );
      await db.runAsync(
        "UPDATE agenda_alumnos SET estado = 'programada' WHERE id = ?",
        agenda.id
      );
      if (movimiento || (ausencia && !agenda.extra_adeudada)) {
        await revertirMovimientoAgenda(db, {
          alumnoId,
          agendaId: agenda.id,
          tipoOriginal: "ausencia",
          deltaLegacy: -1,
          contextoLegacy: "reversion_ausencia",
          fecha,
        });
      }
      await db.runAsync(
        `DELETE FROM clases WHERE alumno_id = ? AND grupo_id = ?
         AND fecha = ? AND estado = 'ausente'`,
        alumnoId, grupoId, fecha
      );
    });
  },

  async asignarRecuperacion(
    alumnoId: number,
    grupoId: number,
    fecha: string,
    categoria: CategoriaPendiente = "regular"
  ) {
    const db = await databasePromise;
    await db.withTransactionAsync(async () => {
      const alumno = await db.getFirstAsync<{ id: number }>(
        "SELECT id FROM alumnos WHERE id = ? AND activo = 1", alumnoId
      );
      const saldos = await saldosPendientesPorCategoria(db, alumnoId);
      const disponible = categoria === "extra" ? saldos.extras : saldos.regulares;
      if (!alumno || disponible < 1) {
        throw new Error(
          categoria === "extra"
            ? "El alumno no tiene clases extra pendientes"
            : "El alumno no tiene clases habituales pendientes"
        );
      }
      const ausenciaId = await buscarAusenciaSinCubrir(db, grupoId, fecha);
      await db.runAsync(
        `INSERT INTO clases (alumno_id,grupo_id,fecha,estado)
         SELECT ?,?,?,'recuperacion'
         WHERE NOT EXISTS (
           SELECT 1 FROM clases WHERE alumno_id = ? AND grupo_id = ?
             AND fecha = ? AND estado = 'recuperacion'
         )`,
        alumnoId, grupoId, fecha,
        alumnoId, grupoId, fecha
      );
      await db.runAsync(
        `INSERT INTO agenda_alumnos
         (alumno_id,grupo_id,fecha,tipo,estado,cubre_agenda_id,origen_agenda_id)
         VALUES (?,?,?,'recuperacion','programada',?,NULL)
         ON CONFLICT(alumno_id,fecha) DO UPDATE SET
           grupo_id = excluded.grupo_id, tipo = 'recuperacion', estado = 'programada',
           cubre_agenda_id = excluded.cubre_agenda_id, origen_agenda_id = NULL,
           pago_extra_mes = NULL, extra_adeudada = 0`,
        alumnoId, grupoId, fecha, ausenciaId
      );
      const agenda = await db.getFirstAsync<{ id: number }>(
        "SELECT id FROM agenda_alumnos WHERE alumno_id = ? AND fecha = ?",
        alumnoId, fecha
      );
      if (!agenda) throw new Error("No se pudo crear la recuperación");
      await registrarMovimientoAgenda(db, {
        alumnoId,
        agendaId: agenda.id,
        delta: -1,
        tipo: "recuperacion",
        categoria,
        fecha,
      });
    });
  },

  async cambiarClaseParaCubrir(
    alumnoId: number,
    agendaOrigenId: number,
    grupoDestinoId: number,
    fechaDestino: string
  ) {
    const db = await databasePromise;
    await db.withTransactionAsync(async () => {
      const origen = await db.getFirstAsync<AgendaAlumno>(
        `SELECT * FROM agenda_alumnos WHERE id = ? AND alumno_id = ?
         AND tipo = 'regular' AND estado = 'programada'`,
        agendaOrigenId, alumnoId
      );
      if (!origen) throw new Error("No se encontró la clase habitual para cambiar");
      const ausenciaId = await buscarAusenciaSinCubrir(db, grupoDestinoId, fechaDestino);
      await db.runAsync("UPDATE agenda_alumnos SET estado = 'ausente' WHERE id = ?", agendaOrigenId);
      await db.runAsync(
        `INSERT INTO agenda_alumnos
         (alumno_id,grupo_id,fecha,tipo,estado,cubre_agenda_id,origen_agenda_id)
         VALUES (?,?,?,'manual','programada',?,?)
         ON CONFLICT(alumno_id,fecha) DO UPDATE SET
           grupo_id = excluded.grupo_id, tipo = 'manual', estado = 'programada',
           cubre_agenda_id = excluded.cubre_agenda_id,
           origen_agenda_id = excluded.origen_agenda_id,
           pago_extra_mes = NULL, extra_adeudada = 0`,
        alumnoId, grupoDestinoId, fechaDestino, ausenciaId, agendaOrigenId
      );
    });
  },

  async mover(agendaId: number, nuevaFecha: string) {
    const db = await databasePromise;
    const item = await db.getFirstAsync<AgendaAlumno>(
      "SELECT * FROM agenda_alumnos WHERE id = ?", agendaId
    );
    if (!item || item.fecha === nuevaFecha) return;
    const fechaDestino = new Date(`${nuevaFecha}T12:00:00`);
    const gruposDestino = await db.getAllAsync<Grupo>(
      "SELECT * FROM grupos WHERE dia = ? AND activo = 1 ORDER BY hora", fechaDestino.getDay()
    );
    const grupoDestinoId = gruposDestino.length === 1 ? gruposDestino[0].id : item.grupo_id;
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        "UPDATE agenda_alumnos SET fecha = ?, grupo_id = ?, tipo = 'manual' WHERE id = ?",
        nuevaFecha, grupoDestinoId, agendaId
      );
      if (item.tipo === "regular") {
        await db.runAsync(
          `INSERT OR IGNORE INTO agenda_alumnos
           (alumno_id,grupo_id,fecha,tipo,estado) VALUES (?,?,?,'regular','cancelada')`,
          item.alumno_id, item.grupo_id, item.fecha
        );
      }
    });
  },

  async moverDia(
    fechaOrigen: string,
    fechaDestino: string,
    motivo: TipoMovimientoClase,
    grupoId: number
  ) {
    const db = await databasePromise;
    let movidas = 0;
    await db.withTransactionAsync(async () => {
      movidas = await moverAgendaDelDiaEnDb(db, fechaOrigen, fechaDestino, motivo, grupoId);
    });
    return movidas;
  },

  async agregarManual(alumnoId: number, grupoId: number, fecha: string) {
    const db = await databasePromise;
    return db.runAsync(
      `INSERT INTO agenda_alumnos (alumno_id,grupo_id,fecha,tipo,estado)
       VALUES (?,?,?,'manual','programada')
       ON CONFLICT(alumno_id,fecha) DO UPDATE SET
         grupo_id = excluded.grupo_id, tipo = 'manual', estado = 'programada',
         pago_extra_mes = NULL, extra_adeudada = 0`,
      alumnoId, grupoId, fecha
    );
  },

  async asignarClaseExtra(alumnoId: number, grupoId: number, fecha: string) {
    const db = await databasePromise;
    const mesClase = fecha.slice(0, 7);
    await db.withTransactionAsync(async () => {
      const alumno = await db.getFirstAsync<{ id: number }>(
        "SELECT id FROM alumnos WHERE id = ? AND activo = 1",
        alumnoId
      );
      if (!alumno) throw new Error("La persona ya no está disponible");
      const pago = await db.getFirstAsync<{
        mes: string; clases_extra: number; clases_extra_usadas: number;
      }>(
        `SELECT mes,clases_extra,clases_extra_usadas
         FROM pagos_alumnos
         WHERE alumno_id = ? AND mes <= ? AND pagado = 1
           AND clases_extra_usadas < clases_extra
         ORDER BY mes
         LIMIT 1`,
        alumnoId,
        mesClase
      );
      if (!pago) {
        throw new Error("El alumno no tiene clases extra pagadas disponibles");
      }
      const existente = await db.getFirstAsync<{ id: number; estado: string }>(
        "SELECT id,estado FROM agenda_alumnos WHERE alumno_id = ? AND fecha = ?",
        alumnoId,
        fecha
      );
      if (existente && existente.estado !== "cancelada") {
        throw new Error("El alumno ya tiene una clase cargada en esta fecha");
      }
      const credito = await db.runAsync(
        `UPDATE pagos_alumnos
         SET clases_extra_usadas = clases_extra_usadas + 1,
             actualizado_en = ?
         WHERE alumno_id = ? AND mes = ? AND pagado = 1
           AND clases_extra_usadas < clases_extra`,
        new Date().toISOString(),
        alumnoId,
        pago.mes
      );
      if (!credito.changes) {
        throw new Error("La clase extra ya no está disponible");
      }
      const ausenciaId = await buscarAusenciaSinCubrir(db, grupoId, fecha);
      await db.runAsync(
        `INSERT INTO agenda_alumnos
          (alumno_id,grupo_id,fecha,tipo,estado,cubre_agenda_id,
           origen_agenda_id,pago_extra_mes)
         VALUES (?,?,?,'manual','programada',?,NULL,?)
         ON CONFLICT(alumno_id,fecha) DO UPDATE SET
           grupo_id = excluded.grupo_id,
           tipo = 'manual',
           estado = 'programada',
           cubre_agenda_id = excluded.cubre_agenda_id,
           origen_agenda_id = NULL,
           pago_extra_mes = excluded.pago_extra_mes,
           extra_adeudada = 0`,
        alumnoId,
        grupoId,
        fecha,
        ausenciaId,
        pago.mes
      );
    });
  },

  async asignarClaseExtraAdeudada(alumnoId: number, grupoId: number, fecha: string) {
    const db = await databasePromise;
    await db.withTransactionAsync(async () => {
      const alumno = await db.getFirstAsync<{ id: number }>(
        "SELECT id FROM alumnos WHERE id = ? AND activo = 1",
        alumnoId
      );
      if (!alumno) throw new Error("La persona ya no está disponible");
      const existente = await db.getFirstAsync<{ id: number; estado: string }>(
        "SELECT id,estado FROM agenda_alumnos WHERE alumno_id = ? AND fecha = ?",
        alumnoId,
        fecha
      );
      if (existente && existente.estado !== "cancelada") {
        throw new Error("El alumno ya tiene una clase cargada en esta fecha");
      }
      const ausenciaId = await buscarAusenciaSinCubrir(db, grupoId, fecha);
      await db.runAsync(
        `INSERT INTO agenda_alumnos
          (alumno_id,grupo_id,fecha,tipo,estado,cubre_agenda_id,
           origen_agenda_id,pago_extra_mes,extra_adeudada)
         VALUES (?,?,?,'manual','programada',?,NULL,NULL,1)
         ON CONFLICT(alumno_id,fecha) DO UPDATE SET
           grupo_id = excluded.grupo_id,
           tipo = 'manual',
           estado = 'programada',
           cubre_agenda_id = excluded.cubre_agenda_id,
           origen_agenda_id = NULL,
           pago_extra_mes = NULL,
           extra_adeudada = 1`,
        alumnoId,
        grupoId,
        fecha,
        ausenciaId
      );
    });
  },

  async quitar(agendaId: number) {
    const db = await databasePromise;
    const item = await db.getFirstAsync<AgendaCancelable>(
      "SELECT * FROM agenda_alumnos WHERE id = ?", agendaId
    );
    if (!item || item.estado === "cancelada") return;
    await db.withTransactionAsync(async () => {
      await cancelarAgendaEnDb(db, item, "quitar_agenda");
    });
  },

  async asignarModelos(agendaId: number, modeloIds: number[], necesidades: string) {
    const db = await databasePromise;
    const ids = [...new Set(modeloIds.filter(id => Number.isInteger(id) && id > 0))];
    await db.withTransactionAsync(async () => {
      await db.runAsync("DELETE FROM agenda_modelos WHERE agenda_id = ?", agendaId);
      for (let orden = 0; orden < ids.length; orden++) {
        const resultado = await db.runAsync(
          `INSERT INTO agenda_modelos (agenda_id,modelo_id,orden)
           SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM modelos WHERE id = ?)`,
          agendaId, ids[orden], orden, ids[orden]
        );
        if (!resultado.changes) throw new Error("Uno de los modelos elegidos ya no existe");
      }
      await db.runAsync(
        "UPDATE agenda_alumnos SET modelo_id = ?, necesidades = ? WHERE id = ?",
        ids[0] || null, necesidades.trim() || null, agendaId
      );
    });
  },
};

export const agendaDelMes = (inicio: string, fin: string) => agendaRepository.listarEntre(inicio, fin);
export const agendaDelDia = (fecha: string) => agendaRepository.listarDia(fecha);
export const registrarAusencia = (alumnoId: number, grupoId: number, fecha: string) => agendaRepository.registrarAusencia(alumnoId, grupoId, fecha);
export const revertirAusencia = (alumnoId: number, grupoId: number, fecha: string) => agendaRepository.revertirAusencia(alumnoId, grupoId, fecha);
export const asignarRecuperacion = (
  alumnoId: number,
  grupoId: number,
  fecha: string,
  categoria: CategoriaPendiente = "regular"
) => agendaRepository.asignarRecuperacion(alumnoId, grupoId, fecha, categoria);
export const asignarClaseExtra = (alumnoId: number, grupoId: number, fecha: string) =>
  agendaRepository.asignarClaseExtra(alumnoId, grupoId, fecha);
export const asignarClaseExtraAdeudada = (alumnoId: number, grupoId: number, fecha: string) =>
  agendaRepository.asignarClaseExtraAdeudada(alumnoId, grupoId, fecha);
export const cambiarClaseParaCubrir = (alumnoId: number, agendaId: number, grupoId: number, fecha: string) => agendaRepository.cambiarClaseParaCubrir(alumnoId, agendaId, grupoId, fecha);
export const moverFechaAgenda = (id: number, fecha: string) => agendaRepository.mover(id, fecha);
export const moverAgendaDelDia = (
  origen: string, destino: string, motivo: TipoMovimientoClase, grupoId: number
) => agendaRepository.moverDia(origen, destino, motivo, grupoId);
export const agregarFechaManual = (alumnoId: number, grupoId: number, fecha: string) => agendaRepository.agregarManual(alumnoId, grupoId, fecha);
export const quitarFechaAgenda = (id: number) => agendaRepository.quitar(id);
export const asignarModelosAgenda = (id: number, modeloIds: number[], necesidades: string) =>
  agendaRepository.asignarModelos(id, modeloIds, necesidades);
export const asignarModeloAgenda = (id: number, modeloId: number | null, necesidades: string) =>
  agendaRepository.asignarModelos(id, modeloId ? [modeloId] : [], necesidades);
