import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Empty, Screen, ui } from "@/components/ui";
import { AgregarPersonaModal } from "@/components/agenda/AgregarPersonaModal";
import {
  agendaDelMes, asignarRecuperacion, cambiarClaseParaCubrir,
  registrarAusencia, revertirAusencia,
} from "@/repositories/agendaRepository";
import { fijarAlumnoEnGrupo, listarAlumnos } from "@/repositories/alumnoRepository";
import { listarFeriados } from "@/repositories/feriadoRepository";
import { listarGrupos } from "@/repositories/grupoRepository";
import { colors } from "@/lib/theme";
import { estadoCopiaSeguridad } from "@/lib/copiaSeguridad";
import { reprogramarNotificaciones } from "@/lib/notifications";
import { TipoOcupacion } from "@/lib/seleccionAgenda";
import { etiquetaRecuperacion } from "@/lib/movimientosClase";
import {
  armarClases, armarVacantes, calcularLugaresDisponibles, calcularVacantesLiberadas, fechaLocal,
  mensajeRecordatorio,
} from "@/lib/vacantes";
import { AgendaAlumno, Alumno, Grupo } from "@/models";

const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export default function HoyScreen() {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [agendaProxima, setAgendaProxima] = useState<AgendaAlumno[]>([]);
  const [feriados, setFeriados] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [detallesAbiertos, setDetallesAbiertos] = useState<Record<string, boolean>>({});
  const [guardandoAsistencia, setGuardandoAsistencia] = useState<number | null>(null);
  const [grupoParaAgregar, setGrupoParaAgregar] = useState<{ grupo: Grupo; fecha: string } | null>(null);
  const [selectorAlumnoVisible, setSelectorAlumnoVisible] = useState(false);
  const [copiaPendiente, setCopiaPendiente] = useState(false);
  const [diasDesdeCopia, setDiasDesdeCopia] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    const fin = new Date();
    fin.setDate(fin.getDate() + 60);
    const inicioTexto = fechaLocal();
    const finTexto = fechaLocal(fin);
    const [g, a, agenda, feriadosCargados, estadoCopia] = await Promise.all([
      listarGrupos(), listarAlumnos(), agendaDelMes(inicioTexto, finTexto),
      listarFeriados(inicioTexto, finTexto), estadoCopiaSeguridad(),
    ]);
    setGrupos(g);
    setAlumnos(a);
    setAgendaProxima(agenda);
    setFeriados(feriadosCargados.map(item => item.fecha));
    setCopiaPendiente(estadoCopia.copiaPendiente);
    setDiasDesdeCopia(estadoCopia.diasDesdeUltima);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const clasesVisibles = useMemo(
    () => armarClases(grupos, agendaProxima, feriados, new Date(), 15),
    [grupos, agendaProxima, feriados]
  );

  const vacantes = useMemo(
    () => armarVacantes(grupos, agendaProxima, feriados),
    [grupos, agendaProxima, feriados]
  );

  const guardarPersonaEnGrupo = async (alumnoId: number, tipo: TipoOcupacion) => {
    if (!grupoParaAgregar) return false;
    const alumno = alumnos.find(item => item.id === alumnoId);
    const origen = agendaProxima.find(item =>
      item.alumno_id === alumnoId &&
      item.tipo === "regular" &&
      item.estado === "programada" &&
      item.fecha >= grupoParaAgregar.fecha &&
      item.grupo_id === alumno?.grupo_id
    );
    try {
      if (tipo === "recuperacion") {
        await asignarRecuperacion(
          alumnoId, grupoParaAgregar.grupo.id, grupoParaAgregar.fecha
        );
      } else if (tipo === "fijar") {
        await fijarAlumnoEnGrupo(
          alumnoId, grupoParaAgregar.grupo.id, grupoParaAgregar.fecha
        );
      } else {
        if (!origen) throw new Error("No hay una próxima clase habitual para cambiar");
        await cambiarClaseParaCubrir(
          alumnoId, origen.id, grupoParaAgregar.grupo.id, grupoParaAgregar.fecha
        );
      }
      await reprogramarNotificaciones(false);
      setSelectorAlumnoVisible(false);
      setGrupoParaAgregar(null);
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

  const compartirRecordatorio = async (mensaje: string) => {
    try {
      await Share.share(
        { message: mensaje, title: "Recordatorio de clase" },
        { dialogTitle: "Compartir recordatorio" }
      );
    } catch {
      Alert.alert("No se pudo compartir", "Probá nuevamente en unos segundos.");
    }
  };

  return (
    <Screen title="Agenda del taller" subtitle={`${alumnos.length} alumnos · ${grupos.length} grupos`}>
      <ScrollView
        contentContainerStyle={ui.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={cargar} />}
      >
        {copiaPendiente && (
          <Pressable
            onPress={() => router.push("/(tabs)/respaldo" as never)}
            style={styles.backupReminder}
          >
            <View style={styles.backupReminderIcon}>
              <Ionicons name="cloud-upload-outline" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.backupReminderTitle}>Copia semanal pendiente</Text>
              <Text style={styles.backupReminderText}>
                {diasDesdeCopia === null
                  ? "Todavía no guardaste una copia del taller."
                  : `La última copia fue hace ${diasDesdeCopia} días.`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={19} color={colors.primary} />
          </Pressable>
        )}
        <View style={styles.stats}>
          <Stat
            icon="people"
            value={String(alumnos.length)}
            label="Alumnos"
            color={colors.clay}
            onPress={() => router.push("/(tabs)/alumnos")}
          />
          <Stat
            icon="megaphone"
            value={String(vacantes.length)}
            label="Próximas vacantes"
            color={colors.success}
            onPress={() => router.push("/(tabs)/vacantes" as never)}
          />
        </View>

        <Text style={ui.sectionLabel}>CLASES DE LOS PRÓXIMOS 15 DÍAS</Text>
        {!clasesVisibles.length && (
          <Empty
            title={grupos.length ? "No hay clases próximas" : "El taller está vacío"}
            text={grupos.length
              ? "Revisá la organización desde el calendario mensual."
              : "Empezá creando el primer grupo desde la pestaña Mes."}
          />
        )}
        {clasesVisibles.map(clase => {
          const { grupo, fecha: fechaGrupo, agenda: agendaClase } = clase;
          const inscriptos = agendaClase.map(item => ({
            alumno: alumnos.find(alumno => alumno.id === item.alumno_id),
            agenda: item,
          })).filter(item => !!item.alumno) as { alumno: Alumno; agenda: AgendaAlumno }[];
          const cantidadQueViene = agendaClase.filter(item => item.estado !== "ausente").length;
          const personasQueVienen = agendaClase.filter(item => item.estado !== "ausente");
          const noVienen = agendaClase.length - cantidadQueViene;
          const lugares = calcularLugaresDisponibles(grupo, agendaClase);
          const liberados = calcularVacantesLiberadas(agendaClase);
          const claseMovida = agendaClase.find(item => item.feriado_origen);
          const abierto = !!detallesAbiertos[clase.key];
          const cantidadesModelos = agendaClase
            .filter(item => item.estado !== "ausente" && item.modelo_nombre)
            .reduce<Record<string, number>>((conteo, item) => {
              const modelo = item.modelo_nombre || "Sin modelo";
              conteo[modelo] = (conteo[modelo] || 0) + 1;
              return conteo;
            }, {});

          return (
            <View key={clase.key} style={[ui.card, styles.groupCard, { borderLeftColor: grupo.color }]}>
              <View style={ui.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.time}>
                    {fechaGrupo === fechaLocal() ? "HOY" : dias[grupo.dia]} · {grupo.hora} · {fechaGrupo.slice(8, 10)}/{fechaGrupo.slice(5, 7)}
                  </Text>
                  <Text style={ui.name}>{grupo.nombre}</Text>
                  {!!claseMovida?.feriado_origen && (
                    <Text style={[
                      styles.holidayRecovery,
                      claseMovida.motivo_movimiento === "compromiso" && styles.commitmentRecovery,
                      claseMovida.motivo_movimiento === "reajuste" && styles.adjustmentRecovery,
                    ]}>
                      {etiquetaRecuperacion(
                        claseMovida.motivo_movimiento,
                        claseMovida.feriado_origen
                      )}
                    </Text>
                  )}
                  <Text style={ui.muted}>
                    {cantidadQueViene} asisten de {grupo.capacidad}{noVienen ? ` · ${noVienen} no ${noVienen === 1 ? "viene" : "vienen"}` : ""}
                  </Text>
                  {!!liberados && (
                    <Text style={styles.releasedPlaces}>
                      {liberados} {liberados === 1 ? "lugar liberado" : "lugares liberados"} por ausencias
                    </Text>
                  )}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={lugares
                    ? `${lugares} lugar${lugares === 1 ? "" : "es"} libre${lugares === 1 ? "" : "s"}`
                    : "Sin vacantes"}
                  accessibilityHint="Abre la pantalla de vacantes"
                  onPress={() => router.push("/(tabs)/vacantes" as never)}
                  style={({ pressed }) => [
                    styles.availabilityChip,
                    { backgroundColor: lugares ? colors.success : colors.danger },
                    pressed && { opacity: .78, transform: [{ scale: .97 }] },
                  ]}
                >
                  <Ionicons
                    name={lugares ? "checkmark-circle" : "lock-closed"}
                    size={15}
                    color="white"
                  />
                  <Text style={styles.availabilityText}>
                    {lugares
                      ? `${lugares} ${lugares === 1 ? "LUGAR LIBRE" : "LUGARES LIBRES"}`
                      : "SIN VACANTES"}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.cardActions}>
                <Pressable
                  onPress={() => setDetallesAbiertos(actual => ({ ...actual, [clase.key]: !abierto }))}
                  style={styles.detailToggle}
                >
                  <Text style={styles.detailToggleText}>{abierto ? "Ver menos" : "Ver más detalle"}</Text>
                  <Ionicons name={abierto ? "chevron-up" : "chevron-down"} size={18} color={colors.primary} />
                </Pressable>
                <Pressable
                  disabled={!personasQueVienen.length}
                  onPress={() => compartirRecordatorio(mensajeRecordatorio({
                    fecha: fechaGrupo,
                    grupo,
                    vienen: personasQueVienen,
                  }))}
                  style={[styles.reminderButton, !personasQueVienen.length && { opacity: .4 }]}
                >
                  <Ionicons name="logo-whatsapp" size={17} color={colors.success} />
                  <Text style={[styles.reminderButtonText, { color: colors.success }]}>WhatsApp</Text>
                </Pressable>
              </View>

              {abierto && <View style={styles.expanded}>
                {!inscriptos.length && (
                  <Text style={styles.emptyGroup}>No hay alumnos cargados para esta fecha.</Text>
                )}
                {inscriptos.map(({ alumno, agenda: itemAgenda }) => {
                  const sinGrupoHabitual = !itemAgenda.alumno_grupo_id;
                  const esDeOtroGrupo = sinGrupoHabitual || itemAgenda.alumno_grupo_id !== grupo.id;
                  const colorAlumno = alumno.grupo_color || colors.muted;
                  const noNecesitaModelo = itemAgenda.necesidades === "No necesita";
                  const origenAlumno = sinGrupoHabitual
                    ? "sin grupo habitual"
                    : itemAgenda.alumno_grupo_nombre || "otro grupo";
                  return (
                  <View
                    key={itemAgenda.id}
                    style={[
                      styles.person,
                      esDeOtroGrupo && styles.personFromOtherGroup,
                      esDeOtroGrupo && { borderLeftColor: colorAlumno },
                    ]}
                  >
                    <View style={[styles.avatar, esDeOtroGrupo && { backgroundColor: `${colorAlumno}20` }]}>
                      <Text style={[styles.avatarText, esDeOtroGrupo && { color: colorAlumno }]}>
                        {alumno.nombre.slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.personName}>{alumno.nombre}</Text>
                      <Text style={[
                        styles.personOrigin,
                        esDeOtroGrupo && { color: colorAlumno },
                      ]}>
                        {itemAgenda.feriado_origen
                          ? etiquetaRecuperacion(
                              itemAgenda.motivo_movimiento,
                              itemAgenda.feriado_origen
                            )
                          : itemAgenda.tipo === "recuperacion"
                          ? `Recupera una clase pendiente${esDeOtroGrupo ? ` · viene de ${origenAlumno}` : ""}`
                          : itemAgenda.tipo === "manual" && esDeOtroGrupo
                            ? sinGrupoHabitual ? "Sin grupo habitual" : `Viene de ${origenAlumno}`
                            : "Alumno habitual del grupo"}
                      </Text>
                      <Pressable
                        onPress={() => router.push({
                          pathname: "/(tabs)/calendario",
                          params: {
                            fecha: fechaGrupo,
                            grupoId: String(grupo.id),
                            alumnoId: String(itemAgenda.alumno_id),
                          },
                        } as never)}
                        style={styles.modelLink}
                      >
                        <Text style={[styles.modelName, !itemAgenda.modelo_id && !noNecesitaModelo && { color: colors.warning }]}>
                          {noNecesitaModelo ? "No necesita modelo" : itemAgenda.modelo_nombre || "Falta elegir modelo"}
                        </Text>
                        <Ionicons name="create-outline" size={14} color={itemAgenda.modelo_id || noNecesitaModelo ? colors.primary : colors.warning} />
                      </Pressable>
                      <Text style={styles.attendanceQuestion}>¿Viene a esta clase?</Text>
                      <View style={styles.attendanceChoices}>
                        <AttendanceChoice
                          label="Sí, viene"
                          selected={itemAgenda.estado !== "ausente"}
                          color={colors.success}
                          disabled={guardandoAsistencia === itemAgenda.id}
                          onPress={() => cambiarAsistencia(itemAgenda, true)}
                        />
                        <AttendanceChoice
                          label="No viene"
                          selected={itemAgenda.estado === "ausente"}
                          color={colors.danger}
                          disabled={guardandoAsistencia === itemAgenda.id}
                          onPress={() => cambiarAsistencia(itemAgenda, false)}
                        />
                      </View>
                    </View>
                  </View>
                  );
                })}

                {!!Object.keys(cantidadesModelos).length && (
                  <View style={styles.preparation}>
                    <View style={styles.preparationHeader}>
                      <Ionicons name="clipboard-outline" size={18} color={colors.primary} />
                      <Text style={styles.preparationTitle}>Preparar para esta clase</Text>
                    </View>
                    {Object.entries(cantidadesModelos).map(([modelo, cantidad]) => (
                      <View key={modelo} style={styles.preparationRow}>
                        <Text style={styles.preparationCount}>{cantidad}</Text>
                        <Text style={styles.preparationModel}>{modelo}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <Pressable
                  onPress={() => router.push({
                    pathname: "/(tabs)/calendario",
                    params: { fecha: fechaGrupo, grupoId: String(grupo.id) },
                  } as never)}
                  style={styles.groupDetailButton}
                >
                  <Ionicons name="calendar-outline" size={17} color={colors.clay} />
                  <Text style={styles.groupDetailText}>Ver y editar en el mes</Text>
                  <Ionicons name="chevron-forward" size={17} color={colors.clay} />
                </Pressable>
                <Pressable
                  onPress={() => {
                    setGrupoParaAgregar({ grupo, fecha: fechaGrupo });
                    setSelectorAlumnoVisible(true);
                  }}
                  style={styles.addPersonButton}
                >
                  <Ionicons name="person-add-outline" size={17} color={colors.primary} />
                  <Text style={styles.addPersonText}>Agregar persona a esta clase</Text>
                </Pressable>
              </View>}
            </View>
          );
        })}
      </ScrollView>

      <AgregarPersonaModal
        visible={selectorAlumnoVisible}
        alumnos={alumnos}
        agenda={agendaProxima}
        fecha={grupoParaAgregar?.fecha || fechaLocal()}
        grupoDestino={grupoParaAgregar?.grupo}
        idsOcupados={agendaProxima.filter(item =>
          item.fecha === grupoParaAgregar?.fecha
        ).map(item => item.alumno_id)}
        onClose={() => {
          setSelectorAlumnoVisible(false);
          setGrupoParaAgregar(null);
        }}
        onConfirm={guardarPersonaEnGrupo}
      />
    </Screen>
  );
}

function AttendanceChoice({ label, selected, color, disabled, onPress }: {
  label: string;
  selected: boolean;
  color: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.attendanceChoice, selected && { borderColor: color, backgroundColor: `${color}16` }, disabled && { opacity: .55 }]}
    >
      <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={17} color={selected ? color : colors.muted} />
      <Text style={[styles.attendanceChoiceText, selected && { color }]}>{label}</Text>
    </Pressable>
  );
}

function Stat({ icon, value, label, color, onPress }: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.stat}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backupReminder: { minHeight: 72, padding: 13, borderRadius: 16, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: "#BBD2C9", flexDirection: "row", alignItems: "center", gap: 11 },
  backupReminderIcon: { width: 43, height: 43, borderRadius: 13, backgroundColor: "white", alignItems: "center", justifyContent: "center" },
  backupReminderTitle: { color: colors.primary, fontSize: 13, fontWeight: "900" },
  backupReminderText: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  stats: { flexDirection: "row", gap: 9 },
  stat: { flex: 1, minHeight: 92, padding: 12, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  statValue: { color: colors.ink, fontSize: 24, fontWeight: "900", marginTop: 5 },
  statLabel: { color: colors.muted, fontSize: 11, marginTop: 1 },
  groupCard: { borderLeftWidth: 5, gap: 12 },
  time: { color: colors.clay, fontSize: 12, fontWeight: "900", marginBottom: 4 },
  holidayRecovery: { color: colors.danger, fontSize: 11, fontWeight: "900", marginTop: 3, marginBottom: 2 },
  commitmentRecovery: { color: colors.clay },
  adjustmentRecovery: { color: colors.primary },
  releasedPlaces: { color: colors.success, fontSize: 12, fontWeight: "800", marginTop: 4 },
  availabilityChip: { maxWidth: 112, minHeight: 42, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, elevation: 2, shadowColor: "#000", shadowOpacity: .12, shadowRadius: 3, shadowOffset: { width: 0, height: 2 } },
  availabilityText: { flexShrink: 1, color: "white", fontSize: 9, lineHeight: 12, fontWeight: "900", textAlign: "center" },
  cardActions: { flexDirection: "row", gap: 8 },
  detailToggle: { flex: 1, minHeight: 42, borderRadius: 11, backgroundColor: colors.primarySoft, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  detailToggleText: { color: colors.primary, fontSize: 12, fontWeight: "900" },
  reminderButton: { minHeight: 42, paddingHorizontal: 11, borderRadius: 11, borderWidth: 1, borderColor: "#BBD8CD", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  reminderButtonText: { color: colors.clay, fontSize: 11, fontWeight: "900" },
  expanded: { gap: 12 },
  emptyGroup: { padding: 12, borderRadius: 11, backgroundColor: "#F3F1EA", color: colors.muted, fontSize: 12, textAlign: "center" },
  person: { minHeight: 62, flexDirection: "row", alignItems: "flex-start", gap: 9, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  personFromOtherGroup: { borderLeftWidth: 5, paddingLeft: 9 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.claySoft, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.clay, fontSize: 10, fontWeight: "900" },
  personName: { color: colors.ink, fontWeight: "800", fontSize: 14 },
  personOrigin: { color: colors.muted, fontSize: 10, fontWeight: "800", marginTop: 3 },
  modelLink: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  modelName: { color: colors.primary, fontSize: 11, fontWeight: "800" },
  attendanceQuestion: { color: colors.muted, fontSize: 11, fontWeight: "700", marginTop: 10, marginBottom: 6 },
  attendanceChoices: { flexDirection: "row", gap: 7 },
  attendanceChoice: { flex: 1, minHeight: 39, paddingHorizontal: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, backgroundColor: "white" },
  attendanceChoiceText: { color: colors.muted, fontSize: 11, fontWeight: "900" },
  preparation: { padding: 12, borderRadius: 13, backgroundColor: "#F3F1EA", gap: 8 },
  preparationHeader: { flexDirection: "row", alignItems: "center", gap: 7 },
  preparationTitle: { color: colors.ink, fontSize: 13, fontWeight: "900" },
  preparationRow: { paddingTop: 7, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row", alignItems: "center", gap: 9 },
  preparationCount: { width: 27, height: 27, borderRadius: 9, backgroundColor: colors.claySoft, color: colors.clay, textAlign: "center", textAlignVertical: "center", fontSize: 13, fontWeight: "900" },
  preparationModel: { flex: 1, color: colors.ink, fontSize: 13, fontWeight: "800" },
  groupDetailButton: { minHeight: 43, paddingHorizontal: 11, borderRadius: 11, borderWidth: 1, borderColor: "#E7C9BB", flexDirection: "row", alignItems: "center", gap: 8 },
  groupDetailText: { flex: 1, color: colors.clay, fontSize: 12, fontWeight: "900" },
  addPersonButton: { minHeight: 43, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: colors.primarySoft },
  addPersonText: { color: colors.primary, fontSize: 12, fontWeight: "900" },
});
