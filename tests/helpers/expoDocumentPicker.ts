import { tamanoArchivoPrueba } from "./expoFileSystem";

let proximoUri: string | null = null;

export function elegirDocumentoPrueba(uri: string) {
  proximoUri = uri;
}

export async function getDocumentAsync() {
  if (!proximoUri) return { canceled: true, assets: [] };
  const uri = proximoUri;
  proximoUri = null;
  return {
    canceled: false,
    assets: [{
      uri,
      name: uri.split("/").pop() || "respaldo.json",
      size: tamanoArchivoPrueba(uri),
    }],
  };
}
