import type { GestureResponderEvent } from "react-native";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { opcionesMotivoMovimiento } from "@/lib/seleccionMotivoMovimiento";
import { colors } from "@/lib/theme";
import type { TipoMovimientoClase } from "@/models";

export function SeleccionarMotivoMovimientoModal({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (motivo: TipoMovimientoClase) => void;
}) {
  const evitarCierre = (evento: GestureResponderEvent) => evento.stopPropagation();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityLabel="Cerrar selector de motivo"
        onPress={onClose}
        style={styles.backdrop}
      >
        <SafeAreaView style={styles.safe} pointerEvents="box-none">
          <Pressable onPress={evitarCierre} style={styles.card}>
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Mover esta clase</Text>
                <Text style={styles.subtitle}>
                  Elegí por qué se mueve. Después seleccionás la nueva fecha.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cerrar sin elegir"
                hitSlop={10}
                onPress={onClose}
                style={({ pressed }) => [styles.close, pressed && styles.pressed]}
              >
                <Ionicons name="close" size={23} color={colors.ink} />
              </Pressable>
            </View>

            <View style={styles.options}>
              {opcionesMotivoMovimiento.map(opcion => (
                <Pressable
                  key={opcion.tipo}
                  accessibilityRole="button"
                  accessibilityLabel={`${opcion.titulo}. ${opcion.descripcion}`}
                  android_ripple={{ color: colors.primarySoft }}
                  onPress={() => onSelect(opcion.tipo)}
                  style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                >
                  <View style={styles.icon}>
                    <Ionicons
                      name={opcion.icono as keyof typeof Ionicons.glyphMap}
                      size={23}
                      color={colors.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionTitle}>{opcion.titulo}</Text>
                    <Text style={styles.optionText}>{opcion.descripcion}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={19} color={colors.muted} />
                </Pressable>
              ))}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Volver sin elegir"
              onPress={onClose}
              style={({ pressed }) => [styles.back, pressed && styles.pressed]}
            >
              <Text style={styles.backText}>Volver</Text>
            </Pressable>
          </Pressable>
        </SafeAreaView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#16241F99", justifyContent: "center", padding: 18 },
  safe: { width: "100%", alignItems: "center" },
  card: { width: "100%", maxWidth: 440, padding: 19, borderRadius: 22, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, elevation: 8 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  title: { color: colors.ink, fontSize: 21, fontWeight: "900" },
  subtitle: { marginTop: 6, color: colors.muted, fontSize: 13, lineHeight: 19 },
  close: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  options: { marginTop: 18, gap: 10 },
  option: { minHeight: 76, padding: 12, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: "white", flexDirection: "row", alignItems: "center", gap: 11, overflow: "hidden" },
  optionPressed: { borderColor: colors.primary, backgroundColor: colors.primarySoft, transform: [{ scale: 0.99 }] },
  icon: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  optionTitle: { color: colors.ink, fontSize: 15, fontWeight: "900" },
  optionText: { marginTop: 3, color: colors.muted, fontSize: 11, lineHeight: 16 },
  back: { minHeight: 48, marginTop: 17, borderRadius: 13, borderWidth: 1, borderColor: "#BCD2CA", alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  backText: { color: colors.primary, fontSize: 14, fontWeight: "900" },
  pressed: { opacity: 0.65 },
});
