import { Clase } from "@/models";
import { databasePromise } from "@/database/connection";

export const claseRepository = {
  async listarEntre(inicio: string, fin: string) {
    const db = await databasePromise;
    return db.getAllAsync<Clase>(`
      SELECT c.*, a.nombre AS alumno_nombre, g.nombre AS grupo_nombre
      FROM clases c JOIN alumnos a ON a.id = c.alumno_id
      JOIN grupos g ON g.id = c.grupo_id
      WHERE c.fecha BETWEEN ? AND ? ORDER BY c.fecha, g.hora
    `, inicio, fin);
  },
};

export const clasesDelMes = (inicio: string, fin: string) => claseRepository.listarEntre(inicio, fin);
