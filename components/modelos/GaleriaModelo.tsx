import { Image, Pressable, StyleSheet, Text, View } from "react-native";

export function GaleriaModelo({ imagenes, compacta = false, onPress }: {
  imagenes: string[];
  compacta?: boolean;
  onPress?: (index: number) => void;
}) {
  if (!imagenes.length) return null;
  return (
    <View style={styles.gallery}>
      {imagenes.slice(0, 3).map((uri, index) => (
        <Pressable key={`${uri.slice(0, 40)}-${index}`} disabled={!onPress} onPress={() => onPress?.(index)} style={compacta ? styles.compactWrap : styles.imageWrap}>
          <Image
          key={`${uri.slice(0, 40)}-${index}`}
          source={{ uri }}
          resizeMode="cover"
          style={compacta ? styles.compactImage : styles.image}
          />
          {index === 0 && <Text style={styles.primary}>PRINCIPAL</Text>}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  gallery: { flexDirection: "row", gap: 7 },
  imageWrap: { flex: 1 },
  compactWrap: { position: "relative" },
  image: { width: "100%", height: 105, borderRadius: 12, backgroundColor: "#E9E7E0" },
  compactImage: { width: 54, height: 54, borderRadius: 10, backgroundColor: "#E9E7E0" },
  primary: { position: "absolute", left: 4, right: 4, bottom: 4, paddingVertical: 2, borderRadius: 5, backgroundColor: "#00000099", color: "white", textAlign: "center", fontSize: 7, fontWeight: "900" },
});
