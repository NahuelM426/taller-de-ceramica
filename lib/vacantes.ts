import { AgendaAlumno, ClaseProgramada, Grupo, Vacante } from "@/models";
import { grupoOcurreEnFecha } from "@/lib/grupos";

export function fechaLocal(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function armarClases(
  grupos: Grupo[],
  agenda: AgendaAlumno[],
  feriados: string[],
  desde = new Date(),
  cantidadDias = 60
) {
  const inicio = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate(), 12);
  const fechasFeriadas = new Set(feriados);
  const claves = new Set<string>();

  for (let offset = 0; offset <= cantidadDias; offset++) {
    const fecha = new Date(inicio);
    fecha.setDate(fecha.getDate() + offset);
    const valor = fechaLocal(fecha);
    if (fechasFeriadas.has(valor)) continue;
    grupos.filter(grupo => grupoOcurreEnFecha(grupo, valor)).forEach(grupo => {
      claves.add(`${valor}|${grupo.id}`);
    });
  }

  agenda.forEach(item => {
    if (!fechasFeriadas.has(item.fecha)) claves.add(`${item.fecha}|${item.grupo_id}`);
  });

  return Array.from(claves).map(key => {
    const [fecha, grupoId] = key.split("|");
    const grupo = grupos.find(item => item.id === Number(grupoId));
    if (!grupo) return null;
    return {
      key,
      fecha,
      grupo,
      agenda: agenda.filter(item => item.fecha === fecha && item.grupo_id === grupo.id),
    };
  }).filter((item): item is ClaseProgramada => !!item)
    .sort((a, b) => `${a.fecha} ${a.grupo.hora}`.localeCompare(`${b.fecha} ${b.grupo.hora}`));
}

export function armarVacantes(
  grupos: Grupo[],
  agenda: AgendaAlumno[],
  feriados: string[],
  desde = new Date(),
  cantidadDias = 60
) {
  return armarClases(grupos, agenda, feriados, desde, cantidadDias).map(clase => {
    const vienen = clase.agenda.filter(item => item.estado !== "ausente");
    return {
      key: clase.key,
      fecha: clase.fecha,
      grupo: clase.grupo,
      vienen,
      lugares: calcularLugaresDisponibles(clase.grupo, clase.agenda),
      liberados: calcularVacantesLiberadas(clase.agenda),
    };
  }).filter((item): item is Vacante => item.lugares > 0);
}

export function calcularLugaresDisponibles(grupo: Grupo, agenda: AgendaAlumno[]) {
  const asisten = agenda.filter(item =>
    item.estado !== "ausente" && item.estado !== "cancelada"
  ).length;
  return Math.max(0, grupo.capacidad - asisten);
}

export function calcularVacantesLiberadas(agenda: AgendaAlumno[]) {
  const ausenciasHabituales = agenda.filter(item =>
    item.tipo === "regular" && item.estado === "ausente"
  );
  const reemplazos = agenda.filter(item =>
    item.tipo !== "regular" && item.estado !== "ausente"
  );
  const ausenciasCubiertas = new Set(
    reemplazos.map(item => item.cubre_agenda_id).filter((id): id is number => !!id)
  );
  const libresSinVincular = ausenciasHabituales.filter(item =>
    !ausenciasCubiertas.has(item.id)
  ).length;
  return libresSinVincular;
}

const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function momentoTexto(fecha: string, hoy = new Date()) {
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 12);
  const destino = new Date(`${fecha}T12:00:00`);
  const diferencia = Math.round((destino.getTime() - base.getTime()) / 86400000);
  if (diferencia === 0) return "hoy";
  if (diferencia === 1) return "mañana";
  return `el ${dias[destino.getDay()]} ${destino.getDate()}/${destino.getMonth() + 1}`;
}

export function horaTexto(hora: string) {
  const [horas, minutos] = hora.split(":");
  return minutos === "00" ? `${Number(horas)} hs` : `${Number(horas)}:${minutos} hs`;
}

export function mensajeVacante(vacante: Vacante) {
  const cantidad = vacante.lugares;
  return `‼️⚠️ ${cantidad} lugar${cantidad === 1 ? "" : "es"} disponible${cantidad === 1 ? "" : "s"} para ${momentoTexto(vacante.fecha)} a las ${horaTexto(vacante.grupo.hora)} ⚠️‼️`;
}

export function mensajeRecordatorio(vacante: Pick<Vacante, "fecha" | "grupo" | "vienen">) {
  const nombres = vacante.vienen.map(item => `• ${item.alumno_nombre}`).join("\n");
  const encabezado = `${momentoTexto(vacante.fecha).replace(/^./, letra => letra.toUpperCase())} las espero a las ${horaTexto(vacante.grupo.hora)}.`;
  return nombres ? `${encabezado}\n\n${nombres}` : encabezado;
}
