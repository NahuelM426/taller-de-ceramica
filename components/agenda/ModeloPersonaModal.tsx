import { useEffect, useMemo, useState } from "react";
import {
  Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GaleriaModelo } from "@/components/modelos/GaleriaModelo";
import { VisorImagenesModelo } from "@/components/modelos/VisorImagenesModelo";
import { colors } from "@/lib/theme";
import { imagenesDelModelo } from "@/lib/modelos";
import { Modelo } from "@/models";

const SIN_NECESIDADES = "No necesita";

export function ModeloPersonaModal({
  visible, alumnoNombre, modelos, modeloIds, necesidadesIniciales,
  onClose, onConfirm,
}: {
  visible: boolean;
  alumnoNombre: string;
  modelos: Modelo[];
  modeloIds: number[];
  necesidadesIniciales: string;
  onClose: () => void;
  onConfirm: (modeloIds: number[], necesidades: string) => Promise<boolean>;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [seleccion, setSeleccion] = useState<number[]>(modeloIds);
  const [necesidades, setNecesidades] = useState(necesidadesIniciales);
  const [necesitaAlgo, setNecesitaAlgo] = useState<boolean | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [visorIndex, setVisorIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!visible) return;
    setBusqueda("");
    setSeleccion(modeloIds);
    setNecesidades(necesidadesIniciales);
    setNecesitaAlgo(
      necesidadesIniciales === SIN_NECESIDADES
        ? false
        : modeloIds.length || necesidadesIniciales ? true : null
    );
    setGuardando(false);
    setVisorIndex(null);
  }, [visible, modeloIds, necesidadesIniciales]);

  const visibles = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase("es");
    return modelos.filter(modelo =>
      !termino || modelo.nombre.toLocaleLowerCase("es").includes(termino) ||
      (modelo.tipo_arcilla || "").toLocaleLowerCase("es").includes(termino) ||
      (modelo.descripcion || "").toLocaleLowerCase("es").includes(termino)
    );
  }, [modelos, busqueda]);
  const modeloElegido = modelos.find(item => item.id === seleccion.at(-1));

  const elegirModelo = (modelo: Modelo) => {
    setSeleccion(actual => actual.includes(modelo.id)
      ? actual.filter(id => id !== modelo.id)
      : [...actual, modelo.id]);
  };

  const mostrarModelo = (modelo: Modelo) => {
    setSeleccion(actual => actual.includes(modelo.id) ? actual : [...actual, modelo.id]);
    setVisorIndex(0);
  };

  const confirmar = async () => {
    if (necesitaAlgo === null || (necesitaAlgo && !seleccion.length) || guardando) return;
    setGuardando(true);
    const guardado = await onConfirm(
      necesitaAlgo ? seleccion : [],
      necesitaAlgo ? necesidades : SIN_NECESIDADES
    );
    if (!guardado) setGuardando(false);
  };

  return (
    <>
    <Modal visible={visible && visorIndex === null} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.backdrop}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Modelo de {alumnoNombre}</Text>
              <Text style={styles.subtitle}>Elegí qué quiere hacer y qué hay que preparar.</Text>
            </View>
            <Pressable accessibilityLabel="Cerrar" onPress={onClose} style={styles.close}>
              <Ionicons name="close" size={21} color={colors.primary} />
            </Pressable>
          </View>

          <View style={styles.preparation}>
            <Text style={styles.sectionLabel}>PREPARACIÓN</Text>
            <Text style={styles.preparationQuestion}>¿Necesita un modelo, molde o material?</Text>
            <View style={styles.needChoices}>
              <NeedChoice
                label="Necesita algo"
                selected={necesitaAlgo === true}
                onPress={() => {
                  setNecesitaAlgo(true);
                  if (necesidades === SIN_NECESIDADES) setNecesidades("");
                }}
              />
              <NeedChoice
                label="No necesita"
                selected={necesitaAlgo === false}
                onPress={() => {
                  setNecesitaAlgo(false);
                  setSeleccion([]);
                  setNecesidades(SIN_NECESIDADES);
                }}
              />
            </View>
          </View>

          {necesitaAlgo === true ? <>
            <View style={styles.search}>
              <Ionicons name="search-outline" size={19} color={colors.muted} />
              <TextInput
                value={busqueda}
                onChangeText={setBusqueda}
                placeholder="Buscar modelo"
                placeholderTextColor="#9AA29E"
                style={styles.searchInput}
              />
              {!!busqueda && (
                <Pressable onPress={() => setBusqueda("")} hitSlop={8}>
                  <Ionicons name="close-circle" size={19} color={colors.muted} />
                </Pressable>
              )}
            </View>

            <ScrollView style={styles.scroll} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
              {!visibles.length && <Text style={styles.empty}>No encontramos modelos con ese nombre.</Text>}
              {visibles.map(modelo => (
              <Pressable
                  key={modelo.id}
                  onPress={() => elegirModelo(modelo)}
                  style={[styles.model, seleccion.includes(modelo.id) && styles.modelOn]}
              >
                {!!modelo.imagen_1 && (
                  <Pressable onPress={() => mostrarModelo(modelo)}>
                    <Image source={{ uri: modelo.imagen_1 }} resizeMode="cover" style={styles.modelThumb} />
                  </Pressable>
                )}
                <View style={{ flex: 1 }}>
                    <Text style={[styles.modelName, seleccion.includes(modelo.id) && { color: colors.primary }]}>{modelo.nombre}</Text>
                    <Text style={[styles.clayType, !modelo.tipo_arcilla && { color: colors.warning }]}>
                      {modelo.tipo_arcilla ? `Arcilla: ${modelo.tipo_arcilla}` : "Tipo de arcilla sin definir"}
                    </Text>
                    {!!modelo.descripcion && <Text style={styles.modelDescription}>{modelo.descripcion}</Text>}
                  </View>
                  <Ionicons
                    name={seleccion.includes(modelo.id) ? "checkbox" : "square-outline"}
                    size={21}
                    color={seleccion.includes(modelo.id) ? colors.primary : colors.muted}
                  />
                </Pressable>
              ))}

              {!!modeloElegido && !!imagenesDelModelo(modeloElegido).length && (
                <View style={styles.preview}>
                  <Text style={styles.previewTitle}>ASÍ SE VE {modeloElegido.nombre.toUpperCase()}</Text>
                  <GaleriaModelo imagenes={imagenesDelModelo(modeloElegido)} onPress={setVisorIndex} />
                </View>
              )}

              {!!seleccion.length && (
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Molde o material necesario</Text>
                  <TextInput
                    value={necesidades}
                    onChangeText={setNecesidades}
                    placeholder="Ej. molde redondo, arcilla blanca y esmalte"
                    placeholderTextColor="#9AA29E"
                    multiline
                    style={styles.input}
                  />
                </View>
              )}
            </ScrollView>
          </> : (
            <View style={styles.modelsDisabled}>
              <Ionicons name={necesitaAlgo === false ? "checkmark-circle-outline" : "information-circle-outline"} size={22} color={necesitaAlgo === false ? colors.success : colors.muted} />
              <Text style={styles.modelsDisabledText}>
                {necesitaAlgo === false
                  ? "No se asignará ningún modelo ni material."
                  : "Primero elegí una opción para habilitar los modelos."}
              </Text>
            </View>
          )}

          <View style={styles.footer}>
            <Pressable disabled={guardando} onPress={onClose} style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>Cancelar</Text>
            </Pressable>
            <Pressable
              disabled={necesitaAlgo === null || (necesitaAlgo && !seleccion.length) || guardando}
              onPress={confirmar}
              style={[styles.confirmButton, (necesitaAlgo === null || (necesitaAlgo && !seleccion.length) || guardando) && { opacity: .4 }]}
            >
              <Text style={styles.confirmText}>{guardando ? "Guardando..." : "Guardar modelos"}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
    <VisorImagenesModelo
      visible={visible && visorIndex !== null}
      imagenes={imagenesDelModelo(modeloElegido)}
      indice={visorIndex || 0}
      titulo={modeloElegido?.nombre || "Modelo"}
      onChangeIndex={setVisorIndex}
      onClose={() => setVisorIndex(null)}
    />
    </>
  );
}

