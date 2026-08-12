import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import {
  controlesReajusteDeshabilitados,
  type ReajustePendiente,
} from "@/lib/flujoReajuste";
import { colors } from "@/lib/theme";

function fechaVisible(fecha: string) {
  return `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
}

export function ConfirmarReajusteModal({
  pendiente,
  guardando,
  error,
  onCancelar,
  onConfirmar,
}: {
  pendiente: ReajustePendiente | null;
  guardando: boolean;
  error: string | null;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  const deshabilitado = controlesReajusteDeshabilitados(guardando);

  return (
    <Modal
      visible={!!pendiente}
      transparent
      animationType="fade"
      onRequestClose={() => !deshabilitado && onCancelar()}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Reajustar el grupo</Text>
          {!!pendiente && (
            <Text style={styles.message}>
              La clase del {fechaVisible(pendiente.fechaOrigen)} pasará al {fechaVisible(pendiente.fechaDestino)} y se cambiará el patrón de todas las clases habituales futuras de {pendiente.grupoNombre}.
            </Text>
          )}
          {!!error && <Text style={styles.error}>{error}</Text>}
          {guardando && (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.loadingText}>Reajustando…</Text>
            </View>
          )}
          <View style={styles.actions}>
            <Pressable
              disabled={deshabilitado}
              onPress={onCancelar}
              style={[styles.secondary, deshabilitado && styles.disabled]}
            >
              <Text style={styles.secondaryText}>Cancelar</Text>
            </Pressable>
            <Pressable
              disabled={deshabilitado}
              onPress={onConfirmar}
              style={[styles.primary, deshabilitado && styles.disabled]}
            >
              <Text style={styles.primaryText}>
                {guardando ? "Reajustando…" : error ? "Volver a intentar" : "Reajustar"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, padding: 22, alignItems: "center", justifyContent: "center", backgroundColor: "#16241FAA" },
  card: { width: "100%", maxWidth: 420, padding: 20, borderRadius: 21, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.ink, fontSize: 20, fontWeight: "900" },
  message: { marginTop: 10, color: colors.muted, fontSize: 14, lineHeight: 21 },
  error: { marginTop: 13, padding: 11, borderRadius: 11, color: colors.danger, backgroundColor: "#FFF0EF", fontSize: 12, lineHeight: 17, fontWeight: "700" },
  loading: { marginTop: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  loadingText: { color: colors.primary, fontSize: 13, fontWeight: "900" },
  actions: { marginTop: 20, flexDirection: "row", gap: 9 },
  secondary: { minHeight: 47, paddingHorizontal: 17, alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  secondaryText: { color: colors.muted, fontSize: 13, fontWeight: "900" },
  primary: { flex: 1, minHeight: 47, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.primary },
  primaryText: { color: "white", fontSize: 13, fontWeight: "900" },
  disabled: { opacity: 0.55 },
});
