import { Grupo } from "@/models";

const DIA_MS = 86_400_000;

function fechaMediodia(fecha: string) {
  return new Date(`${fecha}T12:00:00`);
}

function aparicionDelDiaEnElMes(fecha: Date) {
  return Math.floor((fecha.getDate() - 1) / 7) + 1;
}

export function grupoOcurreEnFecha(
  grupo: Pick<Grupo, "dia" | "frecuencia" | "fecha_inicio">,
  fecha: string
) {
  const dia = fechaMediodia(fecha);
  if (dia.getDay() !== grupo.dia) return false;
  if (!grupo.fecha_inicio) return true;
  const inicio = fechaMediodia(grupo.fecha_inicio);
  const diferencia = Math.round((dia.getTime() - inicio.getTime()) / DIA_MS);
  if (diferencia < 0) return false;
  if (grupo.frecuencia === "semanal") return diferencia % 7 === 0;
  if (fecha === grupo.fecha_inicio) return true;

  const turnoInicial = aparicionDelDiaEnElMes(inicio) % 2;
  const aparicion = aparicionDelDiaEnElMes(dia);
  return aparicion <= 4 && aparicion % 2 === turnoInicial;
}

export function siguienteFechaDelGrupo(grupo: Grupo, desde: string) {
  const fecha = fechaMediodia(desde);
  for (let intento = 0; intento < 21; intento++) {
    const texto = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
    if (grupoOcurreEnFecha(grupo, texto)) return texto;
    fecha.setDate(fecha.getDate() + 1);
  }
  return desde;
}

export function textoFrecuenciaGrupo(grupo: Pick<Grupo, "frecuencia" | "fecha_inicio">) {
  if (grupo.frecuencia === "semanal") return "Todas las semanas";
  const inicio = grupo.fecha_inicio;
  return inicio
    ? `2 veces por mes · turno desde ${inicio.slice(8, 10)}/${inicio.slice(5, 7)}`
    : "2 veces por mes";
}
