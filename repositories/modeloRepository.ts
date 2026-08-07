import { Modelo, ModeloInput } from "@/models";
import { databasePromise } from "@/database/connection";

export const modeloRepository = {
  async listar() {
    const db = await databasePromise;
    return db.getAllAsync<Modelo>("SELECT * FROM modelos ORDER BY nombre COLLATE NOCASE");
  },
  async crear(data: ModeloInput) {
    const db = await databasePromise;
    return db.runAsync(
      `INSERT INTO modelos
       (nombre,tipo_arcilla,descripcion,necesita,imagen_1,imagen_2,imagen_3)
       VALUES (?,?,?,?,?,?,?)`,
      data.nombre.trim(), data.tipo_arcilla?.trim() || null,
      data.descripcion?.trim() || null, data.necesita?.trim() || null,
      data.imagen_1, data.imagen_2, data.imagen_3
    );
  },
  async editar(id: number, data: ModeloInput) {
    const db = await databasePromise;
    return db.runAsync(
      `UPDATE modelos SET nombre = ?, tipo_arcilla = ?, descripcion = ?, necesita = ?,
       imagen_1 = ?, imagen_2 = ?, imagen_3 = ? WHERE id = ?`,
      data.nombre.trim(), data.tipo_arcilla?.trim() || null,
      data.descripcion?.trim() || null, data.necesita?.trim() || null,
      data.imagen_1, data.imagen_2, data.imagen_3, id
    );
  },
};

export const listarModelos = () => modeloRepository.listar();
export const crearModelo = (data: ModeloInput) => modeloRepository.crear(data);
export const editarModelo = (id: number, data: ModeloInput) => modeloRepository.editar(id, data);
