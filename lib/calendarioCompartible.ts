import { grupoOcurreEnFecha } from "@/lib/grupos";
import type { Grupo } from "@/models";

export const MESES_CALENDARIO = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
] as const;

export interface MarcaCalendarioCompartible {
  grupoId: number;
  color: string;
}

export interface DiaCalendarioCompartible {
  dia: number | null;
  fecha: string | null;
  marcas: MarcaCalendarioCompartible[];
}

export interface CalendarioCompartibleData {
  anio: number;
  mes: number;
  tituloMes: string;
  filas: number;
  maxMarcasPorDia: number;
  celdas: DiaCalendarioCompartible[];
  leyenda: Array<Pick<Grupo, "id" | "nombre" | "dia" | "hora" | "color">>;
}

const iso = (anio: number, mes: number, dia: number) =>
  `${anio}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

export function prepararCalendarioCompartible(
  cursor: Pick<Date, "getFullYear" | "getMonth">,
  grupos: Grupo[]
): CalendarioCompartibleData {
  const anio = cursor.getFullYear();
  const mes = cursor.getMonth();
  const activos = grupos.filter(grupo => grupo.activo === 1);
  const blancos = (new Date(anio, mes, 1).getDay() + 6) % 7;
  const cantidadDias = new Date(anio, mes + 1, 0).getDate();
  const filas = Math.ceil((blancos + cantidadDias) / 7);
  const celdas = Array.from({ length: filas * 7 }, (_, indice) => {
    const dia = indice - blancos + 1;
    if (dia < 1 || dia > cantidadDias) {
      return { dia: null, fecha: null, marcas: [] };
    }
    const fecha = iso(anio, mes, dia);
    return {
      dia,
      fecha,
      marcas: activos
        .filter(grupo => grupoOcurreEnFecha(grupo, fecha))
        .map(grupo => ({ grupoId: grupo.id, color: grupo.color })),
    };
  });
  const maxMarcasPorDia = Math.max(0, ...celdas.map(celda => celda.marcas.length));

  return {
    anio,
    mes,
    tituloMes: `${MESES_CALENDARIO[mes]} ${anio}`,
    filas,
    maxMarcasPorDia,
    celdas,
    leyenda: activos.map(({ id, nombre, dia, hora, color }) => ({
      id, nombre, dia, hora, color,
    })),
  };
}

export function alturaCeldaCalendarioCompartible(filas: number, maxMarcasPorDia: number) {
  const alturaBase = filas === 4 ? 68 : filas === 5 ? 58 : 50;
  const alturaNecesaria = maxMarcasPorDia > 0 ? 27 + (maxMarcasPorDia * 8) : 0;
  return Math.max(alturaBase, alturaNecesaria);
}

export function puedeCompartirVistaPrevia(input: {
  vistaLista: boolean;
  logoListo: boolean;
  preparando: boolean;
}) {
  return input.vistaLista && input.logoListo && !input.preparando;
}

export function nombreArchivoCalendario(data: Pick<CalendarioCompartibleData, "mes" | "anio">) {
  return `calendario-${MESES_CALENDARIO[data.mes]}-${data.anio}.png`;
}

export async function ejecutarCompartirCalendarioUnaVez(
  bloqueo: { actual: boolean },
  compartir: () => Promise<void>
) {
  if (bloqueo.actual) return false;
  bloqueo.actual = true;
  try {
    await compartir();
    return true;
  } finally {
    bloqueo.actual = false;
  }
}
