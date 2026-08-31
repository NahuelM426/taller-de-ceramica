import Constants from "expo-constants";
import { File, Paths } from "expo-file-system";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { databasePromise } from "@/database/connection";
import { clavesPreferencias, preferenciaRepository } from "@/repositories/preferenciaRepository";

type ValorSql = string | number | null;
type FilaCopia = Record<string, ValorSql>;

const FORMATO = "taller-de-ceramica";
const VERSION_FORMATO = 9;
const ARCHIVO_EMERGENCIA = "taller-ceramica-antes-de-restaurar.json";
const LIMITE_ARCHIVO = 100 * 1024 * 1024;

const tablas = [
  {
    nombre: "grupos",
    columnas: [
      "id", "nombre", "dia", "hora", "capacidad", "color", "notificacion",
      "minutos_antes", "activo", "frecuencia", "fecha_inicio",
    ],
  },
  { nombre: "moldes", columnas: ["id", "nombre", "codigo", "cantidad"] },
  {
    nombre: "modelos",
    columnas: [
      "id", "nombre", "tipo_arcilla", "descripcion", "necesita",
      "imagen_1", "imagen_2", "imagen_3",
    ],
  },
  {
    nombre: "alumnos",
    columnas: [
      "id", "nombre", "telefono", "frecuencia", "grupo_id", "molde_id",
      "pendientes", "fecha_inicio", "sin_grupo", "activo",
    ],
  },
  {
    nombre: "pagos_alumnos",
    columnas: [
      "alumno_id", "mes", "pagado", "clases_pagadas", "clases_extra", "clases_extra_usadas",
      "fecha_pago", "actualizado_en",
    ],
  },
  { nombre: "clases", columnas: ["id", "alumno_id", "grupo_id", "fecha", "estado"] },
  {
    nombre: "agenda_alumnos",
    columnas: [
      "id", "alumno_id", "grupo_id", "fecha", "tipo", "estado", "modelo_id",
      "necesidades", "cubre_agenda_id", "origen_agenda_id", "feriado_origen",
      "feriado_tipo_origen", "motivo_movimiento", "pago_extra_mes", "extra_adeudada",
    ],
  },
  {
    nombre: "agenda_modelos",
    columnas: ["agenda_id", "modelo_id", "orden"],
  },
  {
    nombre: "movimientos_pendientes",
    columnas: [
      "id", "alumno_id", "agenda_id", "delta", "tipo", "categoria", "clave",
      "revierte_movimiento_id", "fecha", "creado_en",
    ],
  },
  {
    nombre: "feriados",
    columnas: ["fecha", "grupo_id", "motivo", "fecha_recuperacion", "tipo"],
  },
  {
    nombre: "reajustes_grupo",
    columnas: [
      "id", "grupo_id", "fecha_origen", "fecha_destino", "fecha_inicio_anterior",
      "fecha_inicio_nueva", "fecha_hasta", "agenda_anterior", "agenda_generada",
      "creado_en", "deshecho_en",
    ],
  },
  { nombre: "app_meta", columnas: ["clave", "valor"] },
] as const;

type NombreTabla = typeof tablas[number]["nombre"];

export interface CopiaSeguridad {
  formato: typeof FORMATO;
  versionFormato: typeof VERSION_FORMATO;
  versionApp: string;
  creadaEn: string;
  tablas: Record<NombreTabla, FilaCopia[]>;
}

export interface ResumenCopia {
  creadaEn: string;
  alumnos: number;
  grupos: number;
  modelos: number;
  clases: number;
}

export interface EstadoCopiaSeguridad {
  recordatorioActivo: boolean;
  ultimaCopia: string | null;
  copiaPendiente: boolean;
  diasDesdeUltima: number | null;
}

function nombreArchivo(fecha: Date) {
  const partes = [
    fecha.getFullYear(),
    String(fecha.getMonth() + 1).padStart(2, "0"),
    String(fecha.getDate()).padStart(2, "0"),
  ];
  const hora = `${String(fecha.getHours()).padStart(2, "0")}${String(fecha.getMinutes()).padStart(2, "0")}`;
  return `taller-ceramica-respaldo-${partes.join("-")}-${hora}.json`;
}

function esValorSql(valor: unknown): valor is ValorSql {
  return valor === null || typeof valor === "string" ||
    (typeof valor === "number" && Number.isFinite(valor));
}

