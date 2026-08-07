import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { AddButton, Empty, Screen, ui } from "@/components/ui";
import { AgregarPersonaModal } from "@/components/agenda/AgregarPersonaModal";
import { CalendarioFechaModal } from "@/components/agenda/CalendarioFechaModal";
import { ModeloPersonaModal } from "@/components/agenda/ModeloPersonaModal";
import { CalendarioMes } from "@/components/calendario/CalendarioMes";
import { DetalleDiaModal } from "@/components/calendario/DetalleDiaModal";
import { GrupoFormModal } from "@/components/calendario/GrupoFormModal";
import { useCalendarioData } from "@/hooks/useCalendarioData";
import {
  asignarModeloAgenda, asignarRecuperacion, cambiarClaseParaCubrir,
  moverAgendaDelDia, quitarFechaAgenda, registrarAusencia, revertirAusencia,
} from "@/repositories/agendaRepository";
import { fijarAlumnoEnGrupo } from "@/repositories/alumnoRepository";
import { guardarFeriado, quitarFeriado } from "@/repositories/feriadoRepository";
import { colors, groupColors } from "@/lib/theme";
import { textoHorarioAviso } from "@/lib/horarios";
import { notificacionesDisponibles, reprogramarNotificaciones } from "@/lib/notifications";
import { TipoOcupacion } from "@/lib/seleccionAgenda";
import { textoFrecuenciaGrupo } from "@/lib/grupos";
import { motivoMovimientoClase } from "@/lib/movimientosClase";
import { AgendaAlumno, Grupo, TipoMovimientoClase } from "@/models";

const diasCompletos = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [detailGroupId, setDetailGroupId] = useState<number | null>(null);
  const {
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
    personasSeleccionadas: selectedEntries,
    feriadoSeleccionado: selectedHoliday,
    grupoDestinoSeleccionado,
    idsOcupadosSeleccionados,
  } = useCalendarioData(selectedDate, detailGroupId);
  const [grupoEditor, setGrupoEditor] = useState<{
    grupo: Grupo | null;
    fechaInicial: string;
    colorInicial: string;
  } | null>(null);
  const [guardandoAsistencia, setGuardandoAsistencia] = useState<number | null>(null);
  const [selectorAlumnoVisible, setSelectorAlumnoVisible] = useState(false);
  const [selectorFechaVisible, setSelectorFechaVisible] = useState(false);
  const [motivoMovimiento, setMotivoMovimiento] = useState<TipoMovimientoClase | null>(null);
  const [selectorModeloVisible, setSelectorModeloVisible] = useState(false);
  const [editAgenda, setEditAgenda] = useState<AgendaAlumno | null>(null);

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
  }, [params.fecha, params.grupoId, params.alumnoId, setCursor]);

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
      router.setParams({ alumnoId: undefined });
    }
  }, [agenda, params.alumnoId, selectedDate, detailGroupId]);

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
          onCambiarMes={cambiarMes}
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

      <DetalleDiaModal
        visible={!!selectedDate && !selectorAlumnoVisible && !selectorFechaVisible && !selectorModeloVisible}
        fecha={selectedDate}
        esDetalleGrupo={!!detailGroupId}
        personas={selectedEntries}
        feriado={selectedHoliday}
        hoy={hoyTexto}
        guardandoAsistencia={guardandoAsistencia}
        onClose={() => {
          setSelectedDate(null);
          setEditAgenda(null);
        }}
        onCrearGrupo={fecha => {
          setSelectedDate(null);
          setDetailGroupId(null);
          abrirNuevoGrupo(fecha);
        }}
        onEditarModelo={abrirEdicionModelo}
        onQuitar={quitar}
        onCambiarAsistencia={cambiarAsistencia}
        onAgregarPersona={() => setSelectorAlumnoVisible(true)}
        onMoverClase={elegirMotivoMovimiento}
        onDeshacerMovimiento={confirmarDesmarcarFeriado}
      />

      <AgregarPersonaModal
        visible={selectorAlumnoVisible}
        alumnos={alumnos}
        agenda={agenda}
        fecha={selectedDate || hoyTexto}
        idsOcupados={idsOcupadosSeleccionados}
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
  groupCard: { minHeight: 76, padding: 13, borderRadius: 15, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 11 },
  groupColor: { width: 6, alignSelf: "stretch", borderRadius: 4 },
  groupName: { color: colors.ink, fontSize: 15, fontWeight: "900" },
  groupMeta: { color: colors.muted, fontSize: 11, marginTop: 3 },
  groupFrequency: { color: colors.clay, fontSize: 10, fontWeight: "900", marginTop: 3 },
  groupNotification: { fontSize: 10, fontWeight: "800", marginTop: 4 },
  groupEditIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
});
