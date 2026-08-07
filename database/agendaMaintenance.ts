import { AgendaAlumno, Alumno, Grupo } from "@/models";
import { databasePromise, Database } from "@/database/connection";
import { fechaDentroDe, fechaLocal } from "./dates";
import { grupoOcurreEnFecha } from "@/lib/grupos";
import { cancelarPendientesPorAusenciasFuturas } from "./pendientes";

async function generarAgendaConDb(
  db: Database,
  alumnoId: number,
  grupo: Grupo,
  fechaInicio: string,
  fechaFin: string
) {
  const filasExistentes = await db.getAllAsync<{ fecha: string }>(
    `SELECT fecha FROM agenda_alumnos
     WHERE alumno_id = ? AND fecha BETWEEN ? AND ?`,
    alumnoId,
    fechaInicio,
    fechaFin
  );
  const fechasExistentes = new Set(filasExistentes.map(fila => fila.fecha));
  let creadas = 0;
  const fecha = new Date(`${fechaInicio}T12:00:00`);
  while (fechaLocal(fecha) <= fechaFin) {
    const fechaTexto = fechaLocal(fecha);
    if (grupoOcurreEnFecha(grupo, fechaTexto) && !fechasExistentes.has(fechaTexto)) {
      const resultado = await db.runAsync(
        `INSERT OR IGNORE INTO agenda_alumnos
         (alumno_id,grupo_id,fecha,tipo,estado) VALUES (?,?,?,'regular','programada')`,
        alumnoId, grupo.id, fechaTexto
      );
      if (resultado.changes > 0) {
        fechasExistentes.add(fechaTexto);
        creadas += 1;
      }
    }
    fecha.setDate(fecha.getDate() + 1);
  }
  return creadas;
}

export async function generarAgendaHasta(
  alumnoId: number,
  grupoId: number,
  fechaInicio: string,
  fechaFin: string
) {
  const db = await databasePromise;
  const grupo = await db.getFirstAsync<Grupo>(
    "SELECT * FROM grupos WHERE id = ? AND activo = 1", grupoId
  );
  if (!grupo) return 0;
  return generarAgendaConDb(db, alumnoId, grupo, fechaInicio, fechaFin);
}

export async function rearmarAgendaRegularGrupo(db: Database, grupoId: number) {
  const grupo = await db.getFirstAsync<Grupo>(
    "SELECT * FROM grupos WHERE id = ? AND activo = 1", grupoId
  );
  if (!grupo) return;
  const desde = fechaLocal();
  const alumnos = await db.getAllAsync<Alumno>(`
    SELECT * FROM alumnos
    WHERE activo = 1 AND sin_grupo = 0 AND grupo_id = ?
  `, grupoId);
  for (const alumno of alumnos) {
    await cancelarPendientesPorAusenciasFuturas(
      db,
      alumno.id,
      desde,
      "rearmado_grupo",
      grupoId
    );
    await db.runAsync(
      "UPDATE alumnos SET frecuencia = ? WHERE id = ?",
      grupo.frecuencia,
      alumno.id
    );
    await db.runAsync(
      "DELETE FROM agenda_alumnos WHERE alumno_id = ? AND tipo = 'regular' AND fecha >= ?",
      alumno.id, desde
    );
    await generarAgendaConDb(db, alumno.id, grupo, desde, fechaDentroDe(370));
  }
}

export async function completarAgendaInicial() {
  const db = await databasePromise;
  const alumnos = await db.getAllAsync<Alumno>(`
    SELECT a.*, g.nombre AS grupo_nombre
    FROM alumnos a JOIN grupos g ON g.id = a.grupo_id
    WHERE a.activo = 1 AND a.sin_grupo = 0 AND g.activo = 1
  `);
  for (const alumno of alumnos) {
    const primera = await db.getFirstAsync<{ fecha: string | null }>(
      `SELECT MIN(fecha) AS fecha FROM agenda_alumnos
       WHERE alumno_id = ? AND tipo = 'regular'`,
      alumno.id
    );
    const inicio = alumno.fecha_inicio || primera?.fecha || fechaLocal();
    if (!alumno.fecha_inicio) {
      await db.runAsync("UPDATE alumnos SET fecha_inicio = ? WHERE id = ?", inicio, alumno.id);
    }
    await generarAgendaHasta(
      alumno.id, alumno.grupo_id, inicio, fechaDentroDe(370)
    );
  }
}

export async function buscarAusenciaSinCubrir(
  db: Database,
  grupoId: number,
  fecha: string
) {
  const ausencia = await db.getFirstAsync<{ id: number }>(`
    SELECT aus.id
    FROM agenda_alumnos aus
    WHERE aus.grupo_id = ? AND aus.fecha = ?
      AND aus.tipo = 'regular' AND aus.estado = 'ausente'
      AND NOT EXISTS (
        SELECT 1 FROM agenda_alumnos cobertura
        WHERE cobertura.cubre_agenda_id = aus.id
          AND cobertura.estado NOT IN ('ausente','cancelada')
      )
    ORDER BY aus.id LIMIT 1
  `, grupoId, fecha);
  return ausencia?.id || null;
}

export async function hayLugarDisponible(db: Database, grupoId: number, fecha: string) {
  const resultado = await db.getFirstAsync<{
    capacidad: number; asisten: number;
  }>(`
    SELECT g.capacidad,
      COUNT(CASE WHEN ag.estado NOT IN ('ausente','cancelada') THEN 1 END) AS asisten
    FROM grupos g
    LEFT JOIN agenda_alumnos ag ON ag.grupo_id = g.id AND ag.fecha = ?
    WHERE g.id = ? AND g.activo = 1
    GROUP BY g.id
  `, fecha, grupoId);
  if (!resultado) return false;
  return resultado.asisten < resultado.capacidad;
}

export async function acomodarAgendaRegularAlDia(db: Database, grupoId?: number) {
  const parametros: (string | number)[] = [fechaLocal()];
  const filtroGrupo = grupoId ? "AND g.id = ?" : "";
  if (grupoId) parametros.push(grupoId);
  const filas = await db.getAllAsync<{
    id: number; alumno_id: number; fecha: string; dia: number;
  }>(`
    SELECT ag.id, ag.alumno_id, ag.fecha, g.dia
    FROM agenda_alumnos ag
    JOIN alumnos a ON a.id = ag.alumno_id
    JOIN grupos g ON g.id = ag.grupo_id
    WHERE ag.tipo = 'regular' AND ag.estado != 'cancelada' AND a.sin_grupo = 0
      AND g.activo = 1
      AND ag.fecha >= ? AND ag.grupo_id = a.grupo_id ${filtroGrupo}
    ORDER BY ag.fecha
  `, ...parametros);

  for (const fila of filas) {
    const fecha = new Date(`${fila.fecha}T12:00:00`);
    const diferencia = (fila.dia - fecha.getDay() + 7) % 7;
    if (!diferencia) continue;
    fecha.setDate(fecha.getDate() + diferencia);
    const destino = fechaLocal(fecha);
    const conflicto = await db.getFirstAsync<{ id: number }>(
      "SELECT id FROM agenda_alumnos WHERE alumno_id = ? AND fecha = ? AND id != ?",
      fila.alumno_id, destino, fila.id
    );
    if (conflicto) {
      await db.runAsync("UPDATE agenda_alumnos SET estado = 'cancelada' WHERE id = ?", fila.id);
    } else {
      await db.runAsync("UPDATE agenda_alumnos SET fecha = ? WHERE id = ?", destino, fila.id);
    }
  }
}

export type { AgendaAlumno };
