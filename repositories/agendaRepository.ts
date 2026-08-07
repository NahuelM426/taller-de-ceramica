import { AgendaAlumno, Grupo, TipoMovimientoClase } from "@/models";
import { buscarAusenciaSinCubrir } from "@/database/agendaMaintenance";
import { databasePromise } from "@/database/connection";

const SELECT_AGENDA = `
  SELECT ag.*, a.nombre AS alumno_nombre,
    CASE WHEN a.sin_grupo = 1 THEN NULL ELSE a.grupo_id END AS alumno_grupo_id,
    CASE WHEN a.sin_grupo = 1 THEN NULL ELSE gh.nombre END AS alumno_grupo_nombre,
    g.nombre AS grupo_nombre,
    g.color AS grupo_color, g.hora, mo.nombre AS modelo_nombre
  FROM agenda_alumnos ag
  JOIN alumnos a ON a.id = ag.alumno_id
  JOIN grupos g ON g.id = ag.grupo_id
  JOIN grupos gh ON gh.id = a.grupo_id
  LEFT JOIN modelos mo ON mo.id = ag.modelo_id
`;

export const agendaRepository = {
  async listarEntre(inicio: string, fin: string) {
    const db = await databasePromise;
    return db.getAllAsync<AgendaAlumno>(`${SELECT_AGENDA}
      WHERE ag.fecha BETWEEN ? AND ? AND ag.estado != 'cancelada'
      ORDER BY ag.fecha, g.hora, a.nombre COLLATE NOCASE`, inicio, fin);
  },

  async listarDia(fecha: string) {
    const db = await databasePromise;
    return db.getAllAsync<AgendaAlumno>(`${SELECT_AGENDA}
      WHERE ag.fecha = ? AND ag.estado != 'cancelada'
      ORDER BY g.hora, a.nombre COLLATE NOCASE`, fecha);
  },

  async registrarAusencia(alumnoId: number, grupoId: number, fecha: string) {
    const db = await databasePromise;
    await db.withTransactionAsync(async () => {
      const agenda = await db.getFirstAsync<{ estado: string }>(
        "SELECT estado FROM agenda_alumnos WHERE alumno_id = ? AND grupo_id = ? AND fecha = ?",
        alumnoId, grupoId, fecha
      );
      if (!agenda || agenda.estado === "ausente") return;
      await db.runAsync(
        "INSERT INTO clases (alumno_id,grupo_id,fecha,estado) VALUES (?,?,?,'ausente')",
        alumnoId, grupoId, fecha
      );
      await db.runAsync("UPDATE alumnos SET pendientes = pendientes + 1 WHERE id = ?", alumnoId);
      await db.runAsync(
        "UPDATE agenda_alumnos SET estado = 'ausente' WHERE alumno_id = ? AND fecha = ?",
        alumnoId, fecha
      );
    });
  },

  async revertirAusencia(alumnoId: number, grupoId: number, fecha: string) {
    const db = await databasePromise;
    await db.withTransactionAsync(async () => {
      const ausencia = await db.getFirstAsync<{ id: number }>(
        `SELECT id FROM clases WHERE alumno_id = ? AND grupo_id = ?
         AND fecha = ? AND estado = 'ausente' ORDER BY id DESC LIMIT 1`,
        alumnoId, grupoId, fecha
      );
      await db.runAsync(
        `UPDATE agenda_alumnos SET estado = 'programada'
         WHERE alumno_id = ? AND grupo_id = ? AND fecha = ? AND estado = 'ausente'`,
        alumnoId, grupoId, fecha
      );
      if (ausencia) {
        await db.runAsync(
          "UPDATE alumnos SET pendientes = MAX(0, pendientes - 1) WHERE id = ?", alumnoId
        );
        await db.runAsync("DELETE FROM clases WHERE id = ?", ausencia.id);
      }
    });
  },

  async asignarRecuperacion(alumnoId: number, grupoId: number, fecha: string) {
    const db = await databasePromise;
    await db.withTransactionAsync(async () => {
      const alumno = await db.getFirstAsync<{ pendientes: number }>(
        "SELECT pendientes FROM alumnos WHERE id = ? AND activo = 1", alumnoId
      );
      if (!alumno?.pendientes) throw new Error("El alumno no tiene clases pendientes");
      const ausenciaId = await buscarAusenciaSinCubrir(db, grupoId, fecha);
      await db.runAsync(
        "INSERT INTO clases (alumno_id,grupo_id,fecha,estado) VALUES (?,?,?,'recuperacion')",
        alumnoId, grupoId, fecha
      );
      await db.runAsync(
        `INSERT INTO agenda_alumnos
         (alumno_id,grupo_id,fecha,tipo,estado,cubre_agenda_id,origen_agenda_id)
         VALUES (?,?,?,'recuperacion','programada',?,NULL)
         ON CONFLICT(alumno_id,fecha) DO UPDATE SET
           grupo_id = excluded.grupo_id, tipo = 'recuperacion', estado = 'programada',
           cubre_agenda_id = excluded.cubre_agenda_id, origen_agenda_id = NULL`,
        alumnoId, grupoId, fecha, ausenciaId
      );
      await db.runAsync(
        "UPDATE alumnos SET pendientes = MAX(0, pendientes - 1) WHERE id = ?", alumnoId
      );
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
           origen_agenda_id = excluded.origen_agenda_id`,
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
    motivo: TipoMovimientoClase
  ) {
    const db = await databasePromise;
    const items = await db.getAllAsync<AgendaAlumno>(
      "SELECT * FROM agenda_alumnos WHERE fecha = ? AND estado = 'programada'", fechaOrigen
    );
    await db.withTransactionAsync(async () => {
      for (const item of items) {
        const conflicto = await db.getFirstAsync<{ id: number }>(
          "SELECT id FROM agenda_alumnos WHERE alumno_id = ? AND fecha = ?",
          item.alumno_id, fechaDestino
        );
        if (conflicto) continue;
        await db.runAsync(
          `UPDATE agenda_alumnos
           SET fecha = ?, tipo = 'manual', feriado_origen = ?,
             feriado_tipo_origen = ?, motivo_movimiento = ? WHERE id = ?`,
          fechaDestino, fechaOrigen, item.tipo, motivo, item.id
        );
        if (item.tipo === "regular") {
          await db.runAsync(
            `INSERT OR IGNORE INTO agenda_alumnos
             (alumno_id,grupo_id,fecha,tipo,estado) VALUES (?,?,?,'regular','cancelada')`,
            item.alumno_id, item.grupo_id, fechaOrigen
          );
        }
      }
    });
  },

  async agregarManual(alumnoId: number, grupoId: number, fecha: string) {
    const db = await databasePromise;
    return db.runAsync(
      `INSERT INTO agenda_alumnos (alumno_id,grupo_id,fecha,tipo,estado)
       VALUES (?,?,?,'manual','programada')
       ON CONFLICT(alumno_id,fecha) DO UPDATE SET
         grupo_id = excluded.grupo_id, tipo = 'manual', estado = 'programada'`,
      alumnoId, grupoId, fecha
    );
  },

  async quitar(agendaId: number) {
    const db = await databasePromise;
    const item = await db.getFirstAsync<AgendaAlumno>(
      "SELECT * FROM agenda_alumnos WHERE id = ?", agendaId
    );
    if (!item || item.estado === "cancelada") return;
    await db.withTransactionAsync(async () => {
      await db.runAsync("UPDATE agenda_alumnos SET estado = 'cancelada' WHERE id = ?", agendaId);
      if (item.tipo === "recuperacion" && item.estado === "programada") {
        await db.runAsync("UPDATE alumnos SET pendientes = pendientes + 1 WHERE id = ?", item.alumno_id);
        await db.runAsync(
          `DELETE FROM clases WHERE id = (
            SELECT id FROM clases WHERE alumno_id = ? AND grupo_id = ?
              AND fecha = ? AND estado = 'recuperacion'
            ORDER BY id DESC LIMIT 1
          )`, item.alumno_id, item.grupo_id, item.fecha
        );
      }
      if (item.tipo === "manual" && item.origen_agenda_id) {
        await db.runAsync(
          "UPDATE agenda_alumnos SET estado = 'programada' WHERE id = ? AND estado = 'ausente'",
          item.origen_agenda_id
        );
      }
    });
  },

  async asignarModelo(agendaId: number, modeloId: number | null, necesidades: string) {
    const db = await databasePromise;
    return db.runAsync(
      "UPDATE agenda_alumnos SET modelo_id = ?, necesidades = ? WHERE id = ?",
      modeloId, necesidades.trim() || null, agendaId
    );
  },
};

export const agendaDelMes = (inicio: string, fin: string) => agendaRepository.listarEntre(inicio, fin);
export const agendaDelDia = (fecha: string) => agendaRepository.listarDia(fecha);
export const registrarAusencia = (alumnoId: number, grupoId: number, fecha: string) => agendaRepository.registrarAusencia(alumnoId, grupoId, fecha);
export const revertirAusencia = (alumnoId: number, grupoId: number, fecha: string) => agendaRepository.revertirAusencia(alumnoId, grupoId, fecha);
export const asignarRecuperacion = (alumnoId: number, grupoId: number, fecha: string) => agendaRepository.asignarRecuperacion(alumnoId, grupoId, fecha);
export const cambiarClaseParaCubrir = (alumnoId: number, agendaId: number, grupoId: number, fecha: string) => agendaRepository.cambiarClaseParaCubrir(alumnoId, agendaId, grupoId, fecha);
export const moverFechaAgenda = (id: number, fecha: string) => agendaRepository.mover(id, fecha);
export const moverAgendaDelDia = (
  origen: string, destino: string, motivo: TipoMovimientoClase
) => agendaRepository.moverDia(origen, destino, motivo);
export const agregarFechaManual = (alumnoId: number, grupoId: number, fecha: string) => agendaRepository.agregarManual(alumnoId, grupoId, fecha);
export const quitarFechaAgenda = (id: number) => agendaRepository.quitar(id);
export const asignarModeloAgenda = (id: number, modeloId: number | null, necesidades: string) => agendaRepository.asignarModelo(id, modeloId, necesidades);
