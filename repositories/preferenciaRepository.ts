import { databasePromise } from "@/database/connection";

export const clavesPreferencias = {
  recordatorioCopiaActivo: "recordatorio_copia_activo",
  ultimaCopia: "ultima_copia_seguridad",
  recordatorioPagosActivo: "recordatorio_pagos_activo",
  recordatorioPagosDia: "recordatorio_pagos_dia",
  recordatorioPagosHora: "recordatorio_pagos_hora",
} as const;

export const preferenciaRepository = {
  async obtener(clave: string) {
    const db = await databasePromise;
    const fila = await db.getFirstAsync<{ valor: string }>(
      "SELECT valor FROM app_meta WHERE clave = ?",
      clave
    );
    return fila?.valor || null;
  },

  async guardar(clave: string, valor: string) {
    const db = await databasePromise;
    await db.runAsync(
      `INSERT INTO app_meta (clave, valor) VALUES (?, ?)
       ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`,
      clave,
      valor
    );
  },
};
