import initSqlJs, {
  BindParams,
  Database as SqlJsDatabase,
  SqlJsStatic,
  SqlValue,
} from "sql.js";

function parametros(valores: unknown[]): BindParams {
  return valores.map(valor => valor as SqlValue);
}

export class DatabasePrueba {
  private sqlite: SqlJsDatabase;

  constructor(private readonly SQL: SqlJsStatic) {
    this.sqlite = new SQL.Database();
  }

  reiniciar() {
    this.sqlite.close();
    this.sqlite = new this.SQL.Database();
  }

  async execAsync(sql: string) {
    this.sqlite.run(sql);
  }

  async runAsync(sql: string, ...valores: unknown[]) {
    this.sqlite.run(sql, parametros(valores));
    const resultado = this.sqlite.exec("SELECT last_insert_rowid() AS id");
    const ultimoId = resultado[0]?.values[0]?.[0];
    return {
      lastInsertRowId: typeof ultimoId === "number" ? ultimoId : 0,
      changes: this.sqlite.getRowsModified(),
    };
  }

  async getFirstAsync<T>(sql: string, ...valores: unknown[]): Promise<T | null> {
    const sentencia = this.sqlite.prepare(sql);
    try {
      if (valores.length) sentencia.bind(parametros(valores));
      if (!sentencia.step()) return null;
      return sentencia.getAsObject() as unknown as T;
    } finally {
      sentencia.free();
    }
  }

  async getAllAsync<T>(sql: string, ...valores: unknown[]): Promise<T[]> {
    const sentencia = this.sqlite.prepare(sql);
    const filas: T[] = [];
    try {
      if (valores.length) sentencia.bind(parametros(valores));
      while (sentencia.step()) {
        filas.push(sentencia.getAsObject() as unknown as T);
      }
      return filas;
    } finally {
      sentencia.free();
    }
  }

  async withTransactionAsync(trabajo: () => Promise<void>) {
    this.sqlite.run("BEGIN TRANSACTION");
    try {
      await trabajo();
      this.sqlite.run("COMMIT");
    } catch (error) {
      this.sqlite.run("ROLLBACK");
      throw error;
    }
  }

  async withExclusiveTransactionAsync(
    trabajo: (db: DatabasePrueba) => Promise<void>
  ) {
    await this.withTransactionAsync(() => trabajo(this));
  }

  async closeAsync() {
    this.sqlite.close();
  }
}

export type Database = DatabasePrueba;
export const databasePromise = initSqlJs().then(SQL => new DatabasePrueba(SQL));
export async function reiniciarBasePrueba() {
  const db = await databasePromise;
  db.reiniciar();
}
