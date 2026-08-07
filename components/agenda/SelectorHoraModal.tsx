import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/lib/theme";

const horas = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const minutos = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));

export function BotonSelectorHora({ label, value, onPress }: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={onPress} style={styles.timeButton}>
        <Ionicons name="time-outline" size={21} color={colors.primary} />
        <Text style={styles.timeValue}>{value}</Text>
        <Text style={styles.change}>Elegir</Text>
      </Pressable>
    </View>
  );
}

export function SelectorHoraModal({ visible, titulo, valor, onClose, onConfirm }: {
  visible: boolean;
  titulo: string;
  valor: string;
  onClose: () => void;
  onConfirm: (hora: string) => void;
}) {
  const [hora, setHora] = useState("14");
  const [minuto, setMinuto] = useState("00");
  const horasScroll = useRef<ScrollView>(null);
  const minutosScroll = useRef<ScrollView>(null);

  const posicionarListas = (horaActual: string, minutoActual: string) => {
    horasScroll.current?.scrollTo({ y: Math.max(0, Number(horaActual) * 47 - 94), animated: false });
    minutosScroll.current?.scrollTo({ y: Math.max(0, Number(minutoActual) * 47 - 94), animated: false });
  };

  useEffect(() => {
    if (!visible) return;
    const [horaInicial = "14", minutoInicial = "00"] = valor.split(":");
    setHora(horaInicial.padStart(2, "0"));
    setMinuto(minutoInicial.padStart(2, "0"));
    const timer = setTimeout(() => posicionarListas(horaInicial, minutoInicial), 250);
    return () => clearTimeout(timer);
  }, [valor, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.header}>
            <Pressable onPress={onClose} style={styles.headerButton}>
              <Ionicons name="close" size={22} color={colors.muted} />
            </Pressable>
            <Text style={styles.title}>{titulo}</Text>
            <View style={styles.headerButton} />
          </View>

          <View style={styles.preview}>
            <Ionicons name="time" size={24} color={colors.primary} />
            <Text style={styles.previewText}>{hora}:{minuto}</Text>
          </View>

          <View style={styles.pickers}>
            <View style={styles.column}>
              <Text style={styles.columnTitle}>HORA</Text>
              <ScrollView
                ref={horasScroll}
                style={styles.optionsScroll}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
                onContentSizeChange={() => visible && posicionarListas(hora, minuto)}
                contentContainerStyle={styles.options}
              >
                {horas.map(item => (
                  <Pressable key={item} onPress={() => setHora(item)} style={[styles.option, hora === item && styles.optionOn]}>
                    <Text style={[styles.optionText, hora === item && styles.optionTextOn]}>{item}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
            <Text style={styles.separator}>:</Text>
            <View style={styles.column}>
              <Text style={styles.columnTitle}>MINUTOS</Text>
              <ScrollView
                ref={minutosScroll}
                style={styles.optionsScroll}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
                onContentSizeChange={() => visible && posicionarListas(hora, minuto)}
                contentContainerStyle={styles.options}
              >
                {minutos.map(item => (
                  <Pressable key={item} onPress={() => setMinuto(item)} style={[styles.option, minuto === item && styles.optionOn]}>
                    <Text style={[styles.optionText, minuto === item && styles.optionTextOn]}>{item}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>

          <Pressable onPress={() => onConfirm(`${hora}:${minuto}`)} style={styles.confirm}>
            <Text style={styles.confirmText}>Confirmar hora</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(24, 31, 29, .55)", alignItems: "center", justifyContent: "center", padding: 20 },
  card: { width: "100%", height: "78%", maxWidth: 430, maxHeight: 570, borderRadius: 24, backgroundColor: colors.background, padding: 18, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, color: colors.ink, fontSize: 18, fontWeight: "900", textAlign: "center" },
  preview: { marginVertical: 15, minHeight: 62, borderRadius: 16, backgroundColor: colors.primarySoft, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  previewText: { color: colors.primary, fontSize: 28, fontWeight: "900", fontVariant: ["tabular-nums"] },
  pickers: { flex: 1, minHeight: 0, flexDirection: "row", alignItems: "stretch", gap: 10, overflow: "hidden" },
  column: { flex: 1, minHeight: 0, overflow: "hidden" },
  columnTitle: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1, textAlign: "center", marginBottom: 7 },
  options: { gap: 5, paddingBottom: 12 },
  optionsScroll: { flex: 1 },
  option: { height: 42, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "white", borderWidth: 1, borderColor: colors.border },
  optionOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionText: { color: colors.muted, fontSize: 17, fontWeight: "800", fontVariant: ["tabular-nums"] },
  optionTextOn: { color: "white" },
  separator: { color: colors.ink, fontSize: 25, fontWeight: "900", marginTop: 22 },
  confirm: { minHeight: 50, marginTop: 16, borderRadius: 14, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  confirmText: { color: "white", fontSize: 15, fontWeight: "900" },
  field: { gap: 7 },
  label: { color: colors.ink, fontWeight: "700", fontSize: 14 },
  timeButton: { minHeight: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: "white", flexDirection: "row", alignItems: "center", gap: 9 },
  timeValue: { flex: 1, color: colors.ink, fontSize: 18, fontWeight: "900", fontVariant: ["tabular-nums"] },
  change: { color: colors.primary, fontSize: 12, fontWeight: "900" },
});
