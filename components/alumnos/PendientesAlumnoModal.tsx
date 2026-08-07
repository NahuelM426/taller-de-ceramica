import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/lib/theme";
import { Alumno } from "@/models";

export function PendientesAlumnoModal({ alumno, onClose, onConfirm }: {
  alumno: Alumno | null;
  onClose: () => void;
  onConfirm: (cantidad: number) => Promise<void>;
}) {
  const [cantidad, setCantidad] = useState("0");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (alumno) setCantidad(String(alumno.pendientes));
  }, [alumno]);

  const total = Math.max(0, Math.floor(Number(cantidad) || 0));
  const cambiar = (diferencia: number) => setCantidad(String(Math.max(0, total + diferencia)));
  const guardar = async () => {
    if (!alumno || guardando) return;
    setGuardando(true);
    try {
      await onConfirm(total);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal visible={!!alumno} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.header}>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={22} color={colors.muted} />
            </Pressable>
            <Text style={styles.title}>Días pendientes</Text>
            <View style={styles.closeButton} />
          </View>

          <View style={styles.person}>
            <View style={styles.personIcon}>
              <Ionicons name="person-outline" size={22} color={colors.clay} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.personName}>{alumno?.nombre}</Text>
              <Text style={styles.personText}>Cargá el total que tiene pendiente hoy</Text>
            </View>
          </View>

          <Text style={styles.label}>Cantidad total pendiente</Text>
          <View style={styles.stepper}>
            <Pressable accessibilityLabel="Restar un día" onPress={() => cambiar(-1)} style={styles.stepButton}>
              <Ionicons name="remove" size={27} color={colors.primary} />
            </Pressable>
            <TextInput
              value={cantidad}
              onChangeText={texto => setCantidad(texto.replace(/[^0-9]/g, ""))}
              onBlur={() => setCantidad(String(total))}
              keyboardType="number-pad"
              selectTextOnFocus
              maxLength={3}
              style={styles.input}
            />
            <Pressable accessibilityLabel="Sumar un día" onPress={() => cambiar(1)} style={styles.stepButton}>
              <Ionicons name="add" size={27} color={colors.primary} />
            </Pressable>
          </View>
          <Text style={styles.result}>
            {total === 0
              ? "Quedará sin clases pendientes"
              : `Quedará con ${total} día${total === 1 ? "" : "s"} pendiente${total === 1 ? "" : "s"}`}
          </Text>

          <View style={styles.help}>
            <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
            <Text style={styles.helpText}>
              Cuando use una vacante como recuperación, la aplicación descontará un día automáticamente.
            </Text>
          </View>

          <Pressable disabled={guardando} onPress={guardar} style={[styles.confirm, guardando && { opacity: .5 }]}>
            <Text style={styles.confirmText}>{guardando ? "Guardando..." : "Guardar pendientes"}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, padding: 20, backgroundColor: "rgba(24, 31, 29, .55)", alignItems: "center", justifyContent: "center" },
  card: { width: "100%", maxWidth: 430, padding: 18, borderRadius: 24, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  closeButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, color: colors.ink, fontSize: 19, fontWeight: "900", textAlign: "center" },
  person: { marginTop: 15, padding: 13, borderRadius: 15, backgroundColor: colors.claySoft, flexDirection: "row", alignItems: "center", gap: 10 },
  personIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: "white", alignItems: "center", justifyContent: "center" },
  personName: { color: colors.ink, fontSize: 16, fontWeight: "900" },
  personText: { color: colors.muted, fontSize: 11, marginTop: 3 },
  label: { color: colors.ink, fontSize: 14, fontWeight: "800", textAlign: "center", marginTop: 20 },
  stepper: { marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 },
  stepButton: { width: 54, height: 54, borderRadius: 17, borderWidth: 1, borderColor: "#BCD2CA", backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  input: { width: 94, height: 64, borderRadius: 17, borderWidth: 2, borderColor: colors.primary, backgroundColor: "white", color: colors.ink, fontSize: 29, fontWeight: "900", textAlign: "center", fontVariant: ["tabular-nums"] },
  result: { color: colors.clay, fontSize: 13, lineHeight: 18, fontWeight: "900", textAlign: "center", marginTop: 10 },
  help: { marginTop: 18, padding: 12, borderRadius: 13, backgroundColor: colors.primarySoft, flexDirection: "row", alignItems: "flex-start", gap: 8 },
  helpText: { flex: 1, color: colors.primaryDark, fontSize: 11, lineHeight: 17 },
  confirm: { minHeight: 50, marginTop: 16, borderRadius: 14, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  confirmText: { color: "white", fontSize: 15, fontWeight: "900" },
});
