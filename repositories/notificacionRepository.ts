import { Grupo } from "@/models";
import { databasePromise } from "@/database/connection";

export interface PersonaAviso {
  nombre: string;
  modelo_nombres: string[];
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
        AND NOT EXISTS (
          SELECT 1 FROM feriados f
          WHERE f.fecha = agenda_alumnos.fecha
            AND (f.grupo_id = 0 OR f.grupo_id = agenda_alumnos.grupo_id)
        )
      ORDER BY fecha LIMIT 12
    `, grupoId, desde);
  },
  async listarPersonas(grupoId: number, fecha: string) {
    const db = await databasePromise;
    const items = await db.getAllAsync<{
      nombre: string; modelo_nombre: string | null; modelos_csv: string | null;
    }>(`
      SELECT a.nombre, m.nombre AS modelo_nombre,
        (SELECT GROUP_CONCAT(nombre, char(31)) FROM (
          SELECT mm.nombre,
            MIN(CASE WHEN pedido.id = ag.id THEN 0 ELSE 1 END) AS prioridad,
            MIN(pedido.id) AS pedido_id, MIN(am.orden) AS orden, am.modelo_id
          FROM agenda_modelos am
          JOIN agenda_alumnos pedido ON pedido.id = am.agenda_id
          JOIN modelos mm ON mm.id = am.modelo_id
          WHERE (pedido.id = ag.id AND pedido.modelos_destino_agenda_id IS NULL)
             OR pedido.modelos_destino_agenda_id = ag.id
          GROUP BY am.modelo_id, mm.nombre
          ORDER BY prioridad, pedido_id, orden, am.modelo_id
        )) AS modelos_csv
      FROM agenda_alumnos ag
      JOIN alumnos a ON a.id = ag.alumno_id
      LEFT JOIN modelos m ON m.id = ag.modelo_id
      WHERE ag.grupo_id = ? AND ag.fecha = ? AND ag.estado = 'programada'
      ORDER BY a.nombre COLLATE NOCASE
    `, grupoId, fecha);
    return items.map(item => ({
      nombre: item.nombre,
      modelo_nombres: item.modelos_csv
        ? item.modelos_csv.split(String.fromCharCode(31)).filter(Boolean)
        : item.modelo_nombre ? [item.modelo_nombre] : [],
    }));
  },
};
