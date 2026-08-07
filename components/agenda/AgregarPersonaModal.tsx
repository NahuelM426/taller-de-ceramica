import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AlumnoChoice } from "@/components/AlumnoChoice";
import { colors } from "@/lib/theme";
import {
  buscarProximaClaseHabitual, filtrarAlumnosParaAgregar, FiltroAlumnos,
  ocupacionInicial, TipoOcupacion,
} from "@/lib/seleccionAgenda";
import { AgendaAlumno, Alumno, Grupo } from "@/models";

export function AgregarPersonaModal({
  visible, alumnos, agenda, fecha, idsOcupados, grupoDestino, onClose, onConfirm,
}: {
  visible: boolean;
  alumnos: Alumno[];
  agenda: AgendaAlumno[];
  fecha: string;
  idsOcupados: number[];
  grupoDestino?: Grupo | null;
  onClose: () => void;
  onConfirm: (alumnoId: number, tipo: TipoOcupacion) => Promise<boolean>;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<FiltroAlumnos>("todos");
  const [seleccion, setSeleccion] = useState<number | null>(null);
  const [tipo, setTipo] = useState<TipoOcupacion | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setBusqueda("");
    setFiltro("todos");
    setSeleccion(null);
    setTipo(null);
    setGuardando(false);
  }, [visible]);

  const visibles = useMemo(
    () => filtrarAlumnosParaAgregar(alumnos, idsOcupados, busqueda, filtro),
    [alumnos, idsOcupados, busqueda, filtro]
  );
  const alumnoElegido = alumnos.find(item => item.id === seleccion);
  const origen = buscarProximaClaseHabitual(agenda, alumnoElegido, fecha);
  const yaPerteneceAlDestino = !!alumnoElegido && !alumnoElegido.sin_grupo &&
    alumnoElegido.grupo_id === grupoDestino?.id;
  const puedeFijarse = !!grupoDestino;

  const elegirAlumno = (alumno: Alumno) => {
    const proxima = buscarProximaClaseHabitual(agenda, alumno, fecha);
    setSeleccion(alumno.id);
    setTipo(ocupacionInicial(alumno, proxima));
  };

  const confirmar = async () => {
    if (!seleccion || !tipo || guardando) return;
    setGuardando(true);
    const guardado = await onConfirm(seleccion, tipo);
    if (!guardado) setGuardando(false);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.backdrop}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Elegir persona</Text>
              <Text style={styles.subtitle}>Elegí la persona y cómo ocupa el lugar.</Text>
            </View>
            <Pressable accessibilityLabel="Cerrar" onPress={onClose} style={styles.close}>
              <Ionicons name="close" size={21} color={colors.primary} />
            </Pressable>
          </View>

          <View style={styles.search}>
            <Ionicons name="search-outline" size={19} color={colors.muted} />
            <TextInput
              value={busqueda}
              onChangeText={setBusqueda}
              placeholder="Buscar por nombre o grupo"
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
            <FilterButton label="Todos" selected={filtro === "todos"} onPress={() => setFiltro("todos")} />
            <FilterButton label="Con pendientes" selected={filtro === "pendientes"} onPress={() => setFiltro("pendientes")} />
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
            {!visibles.length && (
              <Text style={styles.empty}>No hay personas para mostrar con este filtro.</Text>
            )}
            {visibles.map(alumno => (
              <AlumnoChoice
                key={alumno.id}
                alumno={alumno}
                selected={seleccion === alumno.id}
                onPress={() => elegirAlumno(alumno)}
              />
            ))}
          </ScrollView>

          {!!alumnoElegido && (
            <View style={styles.coverage}>
              <Text style={styles.coverageLabel}>¿CÓMO OCUPA ESTE LUGAR?</Text>
              <CoverageChoice
                title="Recupera una pendiente"
                detail={alumnoElegido.pendientes
                  ? `Descuenta 1 día · le quedan ${alumnoElegido.pendientes - 1}`
                  : "No tiene días pendientes"}
                icon="refresh-circle-outline"
                selected={tipo === "recuperacion"}
                disabled={!alumnoElegido.pendientes}
                onPress={() => setTipo("recuperacion")}
              />
              <CoverageChoice
                title="Cambia su próxima clase"
                detail={origen
                  ? `Libera su lugar del ${origen.fecha.slice(8, 10)}/${origen.fecha.slice(5, 7)}`
                  : "No tiene una próxima clase habitual"}
                icon="swap-horizontal-outline"
                selected={tipo === "cambio"}
                disabled={!origen}
                onPress={() => setTipo("cambio")}
              />
              <CoverageChoice
                title="Fijar en este grupo"
                detail={!grupoDestino
                  ? "Abrí primero el detalle de un grupo"
                  : yaPerteneceAlDestino
                      ? `Ya pertenece a ${grupoDestino.nombre}; queda agregado en esta fecha`
                      : alumnoElegido.sin_grupo
                        ? `Quedará en ${grupoDestino.nombre} desde esta fecha`
                        : `Pasa de ${alumnoElegido.grupo_nombre || "su grupo anterior"} a ${grupoDestino.nombre} y libera su lugar anterior`}
                icon="people-outline"
                selected={tipo === "fijar"}
                disabled={!puedeFijarse}
                onPress={() => setTipo("fijar")}
              />
            </View>
          )}

          <View style={styles.footer}>
            <Pressable disabled={guardando} onPress={onClose} style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>Cancelar</Text>
            </Pressable>
            <Pressable
              disabled={!seleccion || !tipo || guardando}
              onPress={confirmar}
              style={[styles.confirmButton, (!seleccion || !tipo || guardando) && { opacity: .4 }]}
            >
              <Ionicons name="checkmark" size={18} color="white" />
              <Text style={styles.confirmText}>{guardando ? "Guardando..." : "Confirmar y agregar"}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function CoverageChoice({ title, detail, icon, selected, disabled, onPress }: {
  title: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.coverageOption, selected && styles.coverageOptionOn, disabled && { opacity: .4 }]}
    >
      <Ionicons name={icon} size={21} color={selected ? colors.primary : colors.muted} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.coverageTitle, selected && { color: colors.primary }]}>{title}</Text>
        <Text style={styles.coverageDetail}>{detail}</Text>
      </View>
      <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={19} color={selected ? colors.primary : colors.muted} />
    </Pressable>
  );
}

