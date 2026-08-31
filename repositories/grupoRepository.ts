import { Grupo, GrupoInput } from "@/models";
import { rearmarAgendaRegularGrupo } from "@/database/agendaMaintenance";
import { databasePromise } from "@/database/connection";
import { fechaLocal } from "@/database/dates";
import {
  cancelarPendientesPorAusenciasFuturas,
  revertirMovimientoAgenda,
} from "@/database/pendientes";
import { reajustarGrupoDesdeFechaInicio } from "@/repositories/reajusteRepository";

export const grupoRepository = {
  async listar() {
    const db = await databasePromise;
    return db.getAllAsync<Grupo>("SELECT * FROM grupos WHERE activo = 1 ORDER BY dia, hora");
  },

  async crear(data: GrupoInput) {
    const db = await databasePromise;
    return db.runAsync(
      `INSERT INTO grupos
       (nombre,dia,hora,capacidad,color,notificacion,minutos_antes,frecuencia,fecha_inicio)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      data.nombre.trim(), data.dia, data.hora, data.capacidad, data.color,
      data.notificacion, data.minutos_antes, data.frecuencia, data.fecha_inicio
    );
  },

  async editar(id: number, data: GrupoInput) {
    const db = await databasePromise;
    const anterior = await db.getFirstAsync<Grupo>("SELECT * FROM grupos WHERE id = ? AND activo = 1", id);
    let fechaInicioFinal = data.fecha_inicio;
    let fechaReajustada = false;
    if (
      anterior &&
      data.fecha_inicio &&
      anterior.fecha_inicio !== data.fecha_inicio &&
      anterior.dia === data.dia &&
      anterior.frecuencia === "quincenal" &&
      data.frecuencia === "quincenal"
    ) {
      const resultado = await reajustarGrupoDesdeFechaInicio(id, data.fecha_inicio);
      fechaInicioFinal = resultado.fechaDestino;
      fechaReajustada = true;
    }
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE grupos SET nombre = ?, dia = ?, hora = ?, capacidad = ?, color = ?,
          notificacion = ?, minutos_antes = ?, frecuencia = ?, fecha_inicio = ?
          WHERE id = ? AND activo = 1`,
        data.nombre.trim(), data.dia, data.hora, data.capacidad, data.color,
        data.notificacion, data.minutos_antes, data.frecuencia, fechaInicioFinal, id
      );
      if (anterior && (
        anterior.dia !== data.dia ||
        anterior.frecuencia !== data.frecuencia ||
        (!fechaReajustada && anterior.fecha_inicio !== data.fecha_inicio)
      )) {
        await rearmarAgendaRegularGrupo(db, id);
      }
    });
  },

  async eliminar(id: number) {
    const db = await databasePromise;
    const desde = fechaLocal();
    await db.withTransactionAsync(async () => {
      const alumnos = await db.getAllAsync<{ id: number }>(`
        SELECT id FROM alumnos WHERE grupo_id = ? AND activo = 1
      `, id);
      for (const alumno of alumnos) {
        await cancelarPendientesPorAusenciasFuturas(
          db,
          alumno.id,
          desde,
          "eliminacion_grupo",
          id
        );
      }
      const recuperaciones = await db.getAllAsync<{
        id: number; alumno_id: number; fecha: string;
      }>(`
        SELECT id, alumno_id, fecha
        FROM agenda_alumnos
        WHERE grupo_id = ? AND fecha >= ?
          AND tipo = 'recuperacion' AND estado = 'programada'
        ORDER BY id
      `, id, desde);
      for (const recuperacion of recuperaciones) {
        await revertirMovimientoAgenda(db, {
          alumnoId: recuperacion.alumno_id,
          agendaId: recuperacion.id,
          tipoOriginal: "recuperacion",
          deltaLegacy: 1,
          contextoLegacy: "eliminacion_grupo",
          fecha: recuperacion.fecha,
        });
      }
      await db.runAsync(
        "DELETE FROM clases WHERE grupo_id = ? AND fecha >= ? AND estado = 'recuperacion'",
        id, desde
      );
      const extras = await db.getAllAsync<{
        alumno_id: number; mes: string; cantidad: number;
      }>(
        `SELECT alumno_id, pago_extra_mes AS mes, COUNT(*) AS cantidad
         FROM agenda_alumnos
         WHERE grupo_id = ? AND fecha >= ? AND estado = 'programada'
           AND pago_extra_mes IS NOT NULL
         GROUP BY alumno_id, pago_extra_mes`,
        id,
        desde
      );
      for (const extra of extras) {
        await db.runAsync(
          `UPDATE pagos_alumnos
           SET clases_extra_usadas = MAX(clases_extra_usadas - ?, 0), actualizado_en = ?
           WHERE alumno_id = ? AND mes = ?`,
          extra.cantidad,
          new Date().toISOString(),
          extra.alumno_id,
          extra.mes
        );
      }
      await db.runAsync(
        `UPDATE agenda_alumnos SET estado = 'cancelada'
         WHERE grupo_id = ? AND fecha >= ? AND estado != 'cancelada'`,
        id, desde
      );
      await db.runAsync(
        "UPDATE alumnos SET sin_grupo = 1 WHERE grupo_id = ? AND activo = 1",
        id
      );
      await db.runAsync("DELETE FROM feriados WHERE grupo_id = ?", id);
      await db.runAsync(
        "UPDATE grupos SET activo = 0, notificacion = 0 WHERE id = ?",
        id
      );
    });
  },
};

export const listarGrupos = () => grupoRepository.listar();
export const crearGrupo = (data: GrupoInput) => grupoRepository.crear(data);
export const editarGrupo = (id: number, data: GrupoInput) => grupoRepository.editar(id, data);
export const eliminarGrupo = (id: number) => grupoRepository.eliminar(id);
