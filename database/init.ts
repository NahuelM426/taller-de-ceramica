import { completarAgendaInicial } from "./agendaMaintenance";
import { databasePromise } from "./connection";
import { ejecutarMigracionesDeDatos } from "./migrations";
import { crearEsquema, migrarColumnas } from "./schema";

export async function initDb() {
  const db = await databasePromise;
  await crearEsquema(db);
  await migrarColumnas(db);
  await ejecutarMigracionesDeDatos();
  await completarAgendaInicial();
}
