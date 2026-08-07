import { Alumno, AlumnoInput, Grupo } from "@/models";
import { databasePromise } from "@/database/connection";
import { fechaDentroDe, fechaLocal } from "@/database/dates";
import { generarAgendaHasta } from "@/database/agendaMaintenance";
import { grupoOcurreEnFecha } from "@/lib/grupos";

const SELECT_ALUMNO = `
  SELECT a.*,
    CASE WHEN a.sin_grupo = 1 THEN NULL ELSE g.nombre END AS grupo_nombre,
    CASE WHEN a.sin_grupo = 1 THEN NULL ELSE g.color END AS grupo_color,
    m.nombre AS molde_nombre
  FROM alumnos a
  LEFT JOIN grupos g ON g.id = a.grupo_id
  LEFT JOIN moldes m ON m.id = a.molde_id
`;

export const alumnoRepository = {
  async listar() {
    const db = await databasePromise;
    return db.getAllAsync<Alumno>(`${SELECT_ALUMNO}
      WHERE a.activo = 1 ORDER BY a.nombre COLLATE NOCASE`);
  },

  async listarPendientes() {
    const db = await databasePromise;
    return db.getAllAsync<Alumno>(`${SELECT_ALUMNO}
      WHERE a.activo = 1 AND a.pendientes > 0
      ORDER BY a.nombre COLLATE NOCASE`);
  },

  async crear(data: AlumnoInput) {
    const db = await databasePromise;
    let alumnoId = 0;
    const inicio = data.fecha_inicio || fechaLocal();
    const grupo = await db.getFirstAsync<{ frecuencia: Alumno["frecuencia"] }>(
      "SELECT frecuencia FROM grupos WHERE id = ? AND activo = 1", data.grupo_id
    );
    if (!grupo) throw new Error("El grupo elegido ya no está disponible");
    await db.withTransactionAsync(async () => {
      const result = await db.runAsync(
        "INSERT INTO alumnos (nombre,telefono,frecuencia,grupo_id,molde_id,fecha_inicio) VALUES (?,?,?,?,?,?)",
        data.nombre.trim(), data.telefono?.trim() || null, grupo.frecuencia,
        data.grupo_id, data.molde_id, inicio
      );
      alumnoId = Number(result.lastInsertRowId);
      await generarAgendaHasta(
        alumnoId, data.grupo_id, inicio, fechaDentroDe(370)
      );
    });
    return alumnoId;
  },

  async editar(
    id: number,
    nombre: string,
    telefono: string,
    grupoId: number | null
  ) {
    const db = await databasePromise;
    const anterior = await db.getFirstAsync<Alumno>("SELECT * FROM alumnos WHERE id = ?", id);
    if (!anterior) return;
    const grupoAnterior = anterior.sin_grupo ? null : anterior.grupo_id;
    const cambioAgenda = grupoAnterior !== grupoId;
    const grupoNuevo = grupoId
      ? await db.getFirstAsync<{ frecuencia: Alumno["frecuencia"] }>(
          "SELECT frecuencia FROM grupos WHERE id = ? AND activo = 1", grupoId
        )
      : null;
    if (grupoId && !grupoNuevo) throw new Error("El grupo elegido ya no está disponible");
    const frecuencia = grupoNuevo?.frecuencia || anterior.frecuencia;
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE alumnos SET nombre = ?, telefono = ?, frecuencia = ?,
          grupo_id = COALESCE(?, grupo_id), sin_grupo = ?,
          fecha_inicio = CASE WHEN ? THEN ? ELSE fecha_inicio END WHERE id = ?`,
        nombre.trim(), telefono.trim() || null, frecuencia, grupoId, grupoId ? 0 : 1,
        cambioAgenda ? 1 : 0, fechaLocal(), id
      );
      if (!cambioAgenda) return;
      const ausencias = await db.getFirstAsync<{ total: number }>(
        `SELECT COUNT(*) AS total FROM agenda_alumnos
         WHERE alumno_id = ? AND tipo = 'regular' AND fecha >= ? AND estado = 'ausente'`,
        id, fechaLocal()
      );
      await db.runAsync(
        "UPDATE alumnos SET pendientes = MAX(0, pendientes - ?) WHERE id = ?",
        ausencias?.total || 0, id
      );
      await db.runAsync(
        "DELETE FROM agenda_alumnos WHERE alumno_id = ? AND tipo = 'regular' AND fecha >= ?",
        id, fechaLocal()
      );
      if (grupoId) {
        await generarAgendaHasta(id, grupoId, fechaLocal(), fechaDentroDe(370));
      }
    });
  },

  async eliminar(id: number) {
    const db = await databasePromise;
    await db.withTransactionAsync(async () => {
      await db.runAsync("UPDATE alumnos SET activo = 0 WHERE id = ?", id);
      await db.runAsync(
        "UPDATE agenda_alumnos SET estado = 'cancelada' WHERE alumno_id = ? AND estado = 'programada'",
        id
      );
    });
  },

  async actualizarPendientes(id: number, cantidad: number) {
    const db = await databasePromise;
    const total = Math.max(0, Math.floor(cantidad));
    await db.runAsync(
      "UPDATE alumnos SET pendientes = ? WHERE id = ? AND activo = 1",
      total, id
    );
  },

  async fijarEnGrupo(id: number, grupoId: number, fechaInicio: string) {
    const db = await databasePromise;
    const alumno = await db.getFirstAsync<Alumno>(
      "SELECT * FROM alumnos WHERE id = ? AND activo = 1", id
    );
    const grupo = await db.getFirstAsync<Grupo>(
      "SELECT * FROM grupos WHERE id = ? AND activo = 1", grupoId
    );
    if (!alumno) throw new Error("La persona ya no está disponible");
    if (!grupo) throw new Error("El grupo elegido ya no está disponible");

    const yaPertenece = !alumno.sin_grupo && alumno.grupo_id === grupoId;
    const desde = fechaLocal();
    const grupoAnteriorId = alumno.sin_grupo ? null : alumno.grupo_id;
    await db.withTransactionAsync(async () => {
      if (!yaPertenece && grupoAnteriorId) {
        const ausencias = await db.getFirstAsync<{ total: number }>(
          `SELECT COUNT(*) AS total FROM agenda_alumnos
           WHERE alumno_id = ? AND grupo_id = ? AND tipo = 'regular'
             AND fecha >= ? AND estado = 'ausente'`,
          id, grupoAnteriorId, desde
        );
        await db.runAsync(
          "UPDATE alumnos SET pendientes = MAX(0, pendientes - ?) WHERE id = ?",
          ausencias?.total || 0, id
        );
        await db.runAsync(
          `DELETE FROM clases WHERE alumno_id = ? AND grupo_id = ?
           AND fecha >= ? AND estado = 'ausente'`,
          id, grupoAnteriorId, desde
        );
      }

      if (!yaPertenece) {
        await db.runAsync(
          "DELETE FROM agenda_alumnos WHERE alumno_id = ? AND tipo = 'regular' AND fecha >= ?",
          id, desde
        );
      }
      await db.runAsync(
        `UPDATE alumnos SET grupo_id = ?, sin_grupo = 0, frecuencia = ?, fecha_inicio = ?
         WHERE id = ?`,
        grupoId, grupo.frecuencia, fechaInicio, id
      );
      await generarAgendaHasta(id, grupoId, fechaInicio, fechaDentroDe(370));

      const tipo = grupoOcurreEnFecha(grupo, fechaInicio) ? "regular" : "manual";
      await db.runAsync(
        `INSERT INTO agenda_alumnos (alumno_id,grupo_id,fecha,tipo,estado)
         VALUES (?,?,?,?, 'programada')
         ON CONFLICT(alumno_id,fecha) DO UPDATE SET
           grupo_id = excluded.grupo_id, tipo = excluded.tipo, estado = 'programada',
           cubre_agenda_id = NULL, origen_agenda_id = NULL`,
        id, grupoId, fechaInicio, tipo
      );
    });
  },
};

export const listarAlumnos = () => alumnoRepository.listar();
export const listarPendientes = () => alumnoRepository.listarPendientes();
export const crearAlumno = (data: AlumnoInput) => alumnoRepository.crear(data);
export const editarAlumno = (
  id: number, nombre: string, telefono: string, grupoId: number | null
) => alumnoRepository.editar(id, nombre, telefono, grupoId);
export const eliminarAlumno = (id: number) => alumnoRepository.eliminar(id);
export const actualizarPendientesAlumno = (id: number, cantidad: number) =>
  alumnoRepository.actualizarPendientes(id, cantidad);
export const fijarAlumnoEnGrupo = (id: number, grupoId: number, fechaInicio: string) =>
  alumnoRepository.fijarEnGrupo(id, grupoId, fechaInicio);