function validarCopia(valor: unknown): CopiaSeguridad {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) {
    throw new Error("El archivo no contiene una copia válida.");
  }
  const candidata = valor as Record<string, unknown>;
  if (candidata.formato !== FORMATO) {
    throw new Error("El archivo no pertenece a Taller de Cerámica.");
  }
  const versionRecibida = candidata.versionFormato;
  if (typeof versionRecibida !== "number" ||
      ![1, 2, 3, 4, 5, 6, 7, 8, VERSION_FORMATO].includes(versionRecibida)) {
    throw new Error("La versión de esta copia todavía no es compatible.");
  }
  if (typeof candidata.creadaEn !== "string" || !candidata.tablas ||
      typeof candidata.tablas !== "object" || Array.isArray(candidata.tablas)) {
    throw new Error("La copia está incompleta o dañada.");
  }

  const creadaEn = candidata.creadaEn as string;
  const tablasRecibidas = candidata.tablas as Record<string, unknown>;
  const tablasLimpias = {} as Record<NombreTabla, FilaCopia[]>;
  let filasTotales = 0;
  for (const tabla of tablas) {
    let filas = tablasRecibidas[tabla.nombre];
    if (!Array.isArray(filas) && versionRecibida === 1 &&
        tabla.nombre === "movimientos_pendientes") {
      filas = [];
    }
    if (!Array.isArray(filas) && versionRecibida < 3 &&
        tabla.nombre === "reajustes_grupo") {
      filas = [];
    }
    if (!Array.isArray(filas) && versionRecibida < 5 &&
        tabla.nombre === "agenda_modelos") {
      filas = [];
    }
    if (!Array.isArray(filas) && versionRecibida < 6 &&
        tabla.nombre === "pagos_alumnos") {
      filas = [];
    }
    if (!Array.isArray(filas)) throw new Error(`Falta la información de ${tabla.nombre}.`);
    filasTotales += filas.length;
    if (filasTotales > 100_000) throw new Error("La copia contiene demasiados registros.");
    tablasLimpias[tabla.nombre] = filas.map(fila => {
      if (!fila || typeof fila !== "object" || Array.isArray(fila)) {
        throw new Error(`Hay un registro inválido en ${tabla.nombre}.`);
      }
      const registro = fila as Record<string, unknown>;
      const limpio: FilaCopia = {};
      for (const columna of tabla.columnas) {
        if (versionRecibida < 7 && tabla.nombre === "agenda_alumnos" &&
            columna === "pago_extra_mes" && !Object.prototype.hasOwnProperty.call(registro, columna)) {
          limpio[columna] = null;
          continue;
        }
        if (versionRecibida < 8 && tabla.nombre === "agenda_alumnos" &&
            columna === "extra_adeudada" && !Object.prototype.hasOwnProperty.call(registro, columna)) {
          limpio[columna] = 0;
          continue;
        }
        if (versionRecibida < 9 && tabla.nombre === "movimientos_pendientes" &&
            columna === "categoria" && !Object.prototype.hasOwnProperty.call(registro, columna)) {
          limpio[columna] = "regular";
          continue;
        }
        if (versionRecibida < 7 && tabla.nombre === "pagos_alumnos" &&
            columna === "clases_extra_usadas" && !Object.prototype.hasOwnProperty.call(registro, columna)) {
          limpio[columna] = 0;
          continue;
        }
        if (versionRecibida < 4 && tabla.nombre === "feriados" &&
            columna === "grupo_id" && !Object.prototype.hasOwnProperty.call(registro, columna)) {
          limpio[columna] = 0;
          continue;
        }
        if (!Object.prototype.hasOwnProperty.call(registro, columna) || !esValorSql(registro[columna])) {
          throw new Error(`La copia tiene un dato inválido en ${tabla.nombre}.${columna}.`);
        }
        limpio[columna] = registro[columna];
      }
      return limpio;
    });
  }

  if (versionRecibida === 1) {
    tablasLimpias.movimientos_pendientes = tablasLimpias.alumnos
      .filter(alumno => typeof alumno.pendientes === "number" && alumno.pendientes > 0)
      .map((alumno, indice) => {
        const alumnoId = alumno.id as number;
        const pendientes = alumno.pendientes as number;
        return {
          id: null,
          alumno_id: alumnoId,
          agenda_id: null,
          delta: pendientes,
          tipo: "saldo_inicial",
          categoria: "regular",
          clave: `saldo_restaurado_v1:alumno:${alumnoId}:${indice}`,
          revierte_movimiento_id: null,
          fecha: creadaEn.slice(0, 10),
          creado_en: creadaEn,
        };
      });
  }

  if (versionRecibida < 9) {
    const agendasExtraPagadas = new Set(
      tablasLimpias.agenda_alumnos
        .filter(agenda => agenda.pago_extra_mes && agenda.extra_adeudada !== 1)
        .map(agenda => agenda.id)
    );
    for (const movimiento of tablasLimpias.movimientos_pendientes) {
      if (movimiento.tipo === "ausencia" &&
          agendasExtraPagadas.has(movimiento.agenda_id)) {
        movimiento.categoria = "extra";
      }
    }
    const movimientosPorId = new Map(
      tablasLimpias.movimientos_pendientes.map(movimiento => [movimiento.id, movimiento])
    );
    for (const movimiento of tablasLimpias.movimientos_pendientes) {
      if (movimiento.tipo !== "reversion" || movimiento.revierte_movimiento_id === null) {
        continue;
      }
      movimiento.categoria =
        movimientosPorId.get(movimiento.revierte_movimiento_id)?.categoria || "regular";
    }
  }

  const saldos = new Map<number, number>();
  for (const movimiento of tablasLimpias.movimientos_pendientes) {
    if (typeof movimiento.alumno_id !== "number" ||
        typeof movimiento.delta !== "number") {
      throw new Error("La copia tiene movimientos de pendientes inválidos.");
    }
    saldos.set(
      movimiento.alumno_id,
      (saldos.get(movimiento.alumno_id) || 0) + movimiento.delta
    );
  }
  for (const alumno of tablasLimpias.alumnos) {
    if (typeof alumno.id !== "number" || typeof alumno.pendientes !== "number" ||
        alumno.pendientes !== (saldos.get(alumno.id) || 0)) {
      throw new Error("La copia tiene saldos de pendientes inconsistentes.");
    }
  }

  return {
    formato: FORMATO,
    versionFormato: VERSION_FORMATO,
    versionApp: typeof candidata.versionApp === "string" ? candidata.versionApp : "desconocida",
    creadaEn: candidata.creadaEn,
    tablas: tablasLimpias,
  };
}

