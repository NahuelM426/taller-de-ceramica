import { Molde } from "@/models";
import { databasePromise } from "@/database/connection";

export const moldeRepository = {
  async listar() {
    const db = await databasePromise;
    return db.getAllAsync<Molde>(`
      SELECT m.*, COUNT(a.id) AS asignados
      FROM moldes m LEFT JOIN alumnos a ON a.molde_id = m.id AND a.activo = 1
      GROUP BY m.id ORDER BY m.codigo COLLATE NOCASE
    `);
  },
  async crear(nombre: string, codigo: string, cantidad: number) {
    const db = await databasePromise;
    return db.runAsync(
      "INSERT INTO moldes (nombre,codigo,cantidad) VALUES (?,?,?)",
      nombre.trim(), codigo.trim(), cantidad
    );
  },
};

export const listarMoldes = () => moldeRepository.listar();
export const crearMolde = (nombre: string, codigo: string, cantidad: number) => moldeRepository.crear(nombre, codigo, cantidad);
