import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "expo-router";

import { seleccionarDatosDelDia } from "@/lib/calendario";
import type { AgendaAlumno, Alumno, Feriado, Grupo, Modelo } from "@/models";
import { agendaDelMes } from "@/repositories/agendaRepository";
import { listarAlumnos } from "@/repositories/alumnoRepository";
import { listarFeriados } from "@/repositories/feriadoRepository";
import { listarGrupos } from "@/repositories/grupoRepository";
import { listarModelos } from "@/repositories/modeloRepository";

const iso = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

export function useCalendarioData(
  fechaSeleccionada: string | null,
  grupoSeleccionadoId: number | null
) {
  const hoy = new Date();
  const hoyTexto = iso(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const [cursor, setCursor] = useState(
    new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  );
  const [agenda, setAgenda] = useState<AgendaAlumno[]>([]);
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [feriados, setFeriados] = useState<Feriado[]>([]);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);

  const cargar = useCallback(async () => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const last = new Date(year, month + 1, 0).getDate();
    const inicio = iso(year, month, 1);
    const fin = iso(year, month, last);
    const finAgendaDate = new Date(year, month, last, 12);
    finAgendaDate.setDate(finAgendaDate.getDate() + 60);
    const finAgenda = iso(
      finAgendaDate.getFullYear(),
      finAgendaDate.getMonth(),
      finAgendaDate.getDate()
    );
    const [
      items,
      personas,
      diasFeriados,
      modelosCargados,
      gruposCargados,
    ] = await Promise.all([
      agendaDelMes(inicio, finAgenda),
      listarAlumnos(),
      listarFeriados(inicio, fin),
      listarModelos(),
      listarGrupos(),
    ]);
    setAgenda(items);
    setAlumnos(personas);
    setFeriados(diasFeriados);
    setModelos(modelosCargados);
    setGrupos(gruposCargados);
  }, [cursor]);

  useFocusEffect(useCallback(() => {
    void cargar();
  }, [cargar]));

  const seleccion = useMemo(
    () => seleccionarDatosDelDia(
      agenda,
      feriados,
      grupos,
      fechaSeleccionada,
      grupoSeleccionadoId
    ),
    [agenda, feriados, grupos, fechaSeleccionada, grupoSeleccionadoId]
  );

  const cambiarMes = useCallback((incremento: number) => {
    setCursor(actual => new Date(
      actual.getFullYear(),
      actual.getMonth() + incremento,
      1
    ));
  }, []);

  return {
    hoyTexto,
    cursor,
    setCursor,
    cambiarMes,
    agenda,
    alumnos,
    feriados,
    modelos,
    grupos,
    cargar,
    personasSeleccionadas: seleccion.personas,
    feriadoSeleccionado: seleccion.feriado,
    grupoDestinoSeleccionado: seleccion.grupoDestino,
    idsOcupadosSeleccionados: seleccion.idsOcupados,
  };
}
