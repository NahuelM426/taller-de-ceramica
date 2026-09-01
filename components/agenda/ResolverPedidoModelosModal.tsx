import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors } from "@/lib/theme";
import type { DestinoPedidoModelos, PedidoModelosPendiente } from "@/models";

const fechaVisible = (fecha: string) =>
  `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;

export function ResolverPedidoModelosModal({
  visible,
  alumnoNombre,
  pedido,
  guardando,
  onClose,
  onSelect,
}: {
  visible: boolean;
  alumnoNombre: string;
  pedido: PedidoModelosPendiente | null;
  guardando: boolean;
  onClose: () => void;
  onSelect: (destino: DestinoPedidoModelos) => void;
}) {
  const resumen = [
    ...(pedido?.modelo_nombres || []),
    ...(pedido?.necesidades || []),
  ];
  const proximaFecha = pedido?.proxima_clase_fecha || null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => !guardando && onClose()}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.icon}>
              <Ionicons name="color-palette-outline" size={24} color={colors.clay} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Pedido pendiente</Text>
              <Text style={styles.subtitle}>
                {alumnoNombre} había pedido esto para una clase a la que no vino.
              </Text>
            </View>
          </View>

          <View style={styles.request}>
            <Text style={styles.requestLabel}>MODELO, MOLDE O MATERIAL</Text>
            <Text style={styles.requestText}>
              {resumen.length ? resumen.join(" · ") : "Pedido sin detalle"}
            </Text>
          </View>

          <Text style={styles.question}>¿Dónde querés usar este pedido?</Text>
          <View style={styles.options}>
            <Option
              icon="refresh-circle-outline"
              title="Usar en este recuperatorio"
              detail="Aparecerá en esta fecha y en el aviso de preparación."
              disabled={guardando}
              onPress={() => onSelect("recuperacion")}
            />
            <Option
              icon="calendar-outline"
              title="Dejar para su próxima clase"
              detail={proximaFecha
                ? `Quedará asignado al ${fechaVisible(proximaFecha)}.`
                : "Todavía no tiene otra clase habitual programada."}
              disabled={guardando || !proximaFecha}
              onPress={() => onSelect("proxima_clase")}
            />
          </View>

          {guardando && (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.loadingText}>Guardando la recuperación…</Text>
            </View>
          )}

          <Pressable
            disabled={guardando}
            onPress={onClose}
            style={[styles.cancel, guardando && styles.disabled]}
          >
            <Text style={styles.cancelText}>Cancelar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function Option({ icon, title, detail, disabled, onPress }: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        pressed && styles.optionPressed,
        disabled && styles.disabled,
      ]}
    >
      <View style={styles.optionIcon}>
        <Ionicons name={icon} size={22} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionDetail}>{detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={19} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, padding: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#16241FAA" },
  card: { width: "100%", maxWidth: 440, padding: 19, borderRadius: 22, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, elevation: 8 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#F5E7DF" },
  title: { color: colors.ink, fontSize: 21, fontWeight: "900" },
  subtitle: { marginTop: 4, color: colors.muted, fontSize: 12, lineHeight: 18 },
  request: { marginTop: 17, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: "#E5C8B7", backgroundColor: "#FFF8F3" },
  requestLabel: { color: colors.clay, fontSize: 10, fontWeight: "900", letterSpacing: 0.7 },
  requestText: { marginTop: 5, color: colors.ink, fontSize: 15, lineHeight: 21, fontWeight: "800" },
  question: { marginTop: 18, color: colors.ink, fontSize: 14, fontWeight: "900" },
  options: { marginTop: 9, gap: 9 },
  option: { minHeight: 72, padding: 11, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: "white", flexDirection: "row", alignItems: "center", gap: 10 },
  optionPressed: { borderColor: colors.primary, backgroundColor: colors.primarySoft, transform: [{ scale: 0.99 }] },
  optionIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  optionTitle: { color: colors.ink, fontSize: 14, fontWeight: "900" },
  optionDetail: { marginTop: 3, color: colors.muted, fontSize: 11, lineHeight: 16 },
  loading: { marginTop: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  loadingText: { color: colors.primary, fontSize: 12, fontWeight: "900" },
  cancel: { minHeight: 47, marginTop: 16, borderRadius: 13, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  cancelText: { color: colors.muted, fontSize: 13, fontWeight: "900" },
  disabled: { opacity: 0.45 },
});
