const MINUTOS_DIA = 24 * 60;

export function horaAMinutos(hora: string) {
  const [horas, minutos] = hora.split(":").map(Number);
  if (!Number.isInteger(horas) || !Number.isInteger(minutos)) return 0;
  return Math.min(23, Math.max(0, horas)) * 60 + Math.min(59, Math.max(0, minutos));
}

export function minutosAHora(minutos: number) {
  const normalizados = ((minutos % MINUTOS_DIA) + MINUTOS_DIA) % MINUTOS_DIA;
  const horas = Math.floor(normalizados / 60);
  const resto = normalizados % 60;
  return `${String(horas).padStart(2, "0")}:${String(resto).padStart(2, "0")}`;
}

export function anticipacionDesdeHorario(horaClase: string, diasAntes: number, horaAviso: string) {
  const dias = Math.max(0, Math.floor(diasAntes));
  return dias * MINUTOS_DIA + horaAMinutos(horaClase) - horaAMinutos(horaAviso);
}

export function horarioDesdeAnticipacion(horaClase: string, minutosAntes: number) {
  const minutoRelativo = horaAMinutos(horaClase) - Math.max(0, minutosAntes);
  const desplazamientoDias = Math.floor(minutoRelativo / MINUTOS_DIA);
  return {
    diasAntes: Math.max(0, -desplazamientoDias),
    horaAviso: minutosAHora(minutoRelativo),
  };
}

export function textoHorarioAviso(horaClase: string, minutosAntes: number) {
  const { diasAntes, horaAviso } = horarioDesdeAnticipacion(horaClase, minutosAntes);
  const dia = diasAntes === 0
    ? "el mismo día"
    : `${diasAntes} día${diasAntes === 1 ? "" : "s"} antes`;
  return `${dia} · ${horaAviso}`;
}
