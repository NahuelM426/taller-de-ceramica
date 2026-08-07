const archivos = new Map<string, string>();

function unirRuta(partes: string[]) {
  if (partes.length === 1) return partes[0];
  return partes.map((parte, indice) =>
    indice === 0 ? parte.replace(/\/$/, "") : parte.replace(/^\//, "")
  ).join("/");
}

export const Paths = {
  cache: "memory://cache",
  document: "memory://document",
};

export class File {
  readonly uri: string;

  constructor(...partes: string[]) {
    this.uri = unirRuta(partes);
  }

  get exists() {
    return archivos.has(this.uri);
  }

  create() {
    archivos.set(this.uri, "");
  }

  write(contenido: string) {
    archivos.set(this.uri, contenido);
  }

  async text() {
    const contenido = archivos.get(this.uri);
    if (contenido === undefined) throw new Error(`No existe ${this.uri}`);
    return contenido;
  }

  delete() {
    archivos.delete(this.uri);
  }
}

export function reiniciarArchivosPrueba() {
  archivos.clear();
}

export function tamanoArchivoPrueba(uri: string) {
  return archivos.get(uri)?.length || 0;
}