async function obtenerCopia(): Promise<CopiaSeguridad> {
  const db = await databasePromise;
  const datos = {} as Record<NombreTabla, FilaCopia[]>;
  await db.withExclusiveTransactionAsync(async transaccion => {
    for (const tabla of tablas) {
      const columnas = tabla.columnas.map(columna => `"${columna}"`).join(", ");
      datos[tabla.nombre] = await transaccion.getAllAsync<FilaCopia>(
        `SELECT ${columnas} FROM "${tabla.nombre}"`
      );
    }
  });
  return {
    formato: FORMATO,
    versionFormato: VERSION_FORMATO,
    versionApp: Constants.expoConfig?.version || "desconocida",
    creadaEn: new Date().toISOString(),
    tablas: datos,
  };
}

function resumen(copia: CopiaSeguridad): ResumenCopia {
  return {
    creadaEn: copia.creadaEn,
    alumnos: copia.tablas.alumnos.filter(item => item.activo !== 0).length,
    grupos: copia.tablas.grupos.filter(item => item.activo !== 0).length,
    modelos: copia.tablas.modelos.length,
    clases: copia.tablas.agenda_alumnos.length,
  };
}

async function escribirArchivo(copia: CopiaSeguridad, archivo: File) {
  archivo.create({ overwrite: true, intermediates: true });
  archivo.write(JSON.stringify(copia));
}

