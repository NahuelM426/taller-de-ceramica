import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { nombreMesPago } from "@/lib/pagos";
import { colors } from "@/lib/theme";
import type { Alumno, CantidadClasesPagadas, EstadoPagoAlumno } from "@/models";

export function PagoAlumnoModal({
  alumno, pago, mes, onClose, onConfirm, onPayExtrasOnly,
}: {
  alumno: Alumno | null;
  pago: EstadoPagoAlumno | null;
  mes: string;
  onClose: () => void;
  onConfirm: (
    pagado: boolean,
    clasesPagadas: CantidadClasesPagadas,
    cobrarExtras: boolean
  ) => Promise<void>;
  onPayExtrasOnly: () => Promise<void>;
}) {
  const [pagado, setPagado] = useState(false);
  const [clasesPagadas, setClasesPagadas] = useState<CantidadClasesPagadas>(2);
  const [cobrarExtras, setCobrarExtras] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!alumno || !pago) return;
    setPagado(pago.pagado === 1);
    setClasesPagadas(pago.clases_pagadas);
    setCobrarExtras(false);
    setGuardando(false);
  }, [alumno, pago]);

  const guardar = async () => {
    if (!alumno || guardando) return;
    setGuardando(true);
    try {
      await onConfirm(pagado, clasesPagadas, cobrarExtras);
    } finally {
      setGuardando(false);
    }
  };

  const cobrarSoloExtras = async () => {
    if (!alumno || !pago?.clases_extra_adeudadas || guardando) return;
    setGuardando(true);
    try {
      await onPayExtrasOnly();
    } finally {
      setGuardando(false);
    }
  };

  const extrasAdeudadas = pago?.clases_extra_adeudadas || 0;

  return (
    <Modal visible={!!alumno && !!pago} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          <ScrollView
            contentContainerStyle={styles.cardContent}
            showsVerticalScrollIndicator={false}
          >
          <View style={styles.header}>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={22} color={colors.muted} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Pago de {nombreMesPago(mes)}</Text>
              <Text style={styles.subtitle}>{alumno?.nombre}</Text>
            </View>
            <View style={styles.closeButton} />
          </View>

          <Text style={styles.label}>Estado de la cuota</Text>
          <View style={styles.optionsRow}>
            <Pressable onPress={() => setPagado(true)} style={[styles.option, pagado && styles.paidOption]}>
              <Ionicons name={pagado ? "checkmark-circle" : "ellipse-outline"} size={21} color={pagado ? colors.success : colors.muted} />
              <Text style={[styles.optionText, pagado && { color: colors.success }]}>Pagó</Text>
            </Pressable>
            <Pressable onPress={() => {
              setPagado(false);
              setCobrarExtras(false);
            }} style={[styles.option, !pagado && styles.unpaidOption]}>
              <Ionicons name={!pagado ? "alert-circle" : "ellipse-outline"} size={21} color={!pagado ? colors.danger : colors.muted} />
              <Text style={[styles.optionText, !pagado && { color: colors.danger }]}>No pagó</Text>
            </Pressable>
          </View>

          <Text style={styles.label}>Cantidad de clases pagadas</Text>
          <View style={styles.optionsRow}>
            <Pressable onPress={() => setClasesPagadas(2)} style={[styles.option, clasesPagadas === 2 && styles.selectedOption]}>
              <Text style={[styles.classesNumber, clasesPagadas === 2 && styles.selectedText]}>2</Text>
              <Text style={[styles.optionText, clasesPagadas === 2 && styles.selectedText]}>clases</Text>
            </Pressable>
            <Pressable onPress={() => setClasesPagadas(4)} style={[styles.option, clasesPagadas === 4 && styles.selectedOption]}>
              <Text style={[styles.classesNumber, clasesPagadas === 4 && styles.selectedText]}>4</Text>
              <Text style={[styles.optionText, clasesPagadas === 4 && styles.selectedText]}>clases</Text>
            </Pressable>
          </View>

          {!!extrasAdeudadas && (
            <View style={styles.extrasSection}>
              <View style={styles.extrasHeading}>
                <View style={styles.extrasIcon}>
                  <Ionicons name="cash-outline" size={20} color={colors.danger} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.extrasTitle}>Clases extra a cobrar</Text>
                  <Text style={styles.extrasText}>
                    {extrasAdeudadas} {extrasAdeudadas === 1 ? "clase pendiente" : "clases pendientes"}
                  </Text>
                </View>
              </View>

              <Pressable
                disabled={!pagado || guardando}
                onPress={() => setCobrarExtras(actual => !actual)}
                style={[
                  styles.collectTogether,
                  cobrarExtras && styles.collectTogetherOn,
                  !pagado && { opacity: .45 },
                ]}
              >
                <Ionicons
                  name={cobrarExtras ? "checkbox" : "square-outline"}
                  size={21}
                  color={cobrarExtras ? colors.primary : colors.muted}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.collectTitle}>Cobrar junto con la cuota</Text>
                  <Text style={styles.collectDetail}>
                    {pagado ? "Guarda la cuota y salda las extras" : "Marcá Pagó para usar esta opción"}
                  </Text>
                </View>
              </Pressable>

              <Pressable
                disabled={guardando}
                onPress={cobrarSoloExtras}
                style={[styles.extrasOnlyButton, guardando && { opacity: .5 }]}
              >
                <Ionicons name="cash" size={18} color={colors.primary} />
                <Text style={styles.extrasOnlyText}>Cobrar solo extras</Text>
              </Pressable>
            </View>
          )}

          <Pressable disabled={guardando} onPress={guardar} style={[styles.confirm, guardando && { opacity: .5 }]}>
            <Text style={styles.confirmText}>
              {guardando
                ? "Guardando..."
                : cobrarExtras
                  ? "Guardar cuota y extras"
                  : "Guardar pago"}
            </Text>
          </Pressable>
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, padding: 18, backgroundColor: "rgba(24, 31, 29, .55)", alignItems: "center", justifyContent: "center" },
  card: { width: "100%", maxWidth: 430, maxHeight: "92%", borderRadius: 24, backgroundColor: colors.background, overflow: "hidden" },
  cardContent: { padding: 18 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  closeButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  title: { color: colors.ink, fontSize: 18, fontWeight: "900", textAlign: "center", textTransform: "capitalize" },
  subtitle: { color: colors.muted, fontSize: 12, fontWeight: "700", textAlign: "center", marginTop: 3 },
  label: { color: colors.ink, fontSize: 13, fontWeight: "900", marginTop: 12, marginBottom: 8 },
  optionsRow: { flexDirection: "row", gap: 9 },
  option: { flex: 1, minHeight: 54, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: "white", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  paidOption: { borderColor: colors.success, backgroundColor: "#EAF5F0" },
  unpaidOption: { borderColor: "#E9ABA5", backgroundColor: "#FFF0EF" },
  selectedOption: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  optionText: { color: colors.muted, fontSize: 13, fontWeight: "900" },
  classesNumber: { color: colors.muted, fontSize: 21, fontWeight: "900" },
  selectedText: { color: colors.primary },
  extrasSection: { marginTop: 16, padding: 12, borderRadius: 15, borderWidth: 1, borderColor: "#E9ABA5", backgroundColor: "#FFF8F6", gap: 10 },
  extrasHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  extrasIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#FDE9E6" },
  extrasTitle: { color: colors.ink, fontSize: 14, fontWeight: "900" },
  extrasText: { color: colors.danger, fontSize: 12, fontWeight: "800", marginTop: 2 },
  collectTogether: { minHeight: 52, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: "white", flexDirection: "row", alignItems: "center", gap: 9 },
  collectTogetherOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  collectTitle: { color: colors.ink, fontSize: 12, fontWeight: "900" },
  collectDetail: { color: colors.muted, fontSize: 10, marginTop: 2 },
  extrasOnlyButton: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: "white" },
  extrasOnlyText: { color: colors.primary, fontSize: 13, fontWeight: "900" },
  confirm: { minHeight: 50, marginTop: 16, borderRadius: 14, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  confirmText: { color: "white", fontSize: 15, fontWeight: "900" },
});
