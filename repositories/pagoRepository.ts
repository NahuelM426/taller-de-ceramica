import { databasePromise } from "@/database/connection";
import { registrarMovimientoPendiente } from "@/database/pendientes";
import { mesPagoActual } from "@/lib/pagos";
import type { CantidadClasesPagadas, EstadoPagoAlumno } from "@/models";

function validarMes(mes: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    throw new Error("El mes del pago no es válido");
  }
}

export const pagoRepository = {
  async listarMes(mes: string) {
    validarMes(mes);
    const db = await databasePromise;
    return db.getAllAsync<EstadoPagoAlumno>(`
      SELECT
        a.id AS alumno_id,
        ? AS mes,
        COALESCE(p.pagado, 0) AS pagado,
        COALESCE(p.clases_pagadas,
          CASE WHEN a.frecuencia = 'semanal' THEN 4 ELSE 2 END
        ) AS clases_pagadas,
        COALESCE(p.clases_extra, 0) AS clases_extra,
        COALESCE(p.clases_extra_usadas, 0) AS clases_extra_usadas,
        COALESCE((
          SELECT SUM(
            CASE WHEN credito.pagado = 1 THEN
              MAX(credito.clases_extra - credito.clases_extra_usadas, 0)
            ELSE 0 END
          )
          FROM pagos_alumnos credito
          WHERE credito.alumno_id = a.id AND credito.mes <= ?
        ), 0) AS clases_extra_disponibles,
        COALESCE((
          SELECT COUNT(*)
          FROM agenda_alumnos deuda
          WHERE deuda.alumno_id = a.id
            AND deuda.extra_adeudada = 1
            AND deuda.estado = 'programada'
            AND substr(deuda.fecha, 1, 7) <= ?
        ), 0) AS clases_extra_adeudadas,
        p.fecha_pago,
        COALESCE(p.actualizado_en, '') AS actualizado_en,
        a.nombre AS alumno_nombre,
        CASE WHEN a.sin_grupo = 1 THEN NULL ELSE g.nombre END AS grupo_nombre,
        CASE WHEN a.sin_grupo = 1 THEN NULL ELSE g.color END AS grupo_color
      FROM alumnos a
      LEFT JOIN grupos g ON g.id = a.grupo_id
      LEFT JOIN pagos_alumnos p ON p.alumno_id = a.id AND p.mes = ?
      WHERE a.activo = 1
      ORDER BY a.nombre COLLATE NOCASE
    `, mes, mes, mes, mes);
  },

  async guardar(
    alumnoId: number,
    mes: string,
    pagado: boolean,
    clasesPagadas: CantidadClasesPagadas,
    clasesExtra: number,
    cobrarExtrasAdeudadas = false
  ) {
    validarMes(mes);
    if (clasesPagadas !== 2 && clasesPagadas !== 4) {
      throw new Error("La cuota debe corresponder a 2 o 4 clases");
    }
    const extras = Math.max(0, Math.floor(clasesExtra));
    const ahora = new Date().toISOString();
    const db = await databasePromise;
    const alumno = await db.getFirstAsync<{ id: number }>(
      "SELECT id FROM alumnos WHERE id = ? AND activo = 1",
      alumnoId
    );
    if (!alumno) throw new Error("La persona ya no está disponible");
    await db.withTransactionAsync(async () => {
      const anterior = await db.getFirstAsync<{
        pagado: number; clases_extra: number; clases_extra_usadas: number;
      }>(
        `SELECT pagado,clases_extra,clases_extra_usadas
         FROM pagos_alumnos WHERE alumno_id = ? AND mes = ?`,
        alumnoId,
        mes
      );
      if (extras < (anterior?.clases_extra_usadas || 0)) {
        throw new Error(
          `No podés dejar menos de ${anterior?.clases_extra_usadas} clases extra porque ya fueron utilizadas`
        );
      }
      if (!pagado && (anterior?.clases_extra_usadas || 0) > 0) {
        throw new Error("No podés marcar como no pagado un mes que ya tiene clases extra utilizadas");
      }
      await db.runAsync(
        `INSERT INTO pagos_alumnos
          (alumno_id,mes,pagado,clases_pagadas,clases_extra,
           clases_extra_usadas,fecha_pago,actualizado_en)
         VALUES (?,?,?,?,?,0,?,?)
         ON CONFLICT(alumno_id,mes) DO UPDATE SET
           pagado = excluded.pagado,
           clases_pagadas = excluded.clases_pagadas,
           clases_extra = excluded.clases_extra,
           fecha_pago = excluded.fecha_pago,
           actualizado_en = excluded.actualizado_en`,
        alumnoId,
        mes,
        pagado ? 1 : 0,
        clasesPagadas,
        extras,
        pagado ? ahora : null,
        ahora
      );

      const extrasPagadasAntes = anterior?.pagado === 1
        ? anterior.clases_extra
        : 0;
      const extrasNuevas = pagado ? Math.max(extras - extrasPagadasAntes, 0) : 0;
      if (extrasNuevas > 0) {
        const deudas = await db.getAllAsync<{ id: number }>(
          `SELECT id FROM agenda_alumnos
           WHERE alumno_id = ? AND extra_adeudada = 1
             AND estado = 'programada' AND substr(fecha, 1, 7) <= ?
           ORDER BY fecha, id
           LIMIT ?`,
          alumnoId,
          mes,
          extrasNuevas
        );
        for (const deuda of deudas) {
          await db.runAsync(
            `UPDATE agenda_alumnos
             SET extra_adeudada = 0, pago_extra_mes = ?
             WHERE id = ? AND extra_adeudada = 1`,
            mes,
            deuda.id
          );
        }
        if (deudas.length) {
          await db.runAsync(
            `UPDATE pagos_alumnos
             SET clases_extra_usadas = clases_extra_usadas + ?, actualizado_en = ?
             WHERE alumno_id = ? AND mes = ?`,
            deudas.length,
            ahora,
            alumnoId,
            mes
          );
        }
      }

      if (cobrarExtrasAdeudadas) {
        await db.runAsync(
          `UPDATE agenda_alumnos
           SET extra_adeudada = 0, pago_extra_mes = ?
           WHERE alumno_id = ? AND extra_adeudada = 1
             AND estado = 'programada' AND substr(fecha, 1, 7) <= ?`,
          mes,
          alumnoId,
          mes
        );
      }
    });
  },

  async cobrarExtrasAdeudadas(alumnoId: number, mes: string) {
    validarMes(mes);
    const db = await databasePromise;
    const alumno = await db.getFirstAsync<{ id: number }>(
      "SELECT id FROM alumnos WHERE id = ? AND activo = 1",
      alumnoId
    );
    if (!alumno) throw new Error("La persona ya no está disponible");

    let cobradas = 0;
    await db.withTransactionAsync(async () => {
      const resultado = await db.runAsync(
        `UPDATE agenda_alumnos
         SET extra_adeudada = 0, pago_extra_mes = ?
         WHERE alumno_id = ? AND extra_adeudada = 1
           AND estado = 'programada' AND substr(fecha, 1, 7) <= ?`,
        mes,
        alumnoId,
        mes
      );
      cobradas = resultado.changes;
    });
    return cobradas;
  },

  async cerrarMesesVencidos(fechaReferencia = new Date()) {
    const mesActual = mesPagoActual(fechaReferencia);
    const db = await databasePromise;
    const pagos = await db.getAllAsync<{
      alumno_id: number; mes: string; clases_pagadas: number;
    }>(
      `SELECT alumno_id,mes,clases_pagadas
       FROM pagos_alumnos
       WHERE pagado = 1 AND mes < ?
       ORDER BY mes, alumno_id`,
      mesActual
    );
    let pendientesGenerados = 0;
    await db.withTransactionAsync(async () => {
      for (const pago of pagos) {
        const clave = `cuota_no_usada:alumno:${pago.alumno_id}:mes:${pago.mes}`;
        const yaCerrado = await db.getFirstAsync<{ id: number }>(
          "SELECT id FROM movimientos_pendientes WHERE clave = ?",
          clave
        );
        if (yaCerrado) continue;
        const cubiertas = await db.getFirstAsync<{ total: number }>(
          `SELECT COUNT(*) AS total
           FROM agenda_alumnos ag
           WHERE ag.alumno_id = ? AND ag.estado != 'cancelada'
             AND (
               (ag.tipo = 'regular' AND substr(ag.fecha, 1, 7) = ?)
               OR
               (ag.tipo = 'manual' AND ag.feriado_tipo_origen = 'regular'
                 AND substr(COALESCE(ag.feriado_origen, ag.fecha), 1, 7) = ?)
             )`,
          pago.alumno_id,
          pago.mes,
          pago.mes
        );
        const faltantes = Math.max(pago.clases_pagadas - (cubiertas?.total || 0), 0);
        if (!faltantes) continue;
        await registrarMovimientoPendiente(db, {
          alumnoId: pago.alumno_id,
          delta: faltantes,
          tipo: "ajuste_manual",
          clave,
          fecha: `${pago.mes}-28`,
        });
        pendientesGenerados += faltantes;
      }
    });
    return pendientesGenerados;
  },
};

export const listarPagosMes = (mes: string) => pagoRepository.listarMes(mes);
export const guardarPagoAlumno = (
  alumnoId: number,
  mes: string,
  pagado: boolean,
  clasesPagadas: CantidadClasesPagadas,
  clasesExtra: number,
  cobrarExtrasAdeudadas = false
) => pagoRepository.guardar(
  alumnoId,
  mes,
  pagado,
  clasesPagadas,
  clasesExtra,
  cobrarExtrasAdeudadas
);
export const cobrarExtrasAlumno = (alumnoId: number, mes: string) =>
  pagoRepository.cobrarExtrasAdeudadas(alumnoId, mes);
export const cerrarMesesPagadosVencidos = (fechaReferencia?: Date) =>
  pagoRepository.cerrarMesesVencidos(fechaReferencia);