export async function resumenDatosActuales() {
  const db = await databasePromise;
  const cantidades = await db.getFirstAsync<{
    alumnos: number; grupos: number; modelos: number; clases: number;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM alumnos WHERE activo != 0) AS alumnos,
      (SELECT COUNT(*) FROM grupos WHERE activo != 0) AS grupos,
      (SELECT COUNT(*) FROM modelos) AS modelos,
      (SELECT COUNT(*) FROM agenda_alumnos) AS clases
  `);
  return {
    creadaEn: new Date().toISOString(),
    alumnos: cantidades?.alumnos || 0,
    grupos: cantidades?.grupos || 0,
    modelos: cantidades?.modelos || 0,
    clases: cantidades?.clases || 0,
  };
}

export async function compartirCopiaSeguridad() {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Este dispositivo no permite guardar o compartir archivos.");
  }
  const copia = await obtenerCopia();
  const archivo = new File(Paths.cache, nombreArchivo(new Date(copia.creadaEn)));
  await escribirArchivo(copia, archivo);
  await Sharing.shareAsync(archivo.uri, {
    mimeType: "application/json",
    UTI: "public.json",
    dialogTitle: "Guardar copia de Taller de Cerámica",
  });
  await preferenciaRepository.guardar(clavesPreferencias.ultimaCopia, copia.creadaEn);
  return resumen(copia);
}

export async function estadoCopiaSeguridad(): Promise<EstadoCopiaSeguridad> {
  const [activo, ultimaCopia] = await Promise.all([
    preferenciaRepository.obtener(clavesPreferencias.recordatorioCopiaActivo),
    preferenciaRepository.obtener(clavesPreferencias.ultimaCopia),
  ]);
  const fechaUltima = ultimaCopia ? new Date(ultimaCopia) : null;
  const valida = !!fechaUltima && !Number.isNaN(fechaUltima.getTime());
  const diasDesdeUltima = valida
    ? Math.floor((Date.now() - fechaUltima.getTime()) / 86_400_000)
    : null;
  return {
    recordatorioActivo: activo === "1",
    ultimaCopia: valida ? ultimaCopia : null,
    copiaPendiente: activo === "1" && (diasDesdeUltima === null || diasDesdeUltima >= 7),
    diasDesdeUltima,
  };
}

export async function elegirCopiaSeguridad() {
  const resultado = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "text/json", "text/plain"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (resultado.canceled) return null;
  const seleccionado = resultado.assets[0];
  if (seleccionado.size && seleccionado.size > LIMITE_ARCHIVO) {
    throw new Error("El archivo es demasiado grande para ser una copia válida.");
  }
  const archivo = new File(seleccionado.uri);
  const texto = await archivo.text();
  if (texto.length > LIMITE_ARCHIVO) {
    throw new Error("El archivo es demasiado grande para ser una copia válida.");
  }
  let contenido: unknown;
  try {
    contenido = JSON.parse(texto);
  } catch {
    throw new Error("No se pudo leer el archivo. Elegí una copia terminada en .json.");
  }
  const copia = validarCopia(contenido);
  return { copia, resumen: resumen(copia), nombre: seleccionado.name };
}

async function guardarEmergencia() {
  const archivo = new File(Paths.document, ARCHIVO_EMERGENCIA);
  await escribirArchivo(await obtenerCopia(), archivo);
}

async function aplicarCopia(copia: CopiaSeguridad, crearEmergencia: boolean) {
  const copiaValidada = validarCopia(copia);
  if (crearEmergencia) await guardarEmergencia();
  const db = await databasePromise;
  await db.execAsync("PRAGMA foreign_keys = OFF");
  try {
    await db.withExclusiveTransactionAsync(async transaccion => {
      for (const tabla of [...tablas].reverse()) {
        await transaccion.execAsync(`DELETE FROM "${tabla.nombre}"`);
      }
      for (const tabla of tablas) {
        const nombres = tabla.columnas.map(columna => `"${columna}"`).join(", ");
        const lugares = tabla.columnas.map(() => "?").join(", ");
        for (const fila of copiaValidada.tablas[tabla.nombre]) {
          const valores = tabla.columnas.map(columna => fila[columna]);
          await transaccion.runAsync(
            `INSERT INTO "${tabla.nombre}" (${nombres}) VALUES (${lugares})`,
            ...valores
          );
        }
      }
      await transaccion.execAsync(`
        INSERT OR IGNORE INTO agenda_modelos (agenda_id,modelo_id,orden)
        SELECT ag.id,ag.modelo_id,0
        FROM agenda_alumnos ag
        JOIN modelos m ON m.id = ag.modelo_id
        WHERE ag.modelo_id IS NOT NULL;
      `);
      const problemas = await transaccion.getAllAsync<{ table: string }>("PRAGMA foreign_key_check");
      if (problemas.length) {
        throw new Error("La copia tiene relaciones dañadas y no se puede utilizar.");
      }
    });
  } finally {
    await db.execAsync("PRAGMA foreign_keys = ON");
  }
}

export async function restaurarCopiaSeguridad(copia: CopiaSeguridad) {
  await aplicarCopia(copia, true);
}

export function hayCopiaDeEmergencia() {
  return new File(Paths.document, ARCHIVO_EMERGENCIA).exists;
}

export async function restaurarCopiaDeEmergencia() {
  const archivo = new File(Paths.document, ARCHIVO_EMERGENCIA);
  if (!archivo.exists) throw new Error("No hay una restauración anterior para deshacer.");
  const copia = validarCopia(JSON.parse(await archivo.text()));
  await aplicarCopia(copia, false);
  archivo.delete();
  return resumen(copia);
}