function NeedChoice({ label, selected, onPress }: {
  label: string; selected: boolean; onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.needChoice, selected && styles.needChoiceOn]}>
      <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={17} color={selected ? colors.primary : colors.muted} />
      <Text style={[styles.needText, selected && { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, padding: 18, justifyContent: "center", backgroundColor: "#16241F88" },
  sheet: { maxHeight: "88%", borderRadius: 22, backgroundColor: colors.background, overflow: "hidden" },
  header: { padding: 18, backgroundColor: "white", borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center", gap: 10 },
  title: { color: colors.ink, fontSize: 19, fontWeight: "900" },
  subtitle: { color: colors.muted, fontSize: 12, marginTop: 3 },
  close: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  preparation: { padding: 14, gap: 8, backgroundColor: "#F7F5EF", borderBottomWidth: 1, borderBottomColor: colors.border },
  preparationQuestion: { color: colors.ink, fontSize: 13, fontWeight: "900" },
  search: { margin: 14, marginBottom: 8, minHeight: 47, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: "white", flexDirection: "row", alignItems: "center", gap: 8 },
  searchInput: { flex: 1, color: colors.ink, fontSize: 14 },
  scroll: { flexShrink: 1 },
  list: { padding: 14, paddingTop: 6, gap: 8 },
  empty: { padding: 24, color: colors.muted, textAlign: "center", fontSize: 13 },
  model: { minHeight: 55, padding: 11, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: "white", flexDirection: "row", alignItems: "center", gap: 9 },
  modelThumb: { width: 58, height: 58, borderRadius: 10, backgroundColor: "#E9E7E0" },
  modelOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  modelName: { color: colors.ink, fontSize: 13, fontWeight: "900" },
  clayType: { color: colors.clay, fontSize: 10, fontWeight: "800", marginTop: 3 },
  modelDescription: { color: colors.muted, fontSize: 10, marginTop: 3 },
  preview: { padding: 11, borderRadius: 12, backgroundColor: "#F1F0EB", gap: 8 },
  previewTitle: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: .6 },
  sectionLabel: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: .7, marginTop: 6 },
  needChoices: { flexDirection: "row", gap: 7 },
  needChoice: { flex: 1, minHeight: 42, paddingHorizontal: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: "white", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  needChoiceOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  needText: { color: colors.muted, fontSize: 11, fontWeight: "900" },
  modelsDisabled: { margin: 14, minHeight: 72, padding: 14, borderRadius: 13, backgroundColor: "#F1F0EB", flexDirection: "row", alignItems: "center", gap: 9 },
  modelsDisabledText: { flex: 1, color: colors.muted, fontSize: 12, lineHeight: 18 },
  field: { gap: 6 },
  fieldLabel: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  input: { minHeight: 82, padding: 11, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: "white", color: colors.ink, fontSize: 13, textAlignVertical: "top" },
  footer: { padding: 14, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: "white", flexDirection: "row", gap: 9 },
  secondaryButton: { minHeight: 45, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: colors.muted, fontSize: 13, fontWeight: "900" },
  confirmButton: { flex: 1, minHeight: 45, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  confirmText: { color: "white", fontSize: 13, fontWeight: "900" },
});
