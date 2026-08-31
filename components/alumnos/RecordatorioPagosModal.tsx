import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { BotonSelectorHora, SelectorHoraModal } from "@/components/agenda/SelectorHoraModal";
import type { ConfiguracionRecordatorioPagos } from "@/lib/notifications";
import { colors } from "@/lib/theme";

export function RecordatorioPagosModal({ visible, configuracion, onClose, onConfirm }: {
  visible: boolean;
  configuracion: ConfiguracionRecordatorioPagos;
  onClose: () => void;
  onConfirm: (configuracion: ConfiguracionRecordatorioPagos) => Promise<void>;
}) {
  const [activo, setActivo] = useState(false);
  const [dia, setDia] = useState(10);
  const [hora, setHora] = useState("10:00");
  const [selectorHora, setSelectorHora] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setActivo(configuracion.activo);
    setDia(configuracion.dia);
    setHora(configuracion.hora);
    setGuardando(false);
  }, [configuracion, visible]);

  const guardar = async () => {
    if (guardando) return;
    setGuardando(true);
    try {
      await onConfirm({ activo, dia, hora });
    } finally {
      setGuardando(false);
    }
  };

  return <>
    <Modal
      visible={visible && !selectorHora}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.header}>
            <Pressable onPress={onClose} style={styles.iconButton}>
              <Ionicons name="close" size={22} color={colors.muted} />
            </Pressable>
            <Text style={styles.title}>Recordatorio de pagos</Text>
            <View style={styles.iconButton} />
          </View>

          <Pressable onPress={() => setActivo(valor => !valor)} style={styles.activeRow}>
            <View style={[styles.check, activo && styles.checkOn]}>
              {activo && <Ionicons name="checkmark" size={18} color="white" />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.activeTitle}>Avisarme cada mes</Text>
              <Text style={styles.help}>La notificación mostrará quiénes todavía no pagaron.</Text>
            </View>
          </Pressable>

          <View style={!activo && styles.disabled} pointerEvents={activo ? "auto" : "none"}>
            <Text style={styles.label}>Día del mes</Text>
            <View style={styles.stepper}>
              <Pressable onPress={() => setDia(valor => Math.max(1, valor - 1))} style={styles.stepButton}>
                <Ionicons name="remove" size={24} color={colors.primary} />
              </Pressable>
              <View style={styles.dayBox}>
                <Text style={styles.dayNumber}>{dia}</Text>
                <Text style={styles.dayText}>de cada mes</Text>
              </View>
              <Pressable onPress={() => setDia(valor => Math.min(28, valor + 1))} style={styles.stepButton}>
                <Ionicons name="add" size={24} color={colors.primary} />
              </Pressable>
            </View>
            <Text style={styles.dayHint}>Podés elegir del día 1 al 28.</Text>
            <BotonSelectorHora label="Hora del aviso" value={hora} onPress={() => setSelectorHora(true)} />
          </View>

          <Pressable disabled={guardando} onPress={guardar} style={[styles.confirm, guardando && styles.disabled]}>
            <Text style={styles.confirmText}>{guardando ? "Guardando..." : "Guardar recordatorio"}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
    <SelectorHoraModal
      visible={visible && selectorHora}
      titulo="Hora del aviso de pagos"
      valor={hora}
      onClose={() => setSelectorHora(false)}
      onConfirm={nuevaHora => {
        setHora(nuevaHora);
        setSelectorHora(false);
      }}
    />
  </>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, padding: 18, backgroundColor: "rgba(24, 31, 29, .55)", alignItems: "center", justifyContent: "center" },
  card: { width: "100%", maxWidth: 430, padding: 18, borderRadius: 24, backgroundColor: colors.background, gap: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  iconButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, color: colors.ink, fontSize: 18, fontWeight: "900", textAlign: "center" },
  activeRow: { minHeight: 72, padding: 13, borderRadius: 15, backgroundColor: colors.primarySoft, flexDirection: "row", alignItems: "center", gap: 11 },
  check: { width: 28, height: 28, borderRadius: 9, borderWidth: 2, borderColor: colors.primary, alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: colors.primary },
  activeTitle: { color: colors.primary, fontSize: 14, fontWeight: "900" },
  help: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  label: { color: colors.ink, fontSize: 13, fontWeight: "900", marginBottom: 8 },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 },
  stepButton: { width: 48, height: 48, borderRadius: 15, borderWidth: 1, borderColor: "#BCD2CA", backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  dayBox: { minWidth: 116, height: 62, borderRadius: 15, borderWidth: 2, borderColor: colors.primary, backgroundColor: "white", alignItems: "center", justifyContent: "center" },
  dayNumber: { color: colors.ink, fontSize: 24, lineHeight: 27, fontWeight: "900" },
  dayText: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  dayHint: { color: colors.muted, fontSize: 10, textAlign: "center", marginTop: 6, marginBottom: 14 },
  confirm: { minHeight: 50, borderRadius: 14, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  confirmText: { color: "white", fontSize: 15, fontWeight: "900" },
  disabled: { opacity: .45 },
});
