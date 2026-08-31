import { AgendaAlumno, Feriado, TipoAgenda, TipoMovimientoClase } from "@/models";
import { databasePromise } from "@/database/connection";
import { revertirMovimientoAgenda } from "@/database/pendientes";
import { motivoMovimientoClase } from "@/lib/movimientosClase";
import { moverAgendaDelDiaEnDb } from "./agendaRepository";

type TipoMovimientoAislado = Exclude<TipoMovimientoClase, "reajuste">;

export const feriadoRepository = {
  async listar(inicio: string, fin: string) {
    const db = await databasePromise;
    return db.getAllAsync<Feriado>(
      `SELECT
         f.fecha,
         CASE
           WHEN f.grupo_id = 0 AND f.tipo = 'reajuste' THEN (
             SELECT r.grupo_id
             FROM reajustes_grupo r
             JOIN grupos grupo_reajustado ON grupo_reajustado.id = r.grupo_id
             WHERE r.fecha_origen = f.fecha
               AND r.deshecho_en IS NULL
               AND grupo_reajustado.activo = 1
             ORDER BY r.id DESC
             LIMIT 1
           )
           ELSE f.grupo_id
         END AS grupo_id,
         f.motivo,
         f.fecha_recuperacion,
         f.tipo
       FROM feriados f
       LEFT JOIN grupos g ON g.id = f.grupo_id
       WHERE (f.fecha BETWEEN ? AND ? OR f.fecha_recuperacion BETWEEN ? AND ?)
         AND (
           (f.grupo_id = 0 AND f.tipo != 'reajuste')
           OR (f.grupo_id != 0 AND g.activo = 1)
           OR (
             f.grupo_id = 0 AND f.tipo = 'reajuste'
             AND EXISTS (
               SELECT 1
               FROM reajustes_grupo r
               JOIN grupos grupo_reajustado ON grupo_reajustado.id = r.grupo_id
               WHERE r.fecha_origen = f.fecha
                 AND r.deshecho_en IS NULL
                 AND grupo_reajustado.activo = 1
             )
           )
         )
       ORDER BY f.fecha`,
      inicio,
      fin,
      inicio,
      fin
    );
  },
  async guardar(
    fecha: string,
    grupoId: number,
    motivo: string,
    fechaRecuperacion: string,
    tipo: TipoMovimientoClase
  ) {
    const db = await databasePromise;
    return db.runAsync(
      `INSERT INTO feriados (fecha,grupo_id,motivo,fecha_recuperacion,tipo) VALUES (?,?,?,?,?)
       ON CONFLICT(fecha,grupo_id) DO UPDATE SET
         motivo = excluded.motivo,
         fecha_recuperacion = excluded.fecha_recuperacion,
         tipo = excluded.tipo`,
      fecha, grupoId, motivo.trim() || "Clase movida", fechaRecuperacion, tipo
    );
  },
  async mover(
    fecha: string,
    fechaRecuperacion: string,
    tipo: TipoMovimientoAislado,
    grupoId: number
  ) {
    const db = await databasePromise;
    let movidas = 0;
    await db.withTransactionAsync(async () => {
      movidas = await moverAgendaDelDiaEnDb(db, fecha, fechaRecuperacion, tipo, grupoId);
      if (!movidas) throw new Error("Este grupo no tiene personas programadas para mover");
      await db.runAsync(
        `INSERT INTO feriados (fecha,grupo_id,motivo,fecha_recuperacion,tipo) VALUES (?,?,?,?,?)
         ON CONFLICT(fecha,grupo_id) DO UPDATE SET
           motivo = excluded.motivo,
           fecha_recuperacion = excluded.fecha_recuperacion,
           tipo = excluded.tipo`,
        fecha, grupoId, motivoMovimientoClase(tipo), fechaRecuperacion, tipo
      );
    });
    return movidas;
  },
  async quitar(fecha: string, grupoId: number) {
    const db = await databasePromise;
    let movidas: Array<AgendaAlumno & { alumno_nombre: string }> = [];
    await db.withTransactionAsync(async () => {
      movidas = await db.getAllAsync<AgendaAlumno & { alumno_nombre: string }>(
        `SELECT ag.*, a.nombre AS alumno_nombre
         FROM agenda_alumnos ag
         JOIN alumnos a ON a.id = ag.alumno_id
         WHERE ag.feriado_origen = ?
           AND (? = 0 OR ag.grupo_id = ?)
         ORDER BY ag.id`,
        fecha, grupoId, grupoId
      );
      for (const movida of movidas) {
        const ausencia = await db.getFirstAsync<{ id: number }>(
          `SELECT id FROM clases
           WHERE alumno_id = ? AND grupo_id = ? AND fecha = ? AND estado = 'ausente'
           ORDER BY id DESC LIMIT 1`,
          movida.alumno_id, movida.grupo_id, movida.fecha
        );
        if (ausencia) {
          await db.runAsync(
            `DELETE FROM clases
             WHERE alumno_id = ? AND grupo_id = ? AND fecha = ? AND estado = 'ausente'`,
            movida.alumno_id, movida.grupo_id, movida.fecha
          );
          await revertirMovimientoAgenda(db, {
            alumnoId: movida.alumno_id,
            agendaId: movida.id,
            tipoOriginal: "ausencia",
            deltaLegacy: -1,
            contextoLegacy: "reversion_feriado",
            fecha: movida.fecha,
          });
        }

        let tipoOriginal: TipoAgenda = movida.feriado_tipo_origen || "manual";
        const marcador = await db.getFirstAsync<{ id: number }>(
          `SELECT id FROM agenda_alumnos
           WHERE alumno_id = ? AND fecha = ? AND id != ?
             AND tipo = 'regular' AND estado = 'cancelada'
             AND origen_agenda_id = ?`,
          movida.alumno_id, fecha, movida.id, movida.id
        );
        if (marcador) {
          await db.runAsync("DELETE FROM agenda_alumnos WHERE id = ?", marcador.id);
        }
        const conflicto = await db.getFirstAsync<{
          id: number; tipo: TipoAgenda; estado: AgendaAlumno["estado"];
        }>(
          `SELECT id, tipo, estado FROM agenda_alumnos
           WHERE alumno_id = ? AND fecha = ? AND id != ?`,
          movida.alumno_id, fecha, movida.id
        );
        if (conflicto) {
          const esMarcadorLegacy = tipoOriginal === "regular" &&
            conflicto.tipo === "regular" && conflicto.estado === "cancelada";
          if (!esMarcadorLegacy) {
            throw new Error(
              `${movida.alumno_nombre} ya tiene otra clase cargada en la fecha original`
            );
          }
          if (!movida.feriado_tipo_origen) tipoOriginal = conflicto.tipo;
          await db.runAsync("DELETE FROM agenda_alumnos WHERE id = ?", conflicto.id);
        }
        await db.runAsync(
          `UPDATE agenda_alumnos
           SET fecha = ?, tipo = ?, estado = 'programada',
             feriado_origen = NULL, feriado_tipo_origen = NULL,
             motivo_movimiento = NULL
           WHERE id = ?`,
          fecha, tipoOriginal, movida.id
        );
      }
      await db.runAsync(
        "DELETE FROM feriados WHERE fecha = ? AND grupo_id = ?",
        fecha, grupoId
      );
    });
    return movidas.length;
  },
};

export const listarFeriados = (inicio: string, fin: string) => feriadoRepository.listar(inicio, fin);
export const guardarFeriado = (
  fecha: string,
  grupoId: number,
  motivo: string,
  fechaRecuperacion: string,
  tipo: TipoMovimientoClase
) => feriadoRepository.guardar(fecha, grupoId, motivo, fechaRecuperacion, tipo);
export const moverClaseCompleta = (
  fecha: string,
  fechaRecuperacion: string,
  tipo: TipoMovimientoAislado,
  grupoId: number
) => feriadoRepository.mover(fecha, fechaRecuperacion, tipo, grupoId);
export const quitarFeriado = (fecha: string, grupoId: number) =>
  feriadoRepository.quitar(fecha, grupoId);
