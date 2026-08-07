import { Grupo, GrupoInput } from "@/models";
import { rearmarAgendaRegularGrupo } from "@/database/agendaMaintenance";
import { databasePromise } from "@/database/connection";
import { fechaLocal } from "@/database/dates";

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
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE grupos SET nombre = ?, dia = ?, hora = ?, capacidad = ?, color = ?,
          notificacion = ?, minutos_antes = ?, frecuencia = ?, fecha_inicio = ?
          WHERE id = ? AND activo = 1`,
        data.nombre.trim(), data.dia, data.hora, data.capacidad, data.color,
        data.notificacion, data.minutos_antes, data.frecuencia, data.fecha_inicio, id
      );
      if (anterior && (
        anterior.dia !== data.dia ||
        anterior.frecuencia !== data.frecuencia ||
        anterior.fecha_inicio !== data.fecha_inicio
      )) {
        await rearmarAgendaRegularGrupo(db, id);
      }
    });
  },

  async eliminar(id: number) {
    const db = await databasePromise;
    const desde = fechaLocal();
    await db.withTransactionAsync(async () => {
      const recuperaciones = await db.getAllAsync<{ alumno_id: number; cantidad: number }>(`
        SELECT alumno_id, COUNT(*) AS cantidad
        FROM agenda_alumnos
        WHERE grupo_id = ? AND fecha >= ?
          AND tipo = 'recuperacion' AND estado = 'programada'
        GROUP BY alumno_id
      `, id, desde);
      for (const recuperacion of recuperaciones) {
        await db.runAsync(
          "UPDATE alumnos SET pendientes = pendientes + ? WHERE id = ?",
          recuperacion.cantidad, recuperacion.alumno_id
        );
      }
      await db.runAsync(
        "DELETE FROM clases WHERE grupo_id = ? AND fecha >= ? AND estado = 'recuperacion'",
        id, desde
      );
      await db.runAsync(
        `UPDATE agenda_alumnos SET estado = 'cancelada'
         WHERE grupo_id = ? AND fecha >= ? AND estado != 'cancelada'`,
        id, desde
      );
      await db.runAsync(
        "UPDATE alumnos SET sin_grupo = 1 WHERE grupo_id = ? AND activo = 1",
        id
      );
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
