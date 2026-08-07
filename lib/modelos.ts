import { Modelo } from "@/models";

export function imagenesDelModelo(modelo: Modelo | null | undefined) {
  if (!modelo) return [];
  return [modelo.imagen_1, modelo.imagen_2, modelo.imagen_3]
    .filter((imagen): imagen is string => !!imagen);
}
