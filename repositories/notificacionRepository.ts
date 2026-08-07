import { Grupo } from "@/models";
import { databasePromise } from "@/database/connection";

export interface PersonaAviso {
  nombre: string;
  modelo_nombre: string | null;
}

export const notificacionRepository = {
  async listarGruposActivos() {
    const db = await databasePromise;
    return db.getAllAsync<Grupo>(
      "SELECT * FROM grupos WHERE activo = 1 AND notificacion = 1 ORDER BY dia, hora"
    );
  },
  async listarFechas(grupoId: number, desde: string) {
    const db = await databasePromise;
    return db.getAllAsync<{ fecha: string }>(`
      SELECT DISTINCT fecha FROM agenda_alumnos
      WHERE grupo_id = ? AND fecha >= ? AND estado = 'programada'
        AND fecha NOT IN (SELECT fecha FROM feriados)
      ORDER BY fecha LIMIT 12
    `, grupoId, desde);
  },
  async listarPersonas(grupoId: number, fecha: string) {
    const db = await databasePromise;
    return db.getAllAsync<PersonaAviso>(`
      SELECT a.nombre, m.nombre AS modelo_nombre
      FROM agenda_alumnos ag
      JOIN alumnos a ON a.id = ag.alumno_id
      LEFT JOIN modelos m ON m.id = ag.modelo_id
      WHERE ag.grupo_id = ? AND ag.fecha = ? AND ag.estado = 'programada'
      ORDER BY a.nombre COLLATE NOCASE
    `, grupoId, fecha);
  },
};
