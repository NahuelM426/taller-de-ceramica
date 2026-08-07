import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { AddButton, Empty, Field, FormModal, Screen } from "@/components/ui";
import { EditorImagenesModelo } from "@/components/modelos/EditorImagenesModelo";
import { GaleriaModelo } from "@/components/modelos/GaleriaModelo";
import { VisorImagenesModelo } from "@/components/modelos/VisorImagenesModelo";
import { crearModelo, editarModelo, listarModelos } from "@/repositories/modeloRepository";
import { colors } from "@/lib/theme";
import { imagenesDelModelo } from "@/lib/modelos";
import { Modelo } from "@/models";

export default function ModelosScreen() {
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [editando, setEditando] = useState<Modelo | null | undefined>(undefined);
  const [nombre, setNombre] = useState("");
  const [tipoArcilla, setTipoArcilla] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [imagenes, setImagenes] = useState<string[]>([]);
  const [visor, setVisor] = useState<{ imagenes: string[]; indice: number; titulo: string } | null>(null);
  const cargar = useCallback(async () => setModelos(await listarModelos()), []);
  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const abrirNuevo = () => {
    setNombre(""); setTipoArcilla(""); setDescripcion("");
    setImagenes([]); setEditando(null);
  };
  const abrirEdicion = (modelo: Modelo) => {
    setNombre(modelo.nombre);
    setTipoArcilla(modelo.tipo_arcilla || "");
    setDescripcion(modelo.descripcion || "");
    setImagenes(imagenesDelModelo(modelo));
    setEditando(modelo);
  };
  const cerrar = () => setEditando(undefined);
  const guardar = async () => {
    if (!nombre.trim()) return;
    const data = {
      nombre,
      tipo_arcilla: tipoArcilla || null,
      descripcion: descripcion || null,
      necesita: null,
      imagen_1: imagenes[0] || null,
      imagen_2: imagenes[1] || null,
      imagen_3: imagenes[2] || null,
    };
    if (editando) await editarModelo(editando.id, data);
    else await crearModelo(data);
    cerrar(); await cargar();
  };

  return (
    <Screen title="Modelos" subtitle="Ideas que pueden elegir para la próxima clase" action={<AddButton onPress={abrirNuevo} />}>
      <ScrollView contentContainerStyle={styles.list}>
        {!modelos.length && <Empty text="Cargá el primer modelo para ofrecer." />}
        {modelos.map((modelo, index) => (
          <View key={modelo.id} style={styles.card}>
            <Pressable onPress={() => abrirEdicion(modelo)} style={styles.cardHeader}>
              <View style={[styles.icon, { backgroundColor: index % 2 ? colors.primarySoft : colors.claySoft }]}>
                <Ionicons name="color-palette-outline" size={25} color={index % 2 ? colors.primary : colors.clay} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{modelo.nombre}</Text>
                <Text style={[styles.clay, !modelo.tipo_arcilla && { color: colors.warning }]}>
                  {modelo.tipo_arcilla ? `Arcilla: ${modelo.tipo_arcilla}` : "Falta indicar el tipo de arcilla"}
                </Text>
                {!!modelo.descripcion && <Text style={styles.description}>{modelo.descripcion}</Text>}
              </View>
              <Ionicons name="pencil-outline" size={18} color={colors.primary} />
            </Pressable>
            <GaleriaModelo
              imagenes={imagenesDelModelo(modelo)}
              onPress={indice => setVisor({
                imagenes: imagenesDelModelo(modelo), indice, titulo: modelo.nombre,
              })}
            />
          </View>
        ))}
      </ScrollView>
      <FormModal
        visible={editando !== undefined && !visor}
        title={editando ? "Editar modelo" : "Nuevo modelo"}
        onClose={cerrar}
        onSave={guardar}
        canSave={!!nombre.trim()}
      >
        <Field label="Nombre del modelo" value={nombre} onChangeText={setNombre} placeholder="Ej. Taza con asa" />
        <Field label="Tipo de arcilla" value={tipoArcilla} onChangeText={setTipoArcilla} placeholder="Ej. Arcilla blanca, roja o gres" />
        <EditorImagenesModelo
          imagenes={imagenes}
          onChange={setImagenes}
          onPreview={indice => setVisor({ imagenes, indice, titulo: nombre || "Modelo" })}
        />
        <Field label="Descripción" value={descripcion} onChangeText={setDescripcion} placeholder="Qué pieza o técnica es" multiline style={{ minHeight: 85, textAlignVertical: "top", paddingTop: 13 }} />
      </FormModal>
      <VisorImagenesModelo
        visible={!!visor}
        imagenes={visor?.imagenes || []}
        indice={visor?.indice || 0}
        titulo={visor?.titulo || "Modelo"}
        onChangeIndex={indice => setVisor(actual => actual ? { ...actual, indice } : actual)}
        onClose={() => setVisor(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 12, paddingBottom: 45 },
  card: { gap: 12, padding: 15, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  icon: { width: 47, height: 47, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  name: { color: colors.ink, fontSize: 17, fontWeight: "900" },
  clay: { color: colors.clay, fontSize: 11, fontWeight: "900", marginTop: 3 },
  description: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
});
