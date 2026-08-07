import { Database } from "./connection";

export async function crearEsquema(db: Database) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS grupos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL,
      dia INTEGER NOT NULL, hora TEXT NOT NULL,
      capacidad INTEGER NOT NULL DEFAULT 6,
      color TEXT NOT NULL DEFAULT '#315B50',
      notificacion INTEGER NOT NULL DEFAULT 0,
      minutos_antes INTEGER NOT NULL DEFAULT 1440,
      activo INTEGER NOT NULL DEFAULT 1,
      frecuencia TEXT NOT NULL DEFAULT 'semanal'
        CHECK(frecuencia IN ('semanal','quincenal')),
      fecha_inicio TEXT
    );
    CREATE TABLE IF NOT EXISTS moldes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL,
      codigo TEXT NOT NULL, cantidad INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS alumnos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, telefono TEXT,
      frecuencia TEXT NOT NULL CHECK(frecuencia IN ('semanal','quincenal')),
      grupo_id INTEGER NOT NULL, molde_id INTEGER,
      pendientes INTEGER NOT NULL DEFAULT 0, fecha_inicio TEXT,
      sin_grupo INTEGER NOT NULL DEFAULT 0,
      activo INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (grupo_id) REFERENCES grupos(id),
      FOREIGN KEY (molde_id) REFERENCES moldes(id)
    );
    CREATE TABLE IF NOT EXISTS clases (
      id INTEGER PRIMARY KEY AUTOINCREMENT, alumno_id INTEGER NOT NULL,
      grupo_id INTEGER NOT NULL, fecha TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'programada',
      FOREIGN KEY (alumno_id) REFERENCES alumnos(id),
      FOREIGN KEY (grupo_id) REFERENCES grupos(id)
    );
    CREATE TABLE IF NOT EXISTS agenda_alumnos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, alumno_id INTEGER NOT NULL,
      grupo_id INTEGER NOT NULL, fecha TEXT NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'regular', estado TEXT NOT NULL DEFAULT 'programada',
      modelo_id INTEGER, necesidades TEXT, cubre_agenda_id INTEGER,
      origen_agenda_id INTEGER, feriado_origen TEXT, feriado_tipo_origen TEXT,
      motivo_movimiento TEXT,
      UNIQUE(alumno_id, fecha),
      FOREIGN KEY (alumno_id) REFERENCES alumnos(id),
      FOREIGN KEY (grupo_id) REFERENCES grupos(id)
    );
    CREATE TABLE IF NOT EXISTS movimientos_pendientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alumno_id INTEGER NOT NULL,
      agenda_id INTEGER,
      delta INTEGER NOT NULL CHECK(delta != 0),
      tipo TEXT NOT NULL CHECK(tipo IN (
        'saldo_inicial','ausencia','recuperacion','ajuste_manual','reversion'
      )),
      clave TEXT NOT NULL UNIQUE,
      revierte_movimiento_id INTEGER UNIQUE,
      fecha TEXT NOT NULL,
      creado_en TEXT NOT NULL,
      FOREIGN KEY (alumno_id) REFERENCES alumnos(id),
      FOREIGN KEY (agenda_id) REFERENCES agenda_alumnos(id) ON DELETE SET NULL,
      FOREIGN KEY (revierte_movimiento_id) REFERENCES movimientos_pendientes(id)
    );
    CREATE TABLE IF NOT EXISTS feriados (
      fecha TEXT PRIMARY KEY, motivo TEXT NOT NULL DEFAULT 'Feriado',
      fecha_recuperacion TEXT,
      tipo TEXT NOT NULL DEFAULT 'feriado'
        CHECK(tipo IN ('feriado','compromiso'))
    );
    CREATE TABLE IF NOT EXISTS modelos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL,
      tipo_arcilla TEXT, descripcion TEXT, necesita TEXT,
      imagen_1 TEXT, imagen_2 TEXT, imagen_3 TEXT
    );
    CREATE TABLE IF NOT EXISTS app_meta (clave TEXT PRIMARY KEY, valor TEXT);
  `);
}

export async function migrarColumnas(db: Database) {
  const alumnos = await db.getAllAsync<{ name: string }>("PRAGMA table_info(alumnos)");
  if (!alumnos.some(item => item.name === "fecha_inicio")) {
    await db.execAsync("ALTER TABLE alumnos ADD COLUMN fecha_inicio TEXT");
  }
  if (!alumnos.some(item => item.name === "sin_grupo")) {
    await db.execAsync("ALTER TABLE alumnos ADD COLUMN sin_grupo INTEGER NOT NULL DEFAULT 0");
  }
  const agenda = await db.getAllAsync<{ name: string }>("PRAGMA table_info(agenda_alumnos)");
  const columnasAgenda: Array<[string, string]> = [
    ["modelo_id", "INTEGER"], ["necesidades", "TEXT"],
    ["cubre_agenda_id", "INTEGER"], ["origen_agenda_id", "INTEGER"],
    ["feriado_origen", "TEXT"],
    ["feriado_tipo_origen", "TEXT"],
    ["motivo_movimiento", "TEXT"],
  ];
  for (const [nombre, tipo] of columnasAgenda) {
    if (!agenda.some(item => item.name === nombre)) {
      await db.execAsync(`ALTER TABLE agenda_alumnos ADD COLUMN ${nombre} ${tipo}`);
    }
  }
  const feriados = await db.getAllAsync<{ name: string }>("PRAGMA table_info(feriados)");
  if (!feriados.some(item => item.name === "fecha_recuperacion")) {
    await db.execAsync("ALTER TABLE feriados ADD COLUMN fecha_recuperacion TEXT");
  }
  if (!feriados.some(item => item.name === "tipo")) {
    await db.execAsync("ALTER TABLE feriados ADD COLUMN tipo TEXT NOT NULL DEFAULT 'feriado'");
  }
  const modelos = await db.getAllAsync<{ name: string }>("PRAGMA table_info(modelos)");
  const columnasModelo: Array<[string, string]> = [
    ["tipo_arcilla", "TEXT"], ["imagen_1", "TEXT"],
    ["imagen_2", "TEXT"], ["imagen_3", "TEXT"],
  ];
  for (const [nombre, tipo] of columnasModelo) {
    if (!modelos.some(item => item.name === nombre)) {
      await db.execAsync(`ALTER TABLE modelos ADD COLUMN ${nombre} ${tipo}`);
    }
  }
  const grupos = await db.getAllAsync<{ name: string }>("PRAGMA table_info(grupos)");
  if (!grupos.some(item => item.name === "notificacion")) {
    await db.execAsync("ALTER TABLE grupos ADD COLUMN notificacion INTEGER NOT NULL DEFAULT 0");
  }
  if (!grupos.some(item => item.name === "minutos_antes")) {
    await db.execAsync("ALTER TABLE grupos ADD COLUMN minutos_antes INTEGER NOT NULL DEFAULT 1440");
  }
  if (!grupos.some(item => item.name === "activo")) {
    await db.execAsync("ALTER TABLE grupos ADD COLUMN activo INTEGER NOT NULL DEFAULT 1");
  }
  if (!grupos.some(item => item.name === "frecuencia")) {
    await db.execAsync("ALTER TABLE grupos ADD COLUMN frecuencia TEXT NOT NULL DEFAULT 'semanal'");
    await db.execAsync(`
      UPDATE grupos SET frecuencia = 'quincenal'
      WHERE id IN (
        SELECT grupo_id FROM alumnos
        WHERE activo = 1 AND sin_grupo = 0
        GROUP BY grupo_id
        HAVING MIN(frecuencia) = 'quincenal' AND MAX(frecuencia) = 'quincenal'
      )
    `);
  }
  if (!grupos.some(item => item.name === "fecha_inicio")) {
    await db.execAsync("ALTER TABLE grupos ADD COLUMN fecha_inicio TEXT");
  }
  const gruposSinInicio = await db.getAllAsync<{ id: number; dia: number }>(
    "SELECT id, dia FROM grupos WHERE fecha_inicio IS NULL"
  );
  for (const grupo of gruposSinInicio) {
    const primera = await db.getFirstAsync<{ fecha: string | null }>(
      "SELECT MIN(fecha) AS fecha FROM agenda_alumnos WHERE grupo_id = ? AND tipo = 'regular'",
      grupo.id
    );
    const inicio = primera?.fecha
      ? new Date(`${primera.fecha}T12:00:00`)
      : new Date();
    inicio.setHours(12, 0, 0, 0);
    while (inicio.getDay() !== grupo.dia) inicio.setDate(inicio.getDate() + 1);
    const fechaInicio = `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, "0")}-${String(inicio.getDate()).padStart(2, "0")}`;
    await db.runAsync("UPDATE grupos SET fecha_inicio = ? WHERE id = ?", fechaInicio, grupo.id);
  }
}

export async function crearIndices(db: Database) {
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_agenda_fecha_estado_grupo
      ON agenda_alumnos(fecha, estado, grupo_id);
    CREATE INDEX IF NOT EXISTS idx_agenda_grupo_fecha_tipo_estado
      ON agenda_alumnos(grupo_id, fecha, tipo, estado);
    CREATE INDEX IF NOT EXISTS idx_agenda_alumno_tipo_fecha_estado
      ON agenda_alumnos(alumno_id, tipo, fecha, estado);
    CREATE INDEX IF NOT EXISTS idx_agenda_cubre_estado
      ON agenda_alumnos(cubre_agenda_id, estado);
    CREATE INDEX IF NOT EXISTS idx_agenda_origen_estado
      ON agenda_alumnos(origen_agenda_id, estado);
    CREATE INDEX IF NOT EXISTS idx_movimientos_alumno_id
      ON movimientos_pendientes(alumno_id, id);
    CREATE INDEX IF NOT EXISTS idx_movimientos_agenda_tipo_id
      ON movimientos_pendientes(agenda_id, tipo, id);
    CREATE INDEX IF NOT EXISTS idx_clases_alumno_grupo_fecha_estado
      ON clases(alumno_id, grupo_id, fecha, estado);
    CREATE INDEX IF NOT EXISTS idx_alumnos_grupo_estado
      ON alumnos(grupo_id, activo, sin_grupo);
    CREATE INDEX IF NOT EXISTS idx_grupos_activos_dia_hora
      ON grupos(activo, dia, hora);
  `);
}
