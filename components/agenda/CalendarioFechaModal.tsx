import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/lib/theme";

const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const semana = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

const fechaTexto = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function CalendarioFechaModal({
  visible, titulo, fechaInicial, fechaMinima, fechaExcluida, onClose, onConfirm,
}: {
  visible: boolean;
  titulo: string;
  fechaInicial?: string;
  fechaMinima: string;
  fechaExcluida?: string;
  onClose: () => void;
  onConfirm: (fecha: string) => void;
}) {
  const fechaBase = fechaInicial || fechaExcluida || fechaMinima;
  const [cursor, setCursor] = useState(() => inicioMes(fechaBase));
  const [seleccion, setSeleccion] = useState(fechaInicial || "");

  useEffect(() => {
    if (!visible) return;
    setCursor(inicioMes(fechaBase));
    setSeleccion(fechaInicial || "");
  }, [visible, fechaBase, fechaInicial]);

  const celdas = useMemo(() => {
    const year = cursor.getFullYear(), month = cursor.getMonth();
    const blancos = (new Date(year, month, 1).getDay() + 6) % 7;
    const dias = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: 42 }, (_, index) => {
      const dia = index - blancos + 1;
      if (dia < 1 || dia > dias) return null;
      return { dia, fecha: fechaTexto(new Date(year, month, dia, 12)) };
    });
  }, [cursor]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{titulo}</Text>
              <Text style={styles.subtitle}>Elegí el día y confirmá.</Text>
            </View>
            <Pressable accessibilityLabel="Cerrar" onPress={onClose} style={styles.close}>
              <Ionicons name="close" size={21} color={colors.primary} />
            </Pressable>
          </View>

          <View style={styles.monthHeader}>
            <Pressable onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} style={styles.arrow}>
              <Ionicons name="chevron-back" size={20} color={colors.primary} />
            </Pressable>
            <Text style={styles.month}>{meses[cursor.getMonth()].toUpperCase()} {cursor.getFullYear()}</Text>
            <Pressable onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} style={styles.arrow}>
              <Ionicons name="chevron-forward" size={20} color={colors.primary} />
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {semana.map(dia => <Text key={dia} style={styles.weekday}>{dia}</Text>)}
          </View>
          <View style={styles.days}>
            {celdas.map((celda, index) => {
              const bloqueada = !!celda && (celda.fecha < fechaMinima || celda.fecha === fechaExcluida);
              const elegida = !!celda && celda.fecha === seleccion;
              return (
                <Pressable
                  key={index}
                  disabled={!celda || bloqueada}
                  onPress={() => celda && setSeleccion(celda.fecha)}
                  style={[styles.day, elegida && styles.dayOn]}
                >
                  {!!celda && <Text style={[
                    styles.dayText, bloqueada && styles.dayDisabled, elegida && styles.dayTextOn,
                  ]}>{celda.dia}</Text>}
                </Pressable>
              );
            })}
          </View>

          {!!seleccion && <Text style={styles.selected}>Fecha elegida: {seleccion.slice(8, 10)}/{seleccion.slice(5, 7)}/{seleccion.slice(0, 4)}</Text>}
          <View style={styles.footer}>
            <Pressable onPress={onClose} style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>Cancelar</Text>
            </Pressable>
            <Pressable
              disabled={!seleccion || seleccion === fechaExcluida || seleccion < fechaMinima}
              onPress={() => onConfirm(seleccion)}
              style={[styles.confirmButton, (!seleccion || seleccion === fechaExcluida || seleccion < fechaMinima) && { opacity: .4 }]}
            >
              <Text style={styles.confirmText}>Confirmar fecha</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function inicioMes(fecha: string) {
  const date = new Date(`${fecha}T12:00:00`);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, padding: 18, justifyContent: "center", backgroundColor: "#16241F88" },
  card: { borderRadius: 22, backgroundColor: colors.background, overflow: "hidden" },
  header: { padding: 18, backgroundColor: "white", borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center", gap: 10 },
  title: { color: colors.ink, fontSize: 19, fontWeight: "900" },
  subtitle: { color: colors.muted, fontSize: 12, marginTop: 3 },
  close: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  monthHeader: { padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  arrow: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  month: { color: colors.ink, fontSize: 15, fontWeight: "900" },
  weekRow: { paddingHorizontal: 12, flexDirection: "row" },
  weekday: { width: `${100 / 7}%`, color: colors.muted, fontSize: 9, fontWeight: "900", textAlign: "center", paddingBottom: 7 },
  days: { paddingHorizontal: 12, flexDirection: "row", flexWrap: "wrap" },
  day: { width: `${100 / 7}%`, aspectRatio: 1.08, alignItems: "center", justifyContent: "center", borderRadius: 11 },
  dayOn: { backgroundColor: colors.primary },
  dayText: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  dayDisabled: { color: "#C6CBC8" },
  dayTextOn: { color: "white" },
  selected: { marginHorizontal: 16, marginTop: 8, padding: 11, borderRadius: 11, color: colors.primary, backgroundColor: colors.primarySoft, textAlign: "center", fontSize: 12, fontWeight: "900" },
  footer: { padding: 14, marginTop: 6, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: "white", flexDirection: "row", gap: 9 },
  secondaryButton: { minHeight: 45, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: colors.muted, fontSize: 13, fontWeight: "900" },
  confirmButton: { flex: 1, minHeight: 45, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  confirmText: { color: "white", fontSize: 13, fontWeight: "900" },
});
