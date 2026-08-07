import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Screen, ui } from "@/components/ui";
import { colors } from "@/lib/theme";

const secciones = [
  {
    titulo: "Datos guardados",
    texto: "La aplicación guarda en este dispositivo los nombres y teléfonos de alumnos, grupos, asistencias, clases pendientes, modelos, fotografías, feriados, recordatorios y preferencias del taller.",
  },
  {
    titulo: "Contactos, cámara y fotografías",
    texto: "La agenda se utiliza únicamente cuando elegís un contacto para completar el nombre y el teléfono de un alumno. La cámara y las fotografías se utilizan solamente para agregar imágenes a los modelos de cerámica. La aplicación no publica ni envía automáticamente esa información.",
  },
  {
    titulo: "Copias de seguridad",
    texto: "Las copias se crean únicamente cuando vos lo solicitás. Android muestra las aplicaciones disponibles para que elijas dónde guardarlas o compartirlas. El archivo puede contener nombres, teléfonos y fotografías, por lo que debe conservarse en un lugar privado.",
  },
  {
    titulo: "Uso y transmisión",
    texto: "Nahuel Apps no recibe, vende ni comparte tus datos. La aplicación no utiliza cuentas, publicidad, seguimiento ni servicios de análisis. Los recordatorios se programan localmente en el teléfono.",
  },
  {
    titulo: "Conservación y eliminación",
    texto: "Los datos permanecen en el dispositivo hasta que los elimines desde la aplicación, restaures otra copia o desinstales la aplicación. Las copias exportadas quedan bajo tu control y deben eliminarse desde el lugar donde las hayas guardado.",
  },
  {
    titulo: "Consultas",
    texto: "Responsable: Nahuel Apps. Para consultas sobre privacidad escribí a nahuel.desarrollo45@gmail.com.",
  },
];

export default function PrivacidadScreen() {
  return (
    <Screen
      title="Privacidad"
      subtitle="Cómo se protege la información del taller"
      action={(
        <Pressable accessibilityLabel="Volver" onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="close" size={22} color={colors.primary} />
        </Pressable>
      )}
    >
      <ScrollView contentContainerStyle={ui.list}>
        <View style={styles.intro}>
          <Ionicons name="shield-checkmark-outline" size={28} color={colors.primary} />
          <Text style={styles.introTitle}>Política de privacidad</Text>
          <Text style={styles.introText}>Taller de Cerámica · Vigente desde el 6 de agosto de 2026</Text>
        </View>
        {secciones.map(seccion => (
          <View key={seccion.titulo} style={ui.card}>
            <Text style={styles.sectionTitle}>{seccion.titulo}</Text>
            <Text style={styles.sectionText}>{seccion.texto}</Text>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backButton: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  intro: { padding: 18, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: "center", gap: 6 },
  introTitle: { color: colors.ink, fontSize: 19, fontWeight: "900" },
  introText: { color: colors.muted, fontSize: 11, textAlign: "center" },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: "900", marginBottom: 7 },
  sectionText: { color: colors.muted, fontSize: 12, lineHeight: 19 },
});
