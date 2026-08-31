import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ViewShot from "react-native-view-shot";

import { CalendarioCompartible } from "@/components/calendario/CalendarioCompartible";
import {
  ejecutarCompartirCalendarioUnaVez,
  filtrarGruposCompartibles,
  nombreArchivoCalendario,
  puedeCompartirVistaPrevia,
  prepararCalendarioCompartible,
} from "@/lib/calendarioCompartible";
import { colors } from "@/lib/theme";
import type { AgendaAlumno, Grupo } from "@/models";

export function CompartirCalendarioModal({
  visible,
  cursor,
  grupos,
  agenda,
  onClose,
}: {
  visible: boolean;
  cursor: Date;
  grupos: Grupo[];
  agenda: AgendaAlumno[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const gruposActivos = useMemo(() => grupos.filter(grupo => grupo.activo === 1), [grupos]);
  const [idsSeleccionados, setIdsSeleccionados] = useState<number[]>([]);
  const gruposIncluidos = useMemo(
    () => filtrarGruposCompartibles(grupos, idsSeleccionados),
    [grupos, idsSeleccionados]
  );
  const data = useMemo(
    () => prepararCalendarioCompartible(cursor, gruposIncluidos, agenda),
    [cursor, gruposIncluidos, agenda]
  );
  const capturaRef = useRef<ViewShot>(null);
  const bloqueo = useRef({ actual: false });
  const [vistaLista, setVistaLista] = useState(false);
  const [logoListo, setLogoListo] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [preparando, setPreparando] = useState(false);
  const [compartido, setCompartido] = useState(false);
  const compartirHabilitado = puedeCompartirVistaPrevia({
    vistaLista,
    logoListo,
    preparando,
  });

  const compartir = useCallback(async () => {
    if (!vistaLista || !logoListo || bloqueo.current.actual) return;
    setPreparando(true);
    try {
      await ejecutarCompartirCalendarioUnaVez(bloqueo.current, async () => {
        if (!(await Sharing.isAvailableAsync())) {
          throw new Error("Este dispositivo no permite compartir imágenes.");
        }
        const uriCaptura = await capturaRef.current?.capture?.();
        if (!uriCaptura) throw new Error("No se pudo generar la imagen del calendario.");
        const destino = new File(Paths.cache, nombreArchivoCalendario(data));
        if (destino.exists) destino.delete();
        new File(uriCaptura).copy(destino);
        await Sharing.shareAsync(destino.uri, {
          mimeType: "image/png",
          UTI: "public.png",
          dialogTitle: "Compartir calendario del taller",
        });
        setCompartido(true);
      });
    } catch (error) {
      Alert.alert(
        "No se pudo compartir",
        error instanceof Error ? error.message : "Probá nuevamente en unos segundos."
      );
    } finally {
      setPreparando(false);
    }
  }, [data, vistaLista, logoListo]);

  useEffect(() => {
    if (visible) {
      setIdsSeleccionados(gruposActivos.map(grupo => grupo.id));
    } else {
      setVistaLista(false);
      setLogoListo(false);
      setLogoError(false);
      setPreparando(false);
      setCompartido(false);
      bloqueo.current.actual = false;
    }
  }, [visible, gruposActivos]);

  const alternarGrupo = (grupoId: number) => {
    setIdsSeleccionados(actual => actual.includes(grupoId)
      ? actual.filter(id => id !== grupoId)
      : [...actual, grupoId]);
    setCompartido(false);
  };

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={() => !preparando && onClose()}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{preparando ? "Preparando calendario…" : "Vista previa"}</Text>
            <Text style={styles.subtitle}>Esta es exactamente la imagen que se comparte.</Text>
          </View>
          <Pressable disabled={preparando} onPress={onClose} style={styles.close}>
            <Text style={styles.closeText}>Cerrar</Text>
          </Pressable>
        </View>
        {!!gruposActivos.length && (
          <View style={styles.groupSelector}>
            <View style={styles.groupSelectorHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.groupSelectorTitle}>Grupos a compartir</Text>
                <Text style={styles.groupSelectorHint}>Desmarcá los que no querés mostrar.</Text>
              </View>
              <Pressable
                onPress={() => {
                  setIdsSeleccionados(
                    idsSeleccionados.length === gruposActivos.length
                      ? []
                      : gruposActivos.map(grupo => grupo.id)
                  );
                  setCompartido(false);
                }}
                style={styles.selectAll}
              >
                <Text style={styles.selectAllText}>
                  {idsSeleccionados.length === gruposActivos.length ? "Ninguno" : "Todos"}
                </Text>
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.groupOptions}
            >
              {gruposActivos.map(grupo => {
                const seleccionado = idsSeleccionados.includes(grupo.id);
                return (
                  <Pressable
                    key={grupo.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: seleccionado }}
                    accessibilityLabel={`${grupo.nombre}, ${seleccionado ? "incluido" : "excluido"}`}
                    onPress={() => alternarGrupo(grupo.id)}
                    style={[styles.groupOption, seleccionado && styles.groupOptionSelected]}
                  >
                    <View style={[styles.groupColor, { backgroundColor: grupo.color }]} />
                    <Text style={[styles.groupOptionText, seleccionado && styles.groupOptionTextSelected]}>
                      {grupo.nombre}
                    </Text>
                    <Ionicons
                      name={seleccionado ? "checkmark-circle" : "ellipse-outline"}
                      size={18}
                      color={seleccionado ? colors.primary : colors.muted}
                    />
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}
        <ScrollView contentContainerStyle={styles.previewScroll}>
          {visible && <ViewShot
              ref={capturaRef}
              options={{ format: "png", quality: 1, result: "tmpfile" }}
              onLayout={() => setVistaLista(true)}
              style={styles.previewShadow}
            >
              <CalendarioCompartible
                data={data}
                onLogoListo={() => setLogoListo(true)}
                onLogoError={() => {
                  setLogoError(true);
                  setLogoListo(false);
                }}
              />
            </ViewShot>}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: Math.max(16, insets.bottom + 10) }]}>
          {!gruposIncluidos.length ? (
            <Text style={styles.emptySelection}>Elegí al menos un grupo para compartir.</Text>
          ) : preparando ? (
            <View style={styles.preparing}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.preparingText}>Preparando calendario…</Text>
            </View>
          ) : logoError ? (
            <Text style={styles.logoError}>No se pudo cargar el logo. Cerrá la vista previa y volvé a intentarlo.</Text>
          ) : !compartirHabilitado ? (
            <View style={styles.preparing}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.preparingText}>Preparando vista previa…</Text>
            </View>
          ) : (
            <Pressable
              disabled={!compartirHabilitado}
              onPress={() => void compartir()}
              style={styles.shareAgain}
            >
              <Text style={styles.shareAgainText}>{compartido ? "Compartir nuevamente" : "Compartir"}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  title: { color: colors.ink, fontSize: 20, fontWeight: "900" },
  subtitle: { marginTop: 3, color: colors.muted, fontSize: 11 },
  close: { minHeight: 40, paddingHorizontal: 13, alignItems: "center", justifyContent: "center" },
  closeText: { color: colors.primary, fontSize: 12, fontWeight: "900" },
  groupSelector: { paddingVertical: 11, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  groupSelectorHeader: { paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 10 },
  groupSelectorTitle: { color: colors.ink, fontSize: 13, fontWeight: "900" },
  groupSelectorHint: { marginTop: 2, color: colors.muted, fontSize: 10 },
  selectAll: { minHeight: 34, paddingHorizontal: 11, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  selectAllText: { color: colors.primary, fontSize: 11, fontWeight: "900" },
  groupOptions: { paddingHorizontal: 18, paddingTop: 10, gap: 8 },
  groupOption: { minHeight: 38, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: colors.background },
  groupOptionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  groupColor: { width: 8, height: 24, borderRadius: 4 },
  groupOptionText: { maxWidth: 150, color: colors.muted, fontSize: 11, fontWeight: "800" },
  groupOptionTextSelected: { color: colors.ink },
  previewScroll: { padding: 16, alignItems: "center" },
  previewShadow: { backgroundColor: "#FFFDF9", borderRadius: 4, overflow: "hidden", elevation: 4 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card },
  preparing: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  preparingText: { color: colors.primary, fontSize: 13, fontWeight: "900" },
  shareAgain: { minHeight: 48, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  shareAgainText: { color: "white", fontSize: 13, fontWeight: "900" },
  emptySelection: { minHeight: 48, color: colors.clay, fontSize: 12, lineHeight: 18, fontWeight: "900", textAlign: "center", textAlignVertical: "center" },
  logoError: { minHeight: 48, color: colors.danger, fontSize: 12, lineHeight: 18, fontWeight: "800", textAlign: "center", textAlignVertical: "center" },
});
