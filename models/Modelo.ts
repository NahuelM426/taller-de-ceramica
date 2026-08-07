export interface Modelo {
  id: number;
  nombre: string;
  tipo_arcilla: string | null;
  descripcion: string | null;
  necesita: string | null;
  imagen_1: string | null;
  imagen_2: string | null;
  imagen_3: string | null;
}

export type ModeloInput = Omit<Modelo, "id">;
