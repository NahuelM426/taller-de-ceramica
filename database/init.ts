import { completarAgendaInicial } from "./agendaMaintenance";
import { databasePromise } from "./connection";
import { ejecutarMigracionesDeDatos } from "./migrations";
import { crearEsquema, crearIndices, migrarColumnas } from "./schema";
import { verificarConsistenciaPendientes } from "./pendientes";
import { cerrarMesesPagadosVencidos } from "@/repositories/pagoRepository";

export async function initDb() {
  const db = await databasePromise;
  await crearEsquema(db);
  await migrarColumnas(db);
  await crearIndices(db);
  await ejecutarMigracionesDeDatos();
  await completarAgendaInicial();
  await cerrarMesesPagadosVencidos();
  await verificarConsistenciaPendientes(db);
}
