import { AgendaAlumno, Alumno, Grupo } from "@/models";
import { databasePromise, Database } from "@/database/connection";
import { fechaDentroDe, fechaLocal } from "./dates";
import { grupoOcurreEnFecha } from "@/lib/grupos";
import { cancelarPendientesPorAusenciasFuturas } from "./pendientes";

export async function generarAgendaConDb(
  db: Database,
  alumnoId: number,
  grupo: Grupo,
  fechaInicio: string,
  fechaFin: string
) {
  const inicioConsulta = `${fechaInicio.slice(0, 7)}-01`;
  const filasExistentes = await db.getAllAsync<{
    fecha: string;
    tipo: AgendaAlumno["tipo"];
    estado: AgendaAlumno["estado"];
    feriado_tipo_origen: AgendaAlumno["feriado_tipo_origen"];
  }>(
    `SELECT fecha,tipo,estado,feriado_tipo_origen FROM agenda_alumnos
     WHERE alumno_id = ? AND grupo_id = ? AND fecha BETWEEN ? AND ?`,
    alumnoId,
    grupo.id,
    inicioConsulta,
    fechaFin
  );
  const fechasExistentes = new Set(filasExistentes.map(fila => fila.fecha));
  const habitualesPorMes = new Map<string, Set<string>>();
  for (const fila of filasExistentes) {
    const esHabitual = fila.estado !== "cancelada" && (
      fila.tipo === "regular" ||
      (fila.tipo === "manual" && fila.feriado_tipo_origen === "regular")
    );
    if (!esHabitual) continue;
    const mes = fila.fecha.slice(0, 7);
    const fechas = habitualesPorMes.get(mes) || new Set<string>();
    fechas.add(fila.fecha);
    habitualesPorMes.set(mes, fechas);
  }
  let creadas = 0;
  const fecha = new Date(`${fechaInicio}T12:00:00`);
  while (fechaLocal(fecha) <= fechaFin) {
    const fechaTexto = fechaLocal(fecha);
    const mes = fechaTexto.slice(0, 7);
    const fechasHabituales = habitualesPorMes.get(mes) || new Set<string>();
    const mesCompleto = grupo.frecuencia === "quincenal" &&
      fechasHabituales.size >= 2 && !fechasHabituales.has(fechaTexto);
    if (grupoOcurreEnFecha(grupo, fechaTexto) &&
        !fechasExistentes.has(fechaTexto) && !mesCompleto) {
      const resultado = await db.runAsync(
        `INSERT OR IGNORE INTO agenda_alumnos
         (alumno_id,grupo_id,fecha,tipo,estado) VALUES (?,?,?,'regular','programada')`,
        alumnoId, grupo.id, fechaTexto
      );
      if (resultado.changes > 0) {
        fechasExistentes.add(fechaTexto);
        fechasHabituales.add(fechaTexto);
        habitualesPorMes.set(mes, fechasHabituales);
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

export async function reajustarAgendaDosClasesPorMes(
  db: Database,
  desde = fechaLocal()
) {
  const inicioConsulta = `${desde.slice(0, 7)}-01`;
  const reajustesTransicion = await db.getAllAsync<{
    grupo_id: number; mes: string;
  }>(`
    SELECT grupo_id, substr(fecha_destino,1,7) AS mes
    FROM reajustes_grupo
    WHERE deshecho_en IS NULL
      AND fecha_destino < fecha_origen
      AND substr(fecha_destino,1,7) = substr(fecha_origen,1,7)
  `);
  const mesesDeTransicion = new Set(
    reajustesTransicion.map(item => `${item.grupo_id}|${item.mes}`)
  );
  const filas = await db.getAllAsync<{
    id: number;
    alumno_id: number;
    grupo_id: number;
    fecha: string;
    tipo: AgendaAlumno["tipo"];
    feriado_tipo_origen: AgendaAlumno["feriado_tipo_origen"];
    dia: number;
    frecuencia: "quincenal";
    fecha_inicio: string | null;
  }>(`
    SELECT ag.id, ag.alumno_id, ag.grupo_id, ag.fecha, ag.tipo,
      ag.feriado_tipo_origen, g.dia, g.frecuencia, g.fecha_inicio
    FROM agenda_alumnos ag
    JOIN alumnos a ON a.id = ag.alumno_id
    JOIN grupos g ON g.id = ag.grupo_id
    WHERE ag.fecha >= ? AND ag.estado = 'programada'
      AND (ag.tipo = 'regular' OR
        (ag.tipo = 'manual' AND ag.feriado_tipo_origen = 'regular'))
      AND g.frecuencia = 'quincenal' AND g.activo = 1
      AND a.activo = 1 AND a.sin_grupo = 0 AND a.grupo_id = g.id
    ORDER BY ag.fecha, ag.id
  `, inicioConsulta);
  let canceladas = 0;
  const porAlumnoMes = new Map<string, typeof filas>();
  for (const fila of filas) {
    const clave = `${fila.alumno_id}|${fila.grupo_id}|${fila.fecha.slice(0, 7)}`;
    const grupo = porAlumnoMes.get(clave) || [];
    grupo.push(fila);
    porAlumnoMes.set(clave, grupo);
  }
  for (const grupoFilas of porAlumnoMes.values()) {
    const esTransicion = mesesDeTransicion.has(
      `${grupoFilas[0].grupo_id}|${grupoFilas[0].fecha.slice(0, 7)}`
    );
    const fechasConservadas = esTransicion
      ? new Set([...new Set(grupoFilas.map(fila => fila.fecha))].slice(0, 2))
      : null;
    for (const fila of grupoFilas) {
      if (fila.fecha < desde || fila.tipo !== "regular") continue;
      const conservar = fechasConservadas
        ? fechasConservadas.has(fila.fecha)
        : grupoOcurreEnFecha(fila, fila.fecha);
      if (conservar) continue;
      const resultado = await db.runAsync(
        "UPDATE agenda_alumnos SET estado = 'cancelada' WHERE id = ? AND estado = 'programada'",
        fila.id
      );
      canceladas += resultado.changes;
    }
  }
  return canceladas;
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
