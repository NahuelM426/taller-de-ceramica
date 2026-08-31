import type { GestureResponderEvent } from "react-native";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "@/lib/theme";
import type { AgendaAlumno, Grupo } from "@/models";

interface SeleccionarGrupoDiaModalProps {
  visible: boolean;
  fecha: string | null;
  grupos: Grupo[];
  agenda: AgendaAlumno[];
  onClose: () => void;
  onSelect: (grupoId: number) => void;
}

export function SeleccionarGrupoDiaModal({
  visible,
  fecha,
  grupos,
  agenda,
  onClose,
  onSelect,
}: SeleccionarGrupoDiaModalProps) {
  const evitarCierre = (evento: GestureResponderEvent) => evento.stopPropagation();
  const personasPorGrupo = new Map<number, number>();
  for (const persona of agenda) {
    if (persona.fecha !== fecha || persona.estado === "cancelada") continue;
    personasPorGrupo.set(
      persona.grupo_id,
      (personasPorGrupo.get(persona.grupo_id) || 0) + 1
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable onPress={onClose} style={styles.backdrop}>
        <SafeAreaView style={styles.safe} pointerEvents="box-none">
          <Pressable onPress={evitarCierre} style={styles.card}>
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Elegí el grupo</Text>
                <Text style={styles.subtitle}>
                  Hay más de un grupo este día. Elegí cuál querés ver u organizar.
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Cerrar selector de grupo"
                hitSlop={10}
                onPress={onClose}
                style={styles.close}
              >
                <Ionicons name="close" size={23} color={colors.ink} />
              </Pressable>
            </View>

            <View style={styles.options}>
              {grupos.map(grupo => {
                const cantidad = personasPorGrupo.get(grupo.id) || 0;
                return (
                  <Pressable
                    key={grupo.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Abrir ${grupo.nombre}, ${grupo.hora}`}
                    onPress={() => onSelect(grupo.id)}
                    style={({ pressed }) => [styles.option, pressed && styles.pressed]}
                  >
                    <View style={[styles.color, { backgroundColor: grupo.color }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.groupName}>{grupo.nombre}</Text>
                      <Text style={styles.groupMeta}>
                        {grupo.hora} · {cantidad} persona{cantidad === 1 ? "" : "s"}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.primary} />
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </SafeAreaView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    padding: 18,
    backgroundColor: "#16241F99",
    justifyContent: "center",
  },
  safe: { width: "100%", alignItems: "center" },
  card: {
    width: "100%",
    maxWidth: 440,
    padding: 19,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 8,
  },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  title: { color: colors.ink, fontSize: 21, fontWeight: "900" },
  subtitle: { marginTop: 6, color: colors.muted, fontSize: 13, lineHeight: 19 },
  close: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  options: { marginTop: 18, gap: 10 },
  option: {
    minHeight: 72,
    padding: 12,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "white",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  color: { width: 9, alignSelf: "stretch", borderRadius: 8 },
  groupName: { color: colors.ink, fontSize: 16, fontWeight: "900" },
  groupMeta: { marginTop: 4, color: colors.muted, fontSize: 12 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.99 }] },
});
