import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import type { AlcanceReajustePendiente } from "@/lib/flujoReajuste";
import { colors } from "@/lib/theme";

const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function fechaVisible(fecha: string) {
  return `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
}

export function ElegirAlcanceReajusteModal({
  pendiente,
  guardando,
  error,
  onCancelar,
  onSoloEsta,
  onTodas,
}: {
  pendiente: AlcanceReajustePendiente | null;
  guardando: boolean;
  error: string | null;
  onCancelar: () => void;
  onSoloEsta: () => void;
  onTodas: () => void;
}) {
  const cambiaDia = !!pendiente && pendiente.diaAnterior !== pendiente.nuevoDia;
  return (
    <Modal
      visible={!!pendiente}
      transparent
      animationType="fade"
      onRequestClose={() => !guardando && onCancelar()}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>¿Qué clases querés mover?</Text>
          {!!pendiente && (
            <Text style={styles.message}>
              La clase de {pendiente.grupoNombre} pasará del {fechaVisible(pendiente.fechaOrigen)} al {fechaVisible(pendiente.fechaDestino)}.
            </Text>
          )}
          {!!error && <Text style={styles.error}>{error}</Text>}
          <Pressable
            disabled={guardando}
            onPress={onSoloEsta}
            style={[styles.option, guardando && styles.disabled]}
          >
            <Text style={styles.optionTitle}>Solo esta clase</Text>
            <Text style={styles.optionText}>Las demás fechas del grupo quedan como están.</Text>
          </Pressable>
          <Pressable
            disabled={guardando}
            onPress={onTodas}
            style={[styles.option, styles.optionPrimary, guardando && styles.disabled]}
          >
            <Text style={[styles.optionTitle, styles.optionPrimaryTitle]}>Esta y las siguientes</Text>
            <Text style={[styles.optionText, styles.optionPrimaryText]}>
              {cambiaDia && pendiente
                ? `El grupo pasará de los ${dias[pendiente.diaAnterior]} a los ${dias[pendiente.nuevoDia]} y se regenerarán sus clases futuras.`
                : "Se cambiará el patrón de todas las clases habituales futuras."}
            </Text>
          </Pressable>
          {guardando && (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.loadingText}>Moviendo la clase…</Text>
            </View>
          )}
          <Pressable disabled={guardando} onPress={onCancelar} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancelar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, padding: 22, alignItems: "center", justifyContent: "center", backgroundColor: "#16241FAA" },
  card: { width: "100%", maxWidth: 420, padding: 20, borderRadius: 21, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.ink, fontSize: 20, fontWeight: "900" },
  message: { marginTop: 9, marginBottom: 15, color: colors.muted, fontSize: 14, lineHeight: 20 },
  option: { minHeight: 74, marginTop: 9, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  optionPrimary: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  optionTitle: { color: colors.ink, fontSize: 14, fontWeight: "900" },
  optionText: { marginTop: 4, color: colors.muted, fontSize: 12, lineHeight: 17 },
  optionPrimaryTitle: { color: colors.primaryDark },
  optionPrimaryText: { color: colors.primary },
  error: { marginBottom: 10, padding: 11, borderRadius: 11, color: colors.danger, backgroundColor: "#FFF0EF", fontSize: 12, lineHeight: 17, fontWeight: "700" },
  loading: { marginTop: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  loadingText: { color: colors.primary, fontSize: 13, fontWeight: "900" },
  cancel: { minHeight: 45, marginTop: 12, alignItems: "center", justifyContent: "center" },
  cancelText: { color: colors.muted, fontSize: 13, fontWeight: "900" },
  disabled: { opacity: 0.55 },
});
