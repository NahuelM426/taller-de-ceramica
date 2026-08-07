import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { AddButton, Empty, FormModal, Screen, ui } from "@/components/ui";
import { AgregarPersonaModal } from "@/components/agenda/AgregarPersonaModal";
import { CalendarioFechaModal } from "@/components/agenda/CalendarioFechaModal";
import { ModeloPersonaModal } from "@/components/agenda/ModeloPersonaModal";
import { CalendarioMes } from "@/components/calendario/CalendarioMes";
import { GrupoFormModal } from "@/components/calendario/GrupoFormModal";
import {
  agendaDelMes, asignarModeloAgenda, asignarRecuperacion, cambiarClaseParaCubrir,
  moverAgendaDelDia, quitarFechaAgenda, registrarAusencia, revertirAusencia,
} from "@/repositories/agendaRepository";
import { fijarAlumnoEnGrupo, listarAlumnos } from "@/repositories/alumnoRepository";
import { guardarFeriado, listarFeriados, quitarFeriado } from "@/repositories/feriadoRepository";
import { listarGrupos } from "@/repositories/grupoRepository";
import { listarModelos } from "@/repositories/modeloRepository";
import { colors, groupColors } from "@/lib/theme";
import { textoHorarioAviso } from "@/lib/horarios";
import { notificacionesDisponibles, reprogramarNotificaciones } from "@/lib/notifications";
import { TipoOcupacion } from "@/lib/seleccionAgenda";
import { grupoOcurreEnFecha, textoFrecuenciaGrupo } from "@/lib/grupos";
import { etiquetaRecuperacion, motivoMovimientoClase } from "@/lib/movimientosClase";
import { AgendaAlumno, Alumno, Feriado, Grupo, Modelo, TipoMovimientoClase } from "@/models";

