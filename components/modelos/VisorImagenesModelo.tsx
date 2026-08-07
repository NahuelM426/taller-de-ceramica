import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export function VisorImagenesModelo({
  visible, imagenes, indice, titulo, onChangeIndex, onClose,
}: {
  visible: boolean;
  imagenes: string[];
  indice: number;
  titulo: string;
  onChangeIndex: (index: number) => void;
  onClose: () => void;
}) {
  const actual = Math.min(Math.max(0, indice), Math.max(0, imagenes.length - 1));
  if (!imagenes.length) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{titulo}</Text>
            <Text style={styles.counter}>{actual + 1} de {imagenes.length}</Text>
          </View>
          <Pressable accessibilityLabel="Cerrar imagen" onPress={onClose} style={styles.close}>
            <Ionicons name="close" size={24} color="white" />
          </Pressable>
        </View>

        <View style={styles.main}>
          <Image source={{ uri: imagenes[actual] }} resizeMode="contain" style={styles.image} />
          {actual > 0 && (
            <Pressable onPress={() => onChangeIndex(actual - 1)} style={[styles.arrow, styles.arrowLeft]}>
              <Ionicons name="chevron-back" size={27} color="white" />
            </Pressable>
          )}
          {actual < imagenes.length - 1 && (
            <Pressable onPress={() => onChangeIndex(actual + 1)} style={[styles.arrow, styles.arrowRight]}>
              <Ionicons name="chevron-forward" size={27} color="white" />
            </Pressable>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
          {imagenes.map((uri, index) => (
            <Pressable key={`${uri.slice(0, 40)}-${index}`} onPress={() => onChangeIndex(index)}>
              <Image source={{ uri }} resizeMode="cover" style={[styles.thumb, index === actual && styles.thumbOn]} />
              {index === 0 && <Text style={styles.primaryLabel}>PRINCIPAL</Text>}
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, paddingTop: 44, paddingBottom: 28, backgroundColor: "#07100DEE" },
  header: { paddingHorizontal: 18, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  title: { color: "white", fontSize: 18, fontWeight: "900" },
  counter: { color: "#C9D1CE", fontSize: 12, marginTop: 3 },
  close: { width: 43, height: 43, borderRadius: 15, backgroundColor: "#FFFFFF20", alignItems: "center", justifyContent: "center" },
  main: { flex: 1, position: "relative", justifyContent: "center" },
  image: { width: "100%", height: "100%" },
  arrow: { position: "absolute", top: "46%", width: 44, height: 50, borderRadius: 15, backgroundColor: "#00000070", alignItems: "center", justifyContent: "center" },
  arrowLeft: { left: 10 },
  arrowRight: { right: 10 },
  thumbs: { paddingHorizontal: 18, paddingTop: 14, gap: 9 },
  thumb: { width: 68, height: 68, borderRadius: 11, borderWidth: 2, borderColor: "transparent", opacity: .65 },
  thumbOn: { borderColor: "white", opacity: 1 },
  primaryLabel: { position: "absolute", left: 3, right: 3, bottom: 3, paddingVertical: 2, borderRadius: 5, backgroundColor: "#00000099", color: "white", textAlign: "center", fontSize: 7, fontWeight: "900" },
});
