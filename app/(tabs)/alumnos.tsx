import { useCallback, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
import { AddButton, Choice, Empty, Field, FormModal, Screen, ui } from "@/components/ui";
import { PendientesAlumnoModal } from "@/components/alumnos/PendientesAlumnoModal";
import { actualizarPendientesAlumno, crearAlumno, editarAlumno, eliminarAlumno, listarAlumnos } from "@/repositories/alumnoRepository";
import { listarGrupos } from "@/repositories/grupoRepository";
import { colors } from "@/lib/theme";
import { reprogramarNotificaciones } from "@/lib/notifications";
import { Alumno, Grupo } from "@/models";

const fechaHoy = () => {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
};

export default function AlumnosScreen() {
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Alumno | null>(null);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [grupoId, setGrupoId] = useState<number | null>(null);
  const [fechaInicio, setFechaInicio] = useState(fechaHoy());
  const [abriendoContactos, setAbriendoContactos] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "pendientes">("todos");
  const [alumnoPendientes, setAlumnoPendientes] = useState<Alumno | null>(null);

  const cargar = useCallback(async () => {
    const [personas, gruposCargados] = await Promise.all([listarAlumnos(), listarGrupos()]);
    setAlumnos(personas);
    setGrupos(gruposCargados);
    setGrupoId(actual => actual || gruposCargados[0]?.id || null);
  }, []);
  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const abrirNuevo = () => {
    if (!grupos.length) {
      Alert.alert(
        "Primero creá un grupo",
        "Para cargar un alumno necesitás indicar su grupo habitual.",
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Ir al calendario", onPress: () => router.push("/(tabs)/calendario") },
        ]
      );
      return;
    }
    setEditando(null);
    setNombre("");
    setTelefono("");
    setGrupoId(grupos[0]?.id || null);
    setFechaInicio(fechaHoy());
    setModal(true);
  };

  const abrirEdicion = (alumno: Alumno) => {
    setEditando(alumno);
    setNombre(alumno.nombre);
    setTelefono(alumno.telefono || "");
    setGrupoId(alumno.sin_grupo ? null : alumno.grupo_id);
    setFechaInicio(alumno.fecha_inicio || fechaHoy());
    setModal(true);
  };

  const elegirContacto = async () => {
    try {
      setAbriendoContactos(true);
      if (!(await Contacts.isAvailableAsync())) {
        Alert.alert("Contactos no disponibles", "Este dispositivo no permite abrir la agenda de contactos.");
        return;
      }
      if (Platform.OS === "android") {
        const permiso = await Contacts.requestPermissionsAsync();
        if (permiso.status !== "granted") {
          Alert.alert("Permiso necesario", "Necesitamos permiso para que puedas elegir un contacto del teléfono.");
          return;
        }
      }
      const contacto = await Contacts.presentContactPickerAsync();
      if (!contacto) return;
      const nombreContacto = contacto.name || [contacto.firstName, contacto.lastName].filter(Boolean).join(" ");
      const numero = contacto.phoneNumbers?.[0]?.number || "";
      if (nombreContacto) setNombre(nombreContacto);
      if (numero) setTelefono(numero);
      if (!numero) {
        Alert.alert("Contacto sin teléfono", "Se cargó el nombre. Podés escribir el teléfono ahora o agregarlo más adelante.");
      }
    } catch {
      Alert.alert("No se pudo abrir contactos", "Podés cargar el nombre manualmente y agregar el teléfono después.");
    } finally {
      setAbriendoContactos(false);
    }
  };

  const guardar = async () => {
    if (!nombre.trim()) return;
    if (editando) {
      await editarAlumno(editando.id, nombre, telefono, grupoId);
    } else {
      if (!grupoId) return;
      await crearAlumno({
        nombre, telefono,
        frecuencia: grupos.find(grupo => grupo.id === grupoId)?.frecuencia || "semanal",
        grupo_id: grupoId, molde_id: null,
        fecha_inicio: fechaInicio,
      });
    }
    await reprogramarNotificaciones(false);
    setModal(false);
    setEditando(null);
    await cargar();
  };

  const confirmarEliminar = () => {
    if (!editando) return;
    Alert.alert(
      "Eliminar alumno",
      `${editando.nombre} dejará de aparecer y se cancelarán sus próximas clases. El historial anterior se conservará.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            await eliminarAlumno(editando.id);
            await reprogramarNotificaciones(false);
            setModal(false);
            setEditando(null);
            await cargar();
          },
        },
      ]
    );
  };

  const guardarPendientes = async (cantidad: number) => {
    if (!alumnoPendientes) return;
    await actualizarPendientesAlumno(alumnoPendientes.id, cantidad);
    setAlumnoPendientes(null);
    await cargar();
  };

  const termino = busqueda.trim().toLocaleLowerCase("es");
  const alumnosVisibles = alumnos.filter(alumno => {
    const coincide = !termino || alumno.nombre.toLocaleLowerCase("es").includes(termino) ||
      (alumno.telefono || "").toLocaleLowerCase("es").includes(termino);
    const pasaFiltro = filtro === "todos" || alumno.pendientes > 0;
    return coincide && pasaFiltro;
  });

  return (
    <Screen
      title="Alumnos"
      subtitle="Personas, grupos y frecuencia de asistencia"
      action={(
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="Copia de seguridad"
            onPress={() => router.push("/(tabs)/respaldo" as never)}
            style={styles.backupButton}
          >
            <Ionicons name="cloud-outline" size={22} color={colors.primary} />
          </Pressable>
          <AddButton onPress={abrirNuevo} />
        </View>
      )}
    >
      <ScrollView contentContainerStyle={ui.list}>
        {!alumnos.length && <Empty text="Cargá la primera persona del taller." />}
        {!!alumnos.length && <>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={19} color={colors.muted} />
            <TextInput
              value={busqueda}
              onChangeText={setBusqueda}
              placeholder="Buscar por nombre o teléfono"
              placeholderTextColor="#9AA29E"
              style={styles.searchInput}
            />
            {!!busqueda && (
              <Pressable onPress={() => setBusqueda("")} hitSlop={8}>
                <Ionicons name="close-circle" size={19} color={colors.muted} />
              </Pressable>
            )}
          </View>
          <View style={styles.filters}>
            <Pressable onPress={() => setFiltro("todos")} style={[styles.filter, filtro === "todos" && styles.filterOn]}>
              <Text style={[styles.filterText, filtro === "todos" && styles.filterTextOn]}>Todos</Text>
            </Pressable>
            <Pressable onPress={() => setFiltro("pendientes")} style={[styles.filter, filtro === "pendientes" && styles.filterOn]}>
              <Text style={[styles.filterText, filtro === "pendientes" && styles.filterTextOn]}>Con pendientes</Text>
            </Pressable>
          </View>
        </>}
        {!!alumnos.length && !alumnosVisibles.length && (
          <Empty title="Sin resultados" text="No encontramos alumnos con esa búsqueda o filtro." />
        )}
        {alumnosVisibles.map(alumno => {
          const colorGrupo = alumno.sin_grupo ? colors.muted : alumno.grupo_color || colors.primary;
          return (
          <Pressable
            key={alumno.id}
            onPress={() => abrirEdicion(alumno)}
            style={[ui.card, styles.studentCard, { borderLeftColor: colorGrupo }]}
          >
            <View style={ui.row}>
              <View style={[styles.avatar, { backgroundColor: `${colorGrupo}20` }]}>
                <Text style={[styles.avatarText, { color: colorGrupo }]}>{alumno.nombre.split(" ").map(p => p[0]).slice(0, 2).join("")}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={ui.name}>{alumno.nombre}</Text>
                <View style={styles.groupLine}>
                  <View style={[styles.groupDot, { backgroundColor: colorGrupo }]} />
                  <Text style={[styles.groupName, { color: colorGrupo }]}>
                    {alumno.sin_grupo ? "Sin grupo habitual" : alumno.grupo_nombre}
                  </Text>
                  {!alumno.sin_grupo && (
                    <Text style={styles.frequency}>· {alumno.frecuencia === "semanal" ? "Semanal" : "2 veces por mes"}</Text>
                  )}
                </View>
              </View>
              <View style={styles.cardActions}>
                <Pressable
                  onPress={event => {
                    event.stopPropagation();
                    setAlumnoPendientes(alumno);
                  }}
                  style={[styles.pendingButton, { backgroundColor: alumno.pendientes ? colors.claySoft : colors.primarySoft }]}
                >
                  <Ionicons name={alumno.pendientes ? "time-outline" : "add-circle-outline"} size={14} color={alumno.pendientes ? colors.clay : colors.primary} />
                  <Text style={[styles.pendingButtonText, { color: alumno.pendientes ? colors.clay : colors.primary }]}>
                    {alumno.pendientes
                      ? `${alumno.pendientes} pendiente${alumno.pendientes === 1 ? "" : "s"}`
                      : "Cargar pendientes"}
                  </Text>
                </Pressable>
                <View style={styles.editIcon}>
                  <Ionicons name="pencil-outline" size={17} color={colors.primary} />
                </View>
              </View>
            </View>
            <View style={styles.details}>
              <Ionicons name={alumno.telefono ? "call-outline" : "alert-circle-outline"} size={15} color={alumno.telefono ? colors.muted : colors.warning} />
              <Text style={[styles.detail, !alumno.telefono && { color: colors.warning, fontWeight: "800" }]}>
                {alumno.telefono || "Sin teléfono · tocá para agregarlo"}
              </Text>
            </View>
          </Pressable>
          );
        })}
      </ScrollView>
      <FormModal
        visible={modal}
        title={editando ? "Editar alumno" : "Nueva persona"}
        onClose={() => setModal(false)}
        onSave={guardar}
        canSave={!!nombre.trim() && (!!editando || !!grupoId)}
      >
        <Pressable disabled={abriendoContactos} onPress={elegirContacto} style={styles.contactButton}>
          <Ionicons name="person-circle-outline" size={23} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.contactTitle}>{abriendoContactos ? "Abriendo contactos..." : "Elegir de mis contactos"}</Text>
            <Text style={styles.contactText}>Completa el nombre y el teléfono automáticamente</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.primary} />
        </Pressable>
        <Field label="Nombre y apellido" value={nombre} onChangeText={setNombre} placeholder="Ej. Julia Fernández" />
        <Field label="Teléfono (opcional)" value={telefono} onChangeText={setTelefono} keyboardType="phone-pad" placeholder="Podés agregarlo después" />
        {!editando && <>
          <Field label="Comenzar desde" value={fechaInicio} onChangeText={setFechaInicio} placeholder="AAAA-MM-DD" autoCapitalize="none" />
          <View style={styles.help}>
            <Text style={styles.helpText}>El teléfono no es obligatorio. Podés crear el alumno solamente con el nombre y completarlo más adelante.</Text>
          </View>
        </>}
        <Text style={styles.label}>Grupo habitual</Text>
        <View style={{ gap: 8 }}>
          {!!editando && (
            <Choice
              label="Sin grupo habitual"
              selected={grupoId === null}
              onPress={() => setGrupoId(null)}
            />
          )}
          {grupos.map(grupo => <Choice key={grupo.id} label={`${grupo.nombre} · ${grupo.hora}`} selected={grupoId === grupo.id} onPress={() => setGrupoId(grupo.id)} />)}
        </View>
        {!!editando && grupoId !== (editando.sin_grupo ? null : editando.grupo_id) && (
          <View style={styles.help}>
            <Text style={styles.helpText}>
              {grupoId
                ? "Al guardar, sus próximas clases habituales se rearmarán con este grupo y frecuencia. Las fechas agregadas manualmente se conservan."
                : "Al guardar, dejará de pertenecer a su grupo y se quitarán sus próximas clases habituales. Las fechas agregadas manualmente se conservan."}
            </Text>
          </View>
        )}
        {!!editando && (
          <Pressable onPress={confirmarEliminar} style={styles.deleteButton}>
            <Ionicons name="trash-outline" size={19} color={colors.danger} />
            <Text style={styles.deleteText}>Eliminar alumno</Text>
          </Pressable>
        )}
      </FormModal>
      <PendientesAlumnoModal
        alumno={alumnoPendientes}
        onClose={() => setAlumnoPendientes(null)}
        onConfirm={guardarPendientes}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: "row", alignItems: "center", gap: 7 },
  backupButton: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  studentCard: { borderLeftWidth: 5 },
  avatar: { width: 45, height: 45, borderRadius: 23, marginRight: 11, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.primary, fontWeight: "900", fontSize: 13 },
  groupLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4, marginTop: 4 },
  groupDot: { width: 7, height: 7, borderRadius: 4 },
  groupName: { fontSize: 12, fontWeight: "900" },
  frequency: { color: colors.muted, fontSize: 12 },
  details: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 13, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  detail: { color: colors.muted, fontSize: 12 },
  label: { color: colors.ink, fontWeight: "700", fontSize: 14 },
  help: { padding: 12, borderRadius: 12, backgroundColor: colors.claySoft },
  helpText: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  contactButton: { minHeight: 67, padding: 13, borderRadius: 14, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: "#BCD2CA", flexDirection: "row", alignItems: "center", gap: 10 },
  contactTitle: { color: colors.primary, fontSize: 14, fontWeight: "900" },
  contactText: { color: colors.muted, fontSize: 10, marginTop: 3 },
  searchBox: { minHeight: 48, paddingHorizontal: 13, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: "row", alignItems: "center", gap: 9 },
  searchInput: { flex: 1, color: colors.ink, fontSize: 14 },
  filters: { flexDirection: "row", gap: 8 },
  filter: { minHeight: 39, paddingHorizontal: 14, borderRadius: 99, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  filterOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  filterText: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  filterTextOn: { color: colors.primary },
  cardActions: { alignItems: "flex-end", gap: 10, marginLeft: 8 },
  pendingButton: { minHeight: 31, paddingHorizontal: 9, borderRadius: 99, flexDirection: "row", alignItems: "center", gap: 4 },
  pendingButtonText: { fontSize: 10, fontWeight: "900" },
  editIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  deleteButton: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: "#F0C1BD", backgroundColor: "#FFF0EF", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 10 },
  deleteText: { color: colors.danger, fontSize: 14, fontWeight: "900" },
});
