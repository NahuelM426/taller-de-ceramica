import { completarAgendaInicial } from "./agendaMaintenance";
import { databasePromise } from "./connection";
import { ejecutarMigracionesDeDatos } from "./migrations";
import { crearEsquema, crearIndices, migrarColumnas } from "./schema";
import { verificarConsistenciaPendientes } from "./pendientes";

export async function initDb() {
  const db = await databasePromise;
  await crearEsquema(db);
  await migrarColumnas(db);
  await crearIndices(db);
  await ejecutarMigracionesDeDatos();
  await completarAgendaInicial();
  await verificarConsistenciaPendientes(db);
}
