import { AgendaAlumno } from "@/models";
import { acomodarAgendaRegularAlDia, buscarAusenciaSinCubrir } from "./agendaMaintenance";
import { databasePromise, Database } from "./connection";
import { fechaLocal } from "./dates";
import { migrarSaldoInicialPendientes } from "./pendientes";

async function ejecutarUnaVez(
  db: Database,
  clave: string,
  trabajo: () => Promise<void>
) {
  const hecho = await db.getFirstAsync<{ valor: string }>(
    "SELECT valor FROM app_meta WHERE clave = ?", clave
  );
  if (hecho) return;
  await db.withTransactionAsync(async () => {
    await trabajo();
    await db.runAsync("INSERT INTO app_meta (clave,valor) VALUES (?,?)", clave, "1");
  });
}

async function repararDuplicados(db: Database) {
  const filas = await db.getAllAsync<{
    id: number; alumno_id: number; grupo_id: number;
    fecha: string; tipo: AgendaAlumno["tipo"]; dia: number;
  }>(`
    SELECT ag.id, ag.alumno_id, ag.grupo_id, ag.fecha, ag.tipo, g.dia
    FROM agenda_alumnos ag
    JOIN alumnos a ON a.id = ag.alumno_id
    JOIN grupos g ON g.id = ag.grupo_id
    WHERE ag.fecha >= ? AND ag.estado != 'cancelada' AND a.sin_grupo = 0
      AND ag.tipo != 'recuperacion' AND ag.grupo_id = a.grupo_id
    ORDER BY ag.fecha
  `, fechaLocal());
  for (const fila of filas) {
    const fecha = new Date(`${fila.fecha}T12:00:00`);
    if (fecha.getDay() === fila.dia) continue;
    const adelante = (fila.dia - fecha.getDay() + 7) % 7;
    fecha.setDate(fecha.getDate() + (adelante <= 3 ? adelante : adelante - 7));
    const destino = fechaLocal(fecha);
    const habitual = await db.getFirstAsync<{ id: number }>(
      `SELECT id FROM agenda_alumnos WHERE alumno_id = ? AND grupo_id = ?
       AND fecha = ? AND estado != 'cancelada' AND id != ?`,
      fila.alumno_id, fila.grupo_id, destino, fila.id
    );
    if (habitual) {
      await db.runAsync("UPDATE agenda_alumnos SET estado = 'cancelada' WHERE id = ?", fila.id);
    } else if (fila.tipo === "regular") {
      const conflicto = await db.getFirstAsync<{ id: number }>(
        "SELECT id FROM agenda_alumnos WHERE alumno_id = ? AND fecha = ? AND id != ?",
        fila.alumno_id, destino, fila.id
      );
      if (!conflicto) await db.runAsync("UPDATE agenda_alumnos SET fecha = ? WHERE id = ?", destino, fila.id);
    }
  }
}

async function reasignarMovimientos(db: Database, incluirCancelados: boolean) {
  const filas = await db.getAllAsync<{
    id: number; alumno_id: number; grupo_id: number;
    fecha: string; estado: AgendaAlumno["estado"]; dia_grupo: number;
  }>(`
    SELECT ag.id, ag.alumno_id, ag.grupo_id, ag.fecha, ag.estado,
      g.dia AS dia_grupo
    FROM agenda_alumnos ag
    JOIN alumnos a ON a.id = ag.alumno_id
    JOIN grupos g ON g.id = ag.grupo_id
    WHERE ag.fecha >= ? AND ag.tipo = 'manual' AND ag.grupo_id = a.grupo_id
      AND a.sin_grupo = 0
      ${incluirCancelados ? "" : "AND ag.estado = 'programada'"}
    ORDER BY ag.fecha
  `, fechaLocal());
  for (const fila of filas) {
    const fecha = new Date(`${fila.fecha}T12:00:00`);
    if (fecha.getDay() === fila.dia_grupo) continue;
    const destinos = await db.getAllAsync<{ id: number }>(
      "SELECT id FROM grupos WHERE dia = ? AND activo = 1 ORDER BY hora", fecha.getDay()
    );
    if (destinos.length !== 1) continue;
    let estado = fila.estado;
    if (estado === "cancelada") {
      const desde = new Date(fecha); desde.setDate(desde.getDate() - 3);
      const hasta = new Date(fecha); hasta.setDate(hasta.getDate() + 3);
      const habitual = await db.getFirstAsync<{ id: number }>(
        `SELECT ag.id FROM agenda_alumnos ag JOIN grupos g ON g.id = ag.grupo_id
         WHERE ag.alumno_id = ? AND ag.grupo_id = ? AND ag.estado != 'cancelada'
           AND ag.fecha BETWEEN ? AND ?
           AND CAST(strftime('%w', ag.fecha) AS INTEGER) = g.dia`,
        fila.alumno_id, fila.grupo_id, fechaLocal(desde), fechaLocal(hasta)
      );
      if (!habitual) continue;
      estado = "programada";
    }
    await db.runAsync(
      "UPDATE agenda_alumnos SET grupo_id = ?, estado = ? WHERE id = ?",
      destinos[0].id, estado, fila.id
    );
  }
}

async function vincularCoberturas(db: Database) {
  const reemplazos = await db.getAllAsync<{ id: number; grupo_id: number; fecha: string }>(`
    SELECT id, grupo_id, fecha FROM agenda_alumnos
    WHERE fecha >= ? AND tipo != 'regular' AND estado = 'programada'
      AND cubre_agenda_id IS NULL ORDER BY fecha, id
  `, fechaLocal());
  for (const reemplazo of reemplazos) {
    const ausenciaId = await buscarAusenciaSinCubrir(db, reemplazo.grupo_id, reemplazo.fecha);
    if (ausenciaId) {
      await db.runAsync(
        "UPDATE agenda_alumnos SET cubre_agenda_id = ? WHERE id = ?",
        ausenciaId, reemplazo.id
      );
    }
  }
}

export async function ejecutarMigracionesDeDatos() {
  const db = await databasePromise;
  await ejecutarUnaVez(db, "agenda_regular_alineada_v1", () => acomodarAgendaRegularAlDia(db));
  await ejecutarUnaVez(db, "agenda_duplicados_fuera_de_dia_v2", () => repararDuplicados(db));
  await ejecutarUnaVez(db, "movimientos_asignados_al_grupo_del_dia_v3", () => reasignarMovimientos(db, true));
  await reasignarMovimientos(db, false);
  await ejecutarUnaVez(db, "coberturas_vinculadas_v4", () => vincularCoberturas(db));
  await ejecutarUnaVez(db, "libro_pendientes_v1", () => migrarSaldoInicialPendientes(db));
}
