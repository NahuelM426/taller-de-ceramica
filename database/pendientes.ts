import type { TipoMovimientoPendiente } from "@/models";
import { fechaLocal } from "./dates";

type ValorSqlite = string | number | null | boolean | Uint8Array;

export interface DatabasePendientes {
  runAsync(
    sql: string,
    ...valores: ValorSqlite[]
  ): Promise<{ lastInsertRowId: number; changes: number }>;
  getFirstAsync<T>(sql: string, ...valores: ValorSqlite[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...valores: ValorSqlite[]): Promise<T[]>;
}

interface MovimientoInput {
  alumnoId: number;
  delta: number;
  tipo: TipoMovimientoPendiente;
  clave: string;
  agendaId?: number | null;
  revierteMovimientoId?: number | null;
  fecha?: string;
}

type TipoMovimientoAgenda = "ausencia" | "recuperacion";

export interface InconsistenciaPendientes {
  alumno_id: number;
  alumno_nombre: string;
  pendientes_cache: number;
  saldo_calculado: number;
}

export async function saldoPendientes(db: DatabasePendientes, alumnoId: number) {
  const resultado = await db.getFirstAsync<{ saldo: number }>(
    `SELECT COALESCE(SUM(delta), 0) AS saldo
     FROM movimientos_pendientes WHERE alumno_id = ?`,
    alumnoId
  );
  return resultado?.saldo || 0;
}

export async function registrarMovimientoPendiente(
  db: DatabasePendientes,
  movimiento: MovimientoInput
) {
  if (!Number.isInteger(movimiento.delta) || movimiento.delta === 0) {
    throw new Error("El movimiento de pendientes debe ser un número entero distinto de cero");
  }
  const existente = await db.getFirstAsync<{ id: number }>(
    "SELECT id FROM movimientos_pendientes WHERE clave = ?",
    movimiento.clave
  );
  if (existente) {
    const saldo = await saldoPendientes(db, movimiento.alumnoId);
    return { creado: false, saldo };
  }
  const saldoAnterior = await saldoPendientes(db, movimiento.alumnoId);
  if (saldoAnterior + movimiento.delta < 0) {
    throw new Error("El movimiento dejaría un saldo de pendientes negativo");
  }
  const resultado = await db.runAsync(
    `INSERT INTO movimientos_pendientes
     (alumno_id,agenda_id,delta,tipo,clave,revierte_movimiento_id,fecha,creado_en)
     VALUES (?,?,?,?,?,?,?,?)`,
    movimiento.alumnoId,
    movimiento.agendaId ?? null,
    movimiento.delta,
    movimiento.tipo,
    movimiento.clave,
    movimiento.revierteMovimientoId ?? null,
    movimiento.fecha || fechaLocal(),
    new Date().toISOString()
  );
  const saldo = await saldoPendientes(db, movimiento.alumnoId);
  await db.runAsync(
    "UPDATE alumnos SET pendientes = ? WHERE id = ?",
    saldo,
    movimiento.alumnoId
  );
  return { creado: resultado.changes > 0, saldo };
}

export async function registrarMovimientoAgenda(
  db: DatabasePendientes,
  movimiento: {
    alumnoId: number;
    agendaId: number;
    delta: 1 | -1;
    tipo: TipoMovimientoAgenda;
    fecha: string;
  }
) {
  const ciclos = await db.getFirstAsync<{ total: number }>(
    `SELECT COUNT(*) AS total FROM movimientos_pendientes
     WHERE agenda_id = ? AND tipo = ?`,
    movimiento.agendaId,
    movimiento.tipo
  );
  const ciclo = (ciclos?.total || 0) + 1;
  return registrarMovimientoPendiente(db, {
    ...movimiento,
    clave: `${movimiento.tipo}:agenda:${movimiento.agendaId}:ciclo:${ciclo}`,
  });
}

export async function revertirMovimientoAgenda(
  db: DatabasePendientes,
  movimiento: {
    alumnoId: number;
    agendaId: number;
    tipoOriginal: TipoMovimientoAgenda;
    deltaLegacy: 1 | -1;
    contextoLegacy: string;
    fecha: string;
  }
) {
  const original = await db.getFirstAsync<{ id: number; delta: number }>(`
    SELECT m.id, m.delta
    FROM movimientos_pendientes m
    WHERE m.agenda_id = ? AND m.tipo = ?
      AND NOT EXISTS (
        SELECT 1 FROM movimientos_pendientes reversion
        WHERE reversion.revierte_movimiento_id = m.id
      )
    ORDER BY m.id DESC LIMIT 1
  `, movimiento.agendaId, movimiento.tipoOriginal);
  if (original) {
    return registrarMovimientoPendiente(db, {
      alumnoId: movimiento.alumnoId,
      agendaId: movimiento.agendaId,
      delta: -original.delta,
      tipo: "reversion",
      clave: `reversion:movimiento:${original.id}`,
      revierteMovimientoId: original.id,
      fecha: movimiento.fecha,
    });
  }

  const historial = await db.getFirstAsync<{ total: number }>(
    `SELECT COUNT(*) AS total FROM movimientos_pendientes
     WHERE agenda_id = ? AND tipo = ?`,
    movimiento.agendaId,
    movimiento.tipoOriginal
  );
  if (historial?.total) {
    return {
      creado: false,
      saldo: await saldoPendientes(db, movimiento.alumnoId),
    };
  }
  return registrarMovimientoPendiente(db, {
    alumnoId: movimiento.alumnoId,
    agendaId: movimiento.agendaId,
    delta: movimiento.deltaLegacy,
    tipo: "reversion",
    clave: `${movimiento.contextoLegacy}:legacy:agenda:${movimiento.agendaId}`,
    fecha: movimiento.fecha,
  });
}

export async function ajustarSaldoPendientes(
  db: DatabasePendientes,
  alumnoId: number,
  nuevoSaldo: number,
  clave = `ajuste_manual:${alumnoId}:${Date.now()}`
) {
  if (!Number.isInteger(nuevoSaldo) || nuevoSaldo < 0) {
    throw new Error("El saldo de pendientes debe ser un número entero mayor o igual a cero");
  }
  const saldoActual = await saldoPendientes(db, alumnoId);
  const delta = nuevoSaldo - saldoActual;
  if (!delta) {
    await db.runAsync(
      "UPDATE alumnos SET pendientes = ? WHERE id = ?",
      saldoActual,
      alumnoId
    );
    return { creado: false, saldo: saldoActual };
  }
  return registrarMovimientoPendiente(db, {
    alumnoId,
    delta,
    tipo: "ajuste_manual",
    clave,
  });
}

export async function cancelarPendientesPorAusenciasFuturas(
  db: DatabasePendientes,
  alumnoId: number,
  desde: string,
  contexto: string,
  grupoId?: number
) {
  const parametros: Array<string | number> = [alumnoId, desde];
  const filtroGrupo = grupoId ? "AND ag.grupo_id = ?" : "";
  if (grupoId) parametros.push(grupoId);
  const ausencias = await db.getAllAsync<{
    id: number; grupo_id: number; fecha: string;
  }>(`
    SELECT ag.id, ag.grupo_id, ag.fecha
    FROM agenda_alumnos ag
    WHERE ag.alumno_id = ? AND ag.fecha >= ?
      AND ag.tipo = 'regular' AND ag.estado = 'ausente'
      ${filtroGrupo}
      AND NOT EXISTS (
        SELECT 1 FROM agenda_alumnos movida
        WHERE movida.origen_agenda_id = ag.id
          AND movida.estado != 'cancelada'
      )
    ORDER BY ag.fecha, ag.id
  `, ...parametros);

  for (const ausencia of ausencias) {
    await revertirMovimientoAgenda(db, {
      alumnoId,
      agendaId: ausencia.id,
      tipoOriginal: "ausencia",
      deltaLegacy: -1,
      contextoLegacy: contexto,
      fecha: ausencia.fecha,
    });
    await db.runAsync(
      `DELETE FROM clases
       WHERE alumno_id = ? AND grupo_id = ? AND fecha = ? AND estado = 'ausente'`,
      alumnoId,
      ausencia.grupo_id,
      ausencia.fecha
    );
  }
  return ausencias.length;
}

export async function migrarSaldoInicialPendientes(db: DatabasePendientes) {
  const alumnos = await db.getAllAsync<{
    id: number; pendientes: number;
  }>(`
    SELECT a.id, a.pendientes
    FROM alumnos a
    WHERE a.pendientes > 0
      AND NOT EXISTS (
        SELECT 1 FROM movimientos_pendientes m WHERE m.alumno_id = a.id
      )
    ORDER BY a.id
  `);
  const creadoEn = new Date().toISOString();
  for (const alumno of alumnos) {
    await db.runAsync(
      `INSERT OR IGNORE INTO movimientos_pendientes
       (alumno_id,agenda_id,delta,tipo,clave,revierte_movimiento_id,fecha,creado_en)
       VALUES (?,NULL,?,'saldo_inicial',?,NULL,?,?)`,
      alumno.id,
      alumno.pendientes,
      `saldo_inicial:alumno:${alumno.id}`,
      fechaLocal(),
      creadoEn
    );
  }
}

export async function auditarConsistenciaPendientes(db: DatabasePendientes) {
  return db.getAllAsync<InconsistenciaPendientes>(`
    SELECT a.id AS alumno_id, a.nombre AS alumno_nombre,
      a.pendientes AS pendientes_cache,
      COALESCE(SUM(m.delta), 0) AS saldo_calculado
    FROM alumnos a
    LEFT JOIN movimientos_pendientes m ON m.alumno_id = a.id
    GROUP BY a.id, a.nombre, a.pendientes
    HAVING a.pendientes != COALESCE(SUM(m.delta), 0)
       OR COALESCE(SUM(m.delta), 0) < 0
    ORDER BY a.id
  `);
}

export async function verificarConsistenciaPendientes(db: DatabasePendientes) {
  const inconsistencias = await auditarConsistenciaPendientes(db);
  if (inconsistencias.length) {
    throw new Error(
      `Se detectaron saldos de pendientes inconsistentes para ${inconsistencias.length} alumno(s)`
    );
  }
}
