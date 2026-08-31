import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/lib/theme";
import { Alumno } from "@/models";
import {
  pendientesExtraAlumno,
  pendientesRegularesAlumno,
} from "@/lib/seleccionAgenda";

export function AlumnoChoice({ alumno, selected, onPress }: {
  alumno: Alumno;
  selected: boolean;
  onPress: () => void;
}) {
  const colorGrupo = alumno.sin_grupo ? colors.muted : alumno.grupo_color || colors.muted;
  const pendientesRegulares = pendientesRegularesAlumno(alumno);
  const pendientesExtra = pendientesExtraAlumno(alumno);
  return (
    <Pressable onPress={onPress} style={[styles.option, selected && styles.optionOn]}>
      <View style={[styles.groupMark, { backgroundColor: colorGrupo }]} />
      <View style={styles.identity}>
        <Text style={[styles.name, selected && styles.nameOn]}>{alumno.nombre}</Text>
        <Text style={styles.group}>{alumno.sin_grupo ? "Sin grupo habitual" : alumno.grupo_nombre || "Sin grupo"}</Text>
      </View>
      <View style={styles.credits}>
        {!!pendientesRegulares && (
          <View style={[styles.pending, styles.pendingOn]}>
            <Text style={[styles.pendingText, { color: colors.clay }]}>
              Pendientes: {pendientesRegulares}
            </Text>
          </View>
        )}
        {!!pendientesExtra && (
          <View style={[styles.pending, styles.extraPending]}>
            <Text style={[styles.pendingText, { color: colors.primary }]}>
              Extras a favor: {pendientesExtra}
            </Text>
          </View>
        )}
        {!pendientesRegulares && !pendientesExtra && (
          <View style={[styles.pending, styles.pendingOff]}>
            <Text style={[styles.pendingText, { color: colors.muted }]}>Sin créditos</Text>
          </View>
        )}
      </View>
      <Ionicons
        name={selected ? "radio-button-on" : "radio-button-off"}
        size={20}
        color={selected ? colors.primary : colors.muted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  option: {
    minHeight: 64, padding: 11, borderRadius: 13, borderWidth: 1,
    borderColor: colors.border, backgroundColor: "white", flexDirection: "row",
    alignItems: "center", gap: 9,
  },
  optionOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  groupMark: { width: 5, height: 40, borderRadius: 4 },
  identity: { flex: 1 },
  name: { color: colors.ink, fontSize: 14, fontWeight: "900" },
  nameOn: { color: colors.primary },
  group: { color: colors.muted, fontSize: 11, marginTop: 3 },
  credits: { alignItems: "flex-end", gap: 4 },
  pending: { borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5 },
  pendingOn: { backgroundColor: colors.claySoft },
  extraPending: { backgroundColor: colors.primarySoft },
  pendingOff: { backgroundColor: "#F1F0EB" },
  pendingText: { fontSize: 10, fontWeight: "900" },
});
