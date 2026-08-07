let ultimoUri: string | null = null;

export async function isAvailableAsync() {
  return true;
}

export async function shareAsync(uri: string) {
  ultimoUri = uri;
}

export function ultimoArchivoCompartido() {
  return ultimoUri;
}

export function reiniciarCompartidosPrueba() {
  ultimoUri = null;
}
