import * as SQLite from "expo-sqlite";

export const databasePromise = SQLite.openDatabaseAsync("ceramica.db");
export type Database = Awaited<typeof databasePromise>;