function FilterButton({ label, selected, onPress }: {
  label: string; selected: boolean; onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.filter, selected && styles.filterOn]}>
      <Text style={[styles.filterText, selected && styles.filterTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, padding: 18, justifyContent: "center", backgroundColor: "#16241F88" },
  sheet: { maxHeight: "82%", borderRadius: 22, backgroundColor: colors.background, overflow: "hidden" },
  header: { padding: 18, backgroundColor: "white", borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center", gap: 10 },
  title: { color: colors.ink, fontSize: 20, fontWeight: "900" },
  subtitle: { color: colors.muted, fontSize: 12, marginTop: 3 },
  close: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  search: { margin: 14, marginBottom: 8, minHeight: 47, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: "white", flexDirection: "row", alignItems: "center", gap: 8 },
  searchInput: { flex: 1, color: colors.ink, fontSize: 14 },
  filters: { flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingBottom: 10 },
  filter: { minHeight: 38, paddingHorizontal: 14, borderRadius: 99, borderWidth: 1, borderColor: colors.border, backgroundColor: "white", alignItems: "center", justifyContent: "center" },
  filterOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  filterText: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  filterTextOn: { color: colors.primary },
  scroll: { flexShrink: 1 },
  list: { paddingHorizontal: 14, paddingBottom: 12, gap: 8 },
  empty: { padding: 24, color: colors.muted, textAlign: "center", fontSize: 13 },
  coverage: { padding: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, gap: 7, backgroundColor: "#F7F5EF" },
  coverageLabel: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: .7 },
  coverageOption: { minHeight: 58, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: "white", flexDirection: "row", alignItems: "center", gap: 9 },
  coverageOptionOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  coverageTitle: { color: colors.ink, fontSize: 12, fontWeight: "900" },
  coverageDetail: { color: colors.muted, fontSize: 10, marginTop: 3 },
  footer: { padding: 14, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: "white", flexDirection: "row", gap: 9 },
  secondaryButton: { minHeight: 45, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: colors.muted, fontSize: 13, fontWeight: "900" },
  confirmButton: { flex: 1, minHeight: 45, borderRadius: 12, backgroundColor: colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  confirmText: { color: "white", fontSize: 13, fontWeight: "900" },
});
