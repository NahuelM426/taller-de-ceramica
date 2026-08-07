import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { colors } from "@/lib/theme";

export function EditorImagenesModelo({ imagenes, onChange, onPreview }: {
  imagenes: string[];
  onChange: (imagenes: string[]) => void;
  onPreview?: (index: number) => void;
}) {
  const elegirImagenes = async () => {
    const disponibles = 3 - imagenes.length;
    if (disponibles < 1) return;
    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: disponibles,
      quality: .55,
      base64: true,
    });
    if (resultado.canceled) return;
    const nuevas = resultado.assets.map(asset =>
      asset.base64
        ? `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`
        : asset.uri
    );
    onChange([...imagenes, ...nuevas].slice(0, 3));
  };

  const tomarFoto = async () => {
    if (imagenes.length >= 3) return;
    const permiso = await ImagePicker.requestCameraPermissionsAsync();
    if (!permiso.granted) {
      Alert.alert("Permiso necesario", "Necesitamos acceso a la cámara para tomar la foto.");
      return;
    }
    const resultado = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"], quality: .55, base64: true,
    });
    if (resultado.canceled) return;
    const asset = resultado.assets[0];
    const imagen = asset.base64
      ? `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`
      : asset.uri;
    onChange([...imagenes, imagen].slice(0, 3));
  };

  const quitar = (index: number) => onChange(imagenes.filter((_, actual) => actual !== index));
  const hacerPrincipal = (index: number) => {
    if (index === 0) return;
    onChange([imagenes[index], ...imagenes.filter((_, actual) => actual !== index)]);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Imágenes del modelo</Text>
          <Text style={styles.subtitle}>{imagenes.length}/3 fotos cargadas</Text>
        </View>
        <View style={styles.actions}>
          <Pressable
            disabled={imagenes.length >= 3}
            onPress={tomarFoto}
            style={[styles.iconButton, imagenes.length >= 3 && { opacity: .4 }]}
          >
            <Ionicons name="camera-outline" size={19} color={colors.primary} />
          </Pressable>
          <Pressable
            disabled={imagenes.length >= 3}
            onPress={elegirImagenes}
            style={[styles.addButton, imagenes.length >= 3 && { opacity: .4 }]}
          >
            <Ionicons name="images-outline" size={17} color={colors.primary} />
            <Text style={styles.addText}>Galería</Text>
          </Pressable>
        </View>
      </View>
      {!!imagenes.length && (
        <View style={styles.images}>
          {imagenes.map((uri, index) => (
            <View key={`${uri.slice(0, 40)}-${index}`} style={styles.imageWrap}>
              <Pressable disabled={!onPreview} onPress={() => onPreview?.(index)}>
                <Image source={{ uri }} resizeMode="cover" style={styles.image} />
              </Pressable>
              <Pressable onPress={() => hacerPrincipal(index)} style={[styles.primary, index === 0 && styles.primaryOn]}>
                <Ionicons name={index === 0 ? "star" : "star-outline"} size={11} color={index === 0 ? "white" : colors.ink} />
                <Text style={[styles.primaryText, index === 0 && { color: "white" }]}>
                  {index === 0 ? "Principal" : "Hacer principal"}
                </Text>
              </Pressable>
              <Pressable accessibilityLabel="Quitar imagen" onPress={() => quitar(index)} style={styles.remove}>
                <Ionicons name="close" size={15} color="white" />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, padding: 12, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: "white" },
  header: { flexDirection: "row", alignItems: "center", gap: 9 },
  title: { color: colors.ink, fontSize: 13, fontWeight: "900" },
  subtitle: { color: colors.muted, fontSize: 10, marginTop: 3 },
  actions: { flexDirection: "row", gap: 6 },
  iconButton: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  addButton: { minHeight: 38, paddingHorizontal: 10, borderRadius: 10, backgroundColor: colors.primarySoft, flexDirection: "row", alignItems: "center", gap: 5 },
  addText: { color: colors.primary, fontSize: 10, fontWeight: "900" },
  images: { flexDirection: "row", gap: 8 },
  imageWrap: { flex: 1, position: "relative" },
  image: { width: "100%", height: 100, borderRadius: 11, backgroundColor: "#E9E7E0" },
  primary: { position: "absolute", left: 4, right: 4, bottom: 4, minHeight: 24, paddingHorizontal: 4, borderRadius: 7, backgroundColor: "#FFFFFFDD", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3 },
  primaryOn: { backgroundColor: colors.primary },
  primaryText: { color: colors.ink, fontSize: 7, fontWeight: "900" },
  remove: { position: "absolute", top: 5, right: 5, width: 26, height: 26, borderRadius: 13, backgroundColor: "#8F3E3E", alignItems: "center", justifyContent: "center" },
});
