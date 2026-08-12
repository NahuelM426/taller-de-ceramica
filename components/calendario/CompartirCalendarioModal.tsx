import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import ViewShot from "react-native-view-shot";

import { CalendarioCompartible } from "@/components/calendario/CalendarioCompartible";
import {
  ejecutarCompartirCalendarioUnaVez,
  nombreArchivoCalendario,
  puedeCompartirVistaPrevia,
  prepararCalendarioCompartible,
} from "@/lib/calendarioCompartible";
import { colors } from "@/lib/theme";
import type { Grupo } from "@/models";

export function CompartirCalendarioModal({
  visible,
  cursor,
  grupos,
  onClose,
}: {
  visible: boolean;
  cursor: Date;
  grupos: Grupo[];
  onClose: () => void;
}) {
  const data = useMemo(() => prepararCalendarioCompartible(cursor, grupos), [cursor, grupos]);
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
    if (!visible) {
      setVistaLista(false);
      setLogoListo(false);
      setLogoError(false);
      setPreparando(false);
      setCompartido(false);
      bloqueo.current.actual = false;
    }
  }, [visible]);

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
        <View style={styles.footer}>
          {preparando ? (
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
  previewScroll: { padding: 16, alignItems: "center" },
  previewShadow: { backgroundColor: "#FFFDF9", borderRadius: 4, overflow: "hidden", elevation: 4 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card },
  preparing: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  preparingText: { color: colors.primary, fontSize: 13, fontWeight: "900" },
  shareAgain: { minHeight: 48, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  shareAgainText: { color: "white", fontSize: 13, fontWeight: "900" },
  logoError: { minHeight: 48, color: colors.danger, fontSize: 12, lineHeight: 18, fontWeight: "800", textAlign: "center", textAlignVertical: "center" },
});