const diasCompletos = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const SIN_NECESIDADES = "No necesita";
const iso = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const proximaFechaDelDia = (dia: number, desde: string) => {
  const fecha = new Date(`${desde}T12:00:00`);
  while (fecha.getDay() !== dia) fecha.setDate(fecha.getDate() + 1);
  return iso(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
};

export default function CalendarioScreen() {
  const params = useLocalSearchParams<{ fecha?: string; grupoId?: string; alumnoId?: string }>();
  const handledRoute = useRef("");
  const handledAlumno = useRef("");
  const today = new Date();
  const hoyTexto = iso(today.getFullYear(), today.getMonth(), today.getDate());
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [agenda, setAgenda] = useState<AgendaAlumno[]>([]);
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [feriados, setFeriados] = useState<Feriado[]>([]);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [grupoEditor, setGrupoEditor] = useState<{
    grupo: Grupo | null;
    fechaInicial: string;
    colorInicial: string;
  } | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [detailGroupId, setDetailGroupId] = useState<number | null>(null);
  const [guardandoAsistencia, setGuardandoAsistencia] = useState<number | null>(null);
  const [selectorAlumnoVisible, setSelectorAlumnoVisible] = useState(false);
  const [selectorFechaVisible, setSelectorFechaVisible] = useState(false);
  const [motivoMovimiento, setMotivoMovimiento] = useState<TipoMovimientoClase | null>(null);
  const [selectorModeloVisible, setSelectorModeloVisible] = useState(false);
  const [editAgenda, setEditAgenda] = useState<AgendaAlumno | null>(null);

  const cargar = useCallback(async () => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const last = new Date(year, month + 1, 0).getDate();
    const inicio = iso(year, month, 1), fin = iso(year, month, last);
    const finAgendaDate = new Date(year, month, last, 12);
    finAgendaDate.setDate(finAgendaDate.getDate() + 60);
    const finAgenda = iso(
      finAgendaDate.getFullYear(), finAgendaDate.getMonth(), finAgendaDate.getDate()
    );
    const [items, personas, diasFeriados, modelosCargados, gruposCargados] = await Promise.all([
      agendaDelMes(inicio, finAgenda), listarAlumnos(), listarFeriados(inicio, fin),
      listarModelos(), listarGrupos(),
    ]);
    setAgenda(items); setAlumnos(personas); setFeriados(diasFeriados);
    setModelos(modelosCargados); setGrupos(gruposCargados);
  }, [cursor]);
  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));
  useFocusEffect(useCallback(() => () => {
    handledRoute.current = "";
    handledAlumno.current = "";
  }, []));

  useEffect(() => {
    if (!params.fecha) return;
    const key = `${params.fecha}|${params.grupoId || ""}|${params.alumnoId || ""}`;
    if (handledRoute.current === key) return;
    handledRoute.current = key;
    handledAlumno.current = "";
    const fecha = new Date(`${params.fecha}T12:00:00`);
    setCursor(new Date(fecha.getFullYear(), fecha.getMonth(), 1));
    setSelectedDate(params.fecha);
    setDetailGroupId(Number(params.grupoId) || null);
  }, [params.fecha, params.grupoId, params.alumnoId]);

  useEffect(() => {
    if (!params.alumnoId || !selectedDate) return;
    const key = `${selectedDate}|${detailGroupId || ""}|${params.alumnoId}`;
    if (handledAlumno.current === key) return;
    const item = agenda.find(entry =>
      entry.fecha === selectedDate &&
      entry.alumno_id === Number(params.alumnoId) &&
      (!detailGroupId || entry.grupo_id === detailGroupId)
    );
    if (item) {
      handledAlumno.current = key;
      setEditAgenda(item);
      setSelectorModeloVisible(true);
    }
  }, [agenda, params.alumnoId, selectedDate, detailGroupId]);

  const selectedEntries = agenda.filter(item =>
    item.fecha === selectedDate && (!detailGroupId || item.grupo_id === detailGroupId)
  );
  const selectedHoliday = feriados.find(item => item.fecha === selectedDate);
  const idsGruposConAgendaSeleccionada = new Set(
    agenda.filter(item => item.fecha === selectedDate).map(item => item.grupo_id)
  );
  const gruposFechaSeleccionada = selectedDate
    ? grupos.filter(item =>
        grupoOcurreEnFecha(item, selectedDate) || idsGruposConAgendaSeleccionada.has(item.id)
      )
    : [];
  const grupoDestinoSeleccionado = detailGroupId
    ? grupos.find(item => item.id === detailGroupId) || null
    : gruposFechaSeleccionada.length === 1 ? gruposFechaSeleccionada[0] : null;

  const abrirDia = (date: string) => {
    setSelectedDate(date); setDetailGroupId(null);
    setEditAgenda(null);
  };
  const cambiarAsistencia = async (item: AgendaAlumno, viene: boolean) => {
    const yaViene = item.estado !== "ausente";
    if (yaViene === viene || guardandoAsistencia) return;
    setGuardandoAsistencia(item.id);
    try {
      if (viene) {
        await revertirAusencia(item.alumno_id, item.grupo_id, item.fecha);
      } else {
        await registrarAusencia(item.alumno_id, item.grupo_id, item.fecha);
      }
      await reprogramarNotificaciones(false);
      await cargar();
    } catch {
      Alert.alert("No se pudo guardar", "Probá nuevamente en unos segundos.");
    } finally {
      setGuardandoAsistencia(null);
    }
  };
  const quitar = (item: AgendaAlumno) => Alert.alert(
    "Quitar esta fecha",
    `${item.alumno_nombre} dejará de estar programado el ${item.fecha}.`,
    [
      { text: "Cancelar", style: "cancel" },
      { text: "Quitar", style: "destructive", onPress: async () => {
        await quitarFechaAgenda(item.id);
        await reprogramarNotificaciones(false);
        await cargar();
      } },
    ]
  );
  const agregar = async (alumnoId: number, tipo: TipoOcupacion) => {
    const alumno = alumnos.find(item => item.id === alumnoId);
    if (!alumno || !selectedDate) return false;
    if (selectedDate < hoyTexto) {
      Alert.alert("Fecha pasada", "Los lugares disponibles se administran desde hoy en adelante.");
      return false;
    }
    const grupoDestinoId = grupoDestinoSeleccionado?.id || null;
    if (!grupoDestinoId) {
      Alert.alert("Elegí un grupo", "Este día tiene más de un grupo. Abrí el grupo específico y volvé a agregar la persona.");
      return false;
    }
    const origen = agenda.find(item =>
      item.alumno_id === alumno.id && item.tipo === "regular" &&
      item.estado === "programada" && item.fecha >= selectedDate &&
      item.grupo_id === alumno.grupo_id
    );
    try {
      if (tipo === "recuperacion") {
        await asignarRecuperacion(alumno.id, grupoDestinoId, selectedDate);
      } else if (tipo === "fijar") {
        await fijarAlumnoEnGrupo(alumno.id, grupoDestinoId, selectedDate);
      } else {
        if (!origen) throw new Error("No hay una próxima clase habitual para cambiar");
        await cambiarClaseParaCubrir(alumno.id, origen.id, grupoDestinoId, selectedDate);
      }
      await reprogramarNotificaciones(false);
      setSelectorAlumnoVisible(false);
      await cargar();
      return true;
    } catch (error) {
      Alert.alert(
        "No se pudo agregar",
        error instanceof Error ? error.message : "Revisá la opción elegida e intentá nuevamente."
      );
      return false;
    }
  };
  const abrirEdicionModelo = (item: AgendaAlumno) => {
    setEditAgenda(item);
    setSelectorModeloVisible(true);
  };
  const guardarModelo = async (modeloId: number | null, necesidades: string) => {
    if (!editAgenda) return false;
    try {
      await asignarModeloAgenda(editAgenda.id, modeloId, necesidades);
      setSelectorModeloVisible(false);
      setEditAgenda(null);
      await reprogramarNotificaciones(false);
      await cargar();
      return true;
    } catch {
      Alert.alert("No se pudo guardar", "Probá nuevamente en unos segundos.");
      return false;
    }
  };
  const moverClaseCompleta = async (fechaRecuperacion: string) => {
    if (!selectedDate || !motivoMovimiento) return;
    try {
      await guardarFeriado(
        selectedDate,
        motivoMovimientoClase(motivoMovimiento),
        fechaRecuperacion,
        motivoMovimiento
      );
      await moverAgendaDelDia(selectedDate, fechaRecuperacion, motivoMovimiento);
      await reprogramarNotificaciones(false);
      setSelectorFechaVisible(false);
      setMotivoMovimiento(null);
      await cargar();
    } catch {
      Alert.alert("No se pudo guardar", "Revisá la fecha de recuperación e intentá nuevamente.");
    }
  };
  const elegirMotivoMovimiento = () => Alert.alert(
    "¿Por qué se mueve la clase?",
    "Después elegís la fecha en la que recuperan.",
    [
      {
        text: "Feriado",
        onPress: () => {
          setMotivoMovimiento("feriado");
          setSelectorFechaVisible(true);
        },
      },
      {
        text: "Compromiso",
        onPress: () => {
          setMotivoMovimiento("compromiso");
          setSelectorFechaVisible(true);
        },
      },
      { text: "Cancelar", style: "cancel" },
    ]
  );
  const desmarcarFeriado = async () => {
    if (!selectedDate) return;
    try {
      await quitarFeriado(selectedDate);
      await reprogramarNotificaciones(false);
      await cargar();
    } catch (error) {
      Alert.alert(
        "No se pudo volver atrás",
        error instanceof Error ? error.message : "Revisá las clases cargadas e intentá nuevamente."
      );
    }
  };
  const confirmarDesmarcarFeriado = () => {
    if (!selectedHoliday) return;
    const recuperacion = selectedHoliday.fecha_recuperacion
      ? `${selectedHoliday.fecha_recuperacion.slice(8, 10)}/${selectedHoliday.fecha_recuperacion.slice(5, 7)}`
      : "la fecha de recuperación";
    Alert.alert(
      "Quitar movimiento y volver atrás",
      `Las personas trasladadas desde este día volverán desde ${recuperacion} a su fecha original.`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Volver atrás", style: "destructive", onPress: desmarcarFeriado },
      ]
    );
  };
  const abrirNuevoGrupo = (fechaInicial?: string) => {
    const fechaBase = fechaInicial || proximaFechaDelDia(1, hoyTexto);
    setGrupoEditor({
      grupo: null,
      fechaInicial: fechaBase,
      colorInicial: groupColors[grupos.length % groupColors.length],
    });
  };

  const abrirEditarGrupo = (grupo: Grupo) => {
    setGrupoEditor({
      grupo,
      fechaInicial: grupo.fecha_inicio || proximaFechaDelDia(grupo.dia, hoyTexto),
      colorInicial: grupo.color,
    });
  };

  return (
    <Screen
      title="Calendario"
      subtitle="Tocá un día para organizar quién viene"
      action={<AddButton onPress={() => abrirNuevoGrupo()} />}
    >
      <ScrollView contentContainerStyle={ui.list}>
        <CalendarioMes
          cursor={cursor}
          hoy={hoyTexto}
          agenda={agenda}
          feriados={feriados}
          grupos={grupos}
          onCambiarMes={incremento => setCursor(new Date(
            cursor.getFullYear(), cursor.getMonth() + incremento, 1
          ))}
          onAbrirDia={abrirDia}
        />
        <View style={styles.tip}>
          <Ionicons name="information-circle-outline" size={21} color={colors.primary} />
          <Text style={styles.tipText}>Cada grupo define si viene todas las semanas o cada 15 días. Después cada fecha se puede mover o ajustar manualmente.</Text>
        </View>
        <Pressable
          onPress={() => router.push("/(tabs)/modelos" as never)}
          style={styles.modelsAccess}
        >
          <View style={styles.modelsIcon}>
            <Ionicons name="color-palette-outline" size={22} color={colors.clay} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.modelsTitle}>Modelos para ofrecer</Text>
            <Text style={styles.modelsText}>
              {modelos.length} opciones cargadas · crear o editar modelos
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={19} color={colors.clay} />
        </Pressable>
        <Text style={ui.sectionLabel}>GRUPOS DEL TALLER</Text>
        {!grupos.length && (
          <Empty
            title="Todavía no hay grupos"
            text="Tocá el botón + de arriba para crear el primer día y horario del taller."
          />
        )}
        {grupos.map(grupo => (
          <Pressable key={grupo.id} onPress={() => abrirEditarGrupo(grupo)} style={styles.groupCard}>
            <View style={[styles.groupColor, { backgroundColor: grupo.color }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.groupName}>{grupo.nombre}</Text>
              <Text style={styles.groupMeta}>
                {diasCompletos[grupo.dia]} · {grupo.hora} · {grupo.capacidad} lugares
              </Text>
              <Text style={styles.groupFrequency}>{textoFrecuenciaGrupo(grupo)}</Text>
              <Text style={[styles.groupNotification, { color: grupo.notificacion ? colors.success : colors.muted }]}>
                {grupo.notificacion
                  ? `Aviso ${textoHorarioAviso(grupo.hora, grupo.minutos_antes)}${notificacionesDisponibles() ? "" : " · en la app instalada"}`
                  : "Sin notificación"}
              </Text>
            </View>
            <View style={styles.groupEditIcon}>
              <Ionicons name="pencil-outline" size={17} color={colors.primary} />
            </View>
          </Pressable>
        ))}
      </ScrollView>

      {!!grupoEditor && (
        <GrupoFormModal
          grupo={grupoEditor.grupo}
          fechaInicial={grupoEditor.fechaInicial}
          colorInicial={grupoEditor.colorInicial}
          hoy={hoyTexto}
          cantidadIntegrantes={grupoEditor.grupo
            ? alumnos.filter(alumno =>
                !alumno.sin_grupo && alumno.grupo_id === grupoEditor.grupo?.id
              ).length
            : 0}
          onClose={() => setGrupoEditor(null)}
          onSaved={async () => {
            setGrupoEditor(null);
            await cargar();
          }}
          onDeleted={async () => {
            setGrupoEditor(null);
            await cargar();
          }}
        />
      )}

      <FormModal
        visible={!!selectedDate && !selectorAlumnoVisible && !selectorFechaVisible && !selectorModeloVisible}
        title={detailGroupId ? "Detalle del grupo" : selectedDate ? `Día ${selectedDate.slice(8, 10)}` : "Organizar día"}
        onClose={() => { setSelectedDate(null); setEditAgenda(null); }}
        onSave={() => { setSelectedDate(null); setEditAgenda(null); }}
      >
        <View style={[
          styles.daySummary,
          selectedHoliday && {
            backgroundColor: selectedHoliday.tipo === "compromiso" ? colors.claySoft : "#FFF0EF",
          },
        ]}> 
          <Text style={styles.daySummaryTitle}>{selectedDate}</Text>
          <Text style={styles.daySummaryText}>
            {selectedHoliday
              ? `${selectedHoliday.motivo}${selectedHoliday.fecha_recuperacion
                  ? ` · Recuperan el ${selectedHoliday.fecha_recuperacion.slice(8, 10)}/${selectedHoliday.fecha_recuperacion.slice(5, 7)}/${selectedHoliday.fecha_recuperacion.slice(0, 4)}`
                  : ""}`
              : `${selectedEntries.length} persona${selectedEntries.length === 1 ? "" : "s"} programada${selectedEntries.length === 1 ? "" : "s"}`}
          </Text>
          <Pressable
            onPress={() => {
              if (!selectedDate) return;
              const fecha = selectedDate;
              setSelectedDate(null);
              setDetailGroupId(null);
              abrirNuevoGrupo(fecha);
            }}
            style={styles.addGroupInSummary}
          >
            <Ionicons name="add" size={20} color="white" />
            <Text style={styles.addGroupInSummaryText}>Crear grupo</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>PERSONAS DE ESTE DÍA</Text>
        {!selectedEntries.length && <Text style={styles.emptyText}>Todavía no hay personas cargadas para este día.</Text>}
        {selectedEntries.map(item => (
          <View key={item.id} style={[styles.personRow, { borderLeftColor: item.grupo_color }]}>
            <View style={styles.personHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.personName}>{item.alumno_nombre}</Text>
                <Text style={styles.personMeta}>
                  {item.hora} · {item.grupo_nombre}
                  {item.feriado_origen
                    ? ` · ${etiquetaRecuperacion(item.motivo_movimiento, item.feriado_origen)}`
                    : item.tipo === "recuperacion" ? " · Recuperación" : ""}
                </Text>
                <Text style={[styles.personModel, !item.modelo_id && item.necesidades !== SIN_NECESIDADES && { color: colors.warning }]}>
                  {item.necesidades === SIN_NECESIDADES
                    ? "No necesita modelo"
                    : item.modelo_nombre || "Falta preguntarle qué modelo quiere"}
                </Text>
                {!!item.necesidades && (
                  <Text style={styles.personNeeds}>
                    {item.necesidades === SIN_NECESIDADES
                      ? "No necesita molde ni materiales"
                      : `Necesita: ${item.necesidades}`}
                  </Text>
                )}
              </View>
              <View style={styles.personActions}>
                <Pressable onPress={() => abrirEdicionModelo(item)} style={styles.modelEditButton}>
                  <Ionicons name="color-palette-outline" size={15} color={colors.primary} />
                  <Text style={styles.modelEditText}>Modelo</Text>
                </Pressable>
                <Pressable onPress={() => quitar(item)} style={styles.deleteButton}>
                  <Ionicons name="close" size={15} color={colors.danger} />
                  <Text style={styles.deleteButtonText}>Quitar</Text>
                </Pressable>
              </View>
            </View>
            <Text style={styles.attendanceLabel}>¿Viene a esta clase?</Text>
            <View style={styles.attendanceChoices}>
              <Pressable
                disabled={guardandoAsistencia === item.id}
                onPress={() => cambiarAsistencia(item, true)}
                style={[
                  styles.attendanceChoice,
                  item.estado !== "ausente" && styles.attendanceYes,
                ]}
              >
                <Ionicons
                  name={item.estado !== "ausente" ? "radio-button-on" : "radio-button-off"}
                  size={17}
                  color={item.estado !== "ausente" ? colors.success : colors.muted}
                />
                <Text style={[styles.attendanceText, item.estado !== "ausente" && { color: colors.success }]}>Sí, viene</Text>
              </Pressable>
              <Pressable
                disabled={guardandoAsistencia === item.id}
                onPress={() => cambiarAsistencia(item, false)}
                style={[
                  styles.attendanceChoice,
                  item.estado === "ausente" && styles.attendanceNo,
                ]}
              >
                <Ionicons
                  name={item.estado === "ausente" ? "radio-button-on" : "radio-button-off"}
                  size={17}
                  color={item.estado === "ausente" ? colors.danger : colors.muted}
                />
                <Text style={[styles.attendanceText, item.estado === "ausente" && { color: colors.danger }]}>No viene</Text>
              </Pressable>
            </View>
          </View>
        ))}
        {!!selectedDate && selectedDate >= hoyTexto && <>
          <Text style={styles.sectionTitle}>AGREGAR UNA PERSONA</Text>
          <Pressable onPress={() => setSelectorAlumnoVisible(true)} style={styles.personPickerButton}>
            <View style={styles.personPickerIcon}>
              <Ionicons name="person-add-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.personPickerTitle}>Elegir persona</Text>
              <Text style={styles.personPickerText}>Buscar, elegir cómo ocupa el lugar y confirmar</Text>
            </View>
            <Ionicons name="chevron-forward" size={19} color={colors.primary} />
          </Pressable>
        </>}

        <Text style={styles.sectionTitle}>MOVER ESTA CLASE</Text>
        {!selectedHoliday ? (
          <Pressable onPress={elegirMotivoMovimiento} style={styles.datePickerButton}>
            <View style={styles.datePickerIcon}>
              <Ionicons name="calendar-outline" size={20} color={colors.clay} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.datePickerTitle}>Mover esta clase</Text>
              <Text style={styles.datePickerText}>Elegir motivo y fecha de recuperación</Text>
            </View>
            <Ionicons name="chevron-forward" size={19} color={colors.clay} />
          </Pressable>
        ) : (
          <Pressable onPress={confirmarDesmarcarFeriado} style={styles.holidayButton}>
            <Text style={styles.holidayButtonText}>Quitar movimiento y volver atrás</Text>
          </Pressable>
        )}
      </FormModal>

      <AgregarPersonaModal
        visible={selectorAlumnoVisible}
        alumnos={alumnos}
        agenda={agenda}
        fecha={selectedDate || hoyTexto}
        idsOcupados={agenda.filter(item => item.fecha === selectedDate).map(item => item.alumno_id)}
        grupoDestino={grupoDestinoSeleccionado}
        onClose={() => setSelectorAlumnoVisible(false)}
        onConfirm={agregar}
      />
      <CalendarioFechaModal
        visible={selectorFechaVisible}
        titulo={motivoMovimiento === "feriado"
          ? "¿Qué fecha recuperan el feriado?"
          : "¿Qué fecha recuperan la clase?"}
        fechaMinima={hoyTexto}
        fechaExcluida={selectedDate || undefined}
        onClose={() => {
          setSelectorFechaVisible(false);
          setMotivoMovimiento(null);
        }}
        onConfirm={moverClaseCompleta}
      />
      <ModeloPersonaModal
        visible={selectorModeloVisible}
        alumnoNombre={editAgenda?.alumno_nombre || "la persona"}
        modelos={modelos}
        modeloId={editAgenda?.modelo_id || null}
        necesidadesIniciales={editAgenda?.necesidades || ""}
        onClose={() => {
          setSelectorModeloVisible(false);
          setEditAgenda(null);
        }}
        onConfirm={guardarModelo}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  tip: { flexDirection: "row", gap: 9, padding: 14, borderRadius: 14, backgroundColor: colors.primarySoft },
  tipText: { flex: 1, color: colors.primaryDark, fontSize: 12, lineHeight: 18 },
  modelsAccess: { minHeight: 72, padding: 13, borderRadius: 15, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 11 },
  modelsIcon: { width: 43, height: 43, borderRadius: 13, backgroundColor: colors.claySoft, alignItems: "center", justifyContent: "center" },
  modelsTitle: { color: colors.ink, fontSize: 14, fontWeight: "900" },
  modelsText: { color: colors.muted, fontSize: 10, marginTop: 3 },
  daySummary: { padding: 15, borderRadius: 14, backgroundColor: colors.primarySoft },
  daySummaryTitle: { color: colors.ink, fontSize: 19, fontWeight: "900" },
  daySummaryText: { color: colors.muted, fontSize: 12, marginTop: 4 },
  addGroupInSummary: { minHeight: 42, marginTop: 14, borderRadius: 11, backgroundColor: colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  addGroupInSummaryText: { color: "white", fontSize: 12, fontWeight: "900" },
  sectionTitle: { color: colors.muted, fontSize: 11, fontWeight: "900", letterSpacing: .8, marginTop: 4 },
  emptyText: { color: colors.muted, fontSize: 13, fontStyle: "italic" },
  personRow: { minHeight: 58, gap: 9, padding: 11, borderRadius: 12, borderLeftWidth: 5, backgroundColor: "white", borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  personHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  personActions: { alignItems: "stretch", gap: 6 },
  personName: { color: colors.ink, fontSize: 14, fontWeight: "900" },
  personMeta: { color: colors.muted, fontSize: 10, marginTop: 3 },
  personModel: { color: colors.primary, fontSize: 11, fontWeight: "900", marginTop: 5 },
  personNeeds: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 2 },
  modelEditButton: { minHeight: 34, paddingHorizontal: 8, borderRadius: 9, backgroundColor: colors.primarySoft, flexDirection: "row", alignItems: "center", gap: 4 },
  modelEditText: { color: colors.primary, fontSize: 9, fontWeight: "900" },
  deleteButton: { minHeight: 34, paddingHorizontal: 8, borderRadius: 9, backgroundColor: "#FFF0EF", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  deleteButtonText: { color: colors.danger, fontSize: 9, fontWeight: "900" },
  attendanceLabel: { color: colors.muted, fontSize: 11, fontWeight: "800", marginTop: 2 },
  attendanceChoices: { flexDirection: "row", gap: 7 },
  attendanceChoice: { flex: 1, minHeight: 39, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: "white", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  attendanceYes: { borderColor: colors.success, backgroundColor: `${colors.success}12` },
  attendanceNo: { borderColor: colors.danger, backgroundColor: `${colors.danger}10` },
  attendanceText: { color: colors.muted, fontSize: 11, fontWeight: "900" },
  personPickerButton: { minHeight: 66, padding: 12, borderRadius: 13, borderWidth: 1, borderColor: "#BCD2CA", backgroundColor: colors.primarySoft, flexDirection: "row", alignItems: "center", gap: 10 },
  personPickerIcon: { width: 39, height: 39, borderRadius: 12, backgroundColor: "white", alignItems: "center", justifyContent: "center" },
  personPickerTitle: { color: colors.primary, fontSize: 14, fontWeight: "900" },
  personPickerText: { color: colors.muted, fontSize: 10, marginTop: 3 },
  datePickerButton: { minHeight: 66, padding: 12, borderRadius: 13, borderWidth: 1, borderColor: "#E5C8B8", backgroundColor: colors.claySoft, flexDirection: "row", alignItems: "center", gap: 10 },
  datePickerIcon: { width: 39, height: 39, borderRadius: 12, backgroundColor: "white", alignItems: "center", justifyContent: "center" },
  datePickerTitle: { color: colors.clay, fontSize: 14, fontWeight: "900" },
  datePickerText: { color: colors.muted, fontSize: 10, marginTop: 3 },
  holidayButton: { minHeight: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF0EF", borderWidth: 1, borderColor: "#F0C5C0" },
  holidayButtonText: { color: colors.danger, fontSize: 13, fontWeight: "900" },
  groupCard: { minHeight: 76, padding: 13, borderRadius: 15, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 11 },
  groupColor: { width: 6, alignSelf: "stretch", borderRadius: 4 },
  groupName: { color: colors.ink, fontSize: 15, fontWeight: "900" },
  groupMeta: { color: colors.muted, fontSize: 11, marginTop: 3 },
  groupFrequency: { color: colors.clay, fontSize: 10, fontWeight: "900", marginTop: 3 },
  groupNotification: { fontSize: 10, fontWeight: "800", marginTop: 4 },
  groupEditIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
});
