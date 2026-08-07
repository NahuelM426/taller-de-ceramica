import { ReactNode } from "react";
import {
  Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, TextInputProps, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/lib/theme";

export function Screen({ title, subtitle, action, children }: {
  title: string; subtitle?: string; action?: ReactNode; children: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Image source={require("../assets/mundo-ceramica-logo.png")} style={styles.logo} />
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>TALLER DE CERÁMICA</Text>
          <Text style={styles.title}>{title}</Text>
          {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
        {action}
      </View>
      {children}
    </SafeAreaView>
  );
}

export function AddButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityLabel="Agregar" style={styles.addButton} onPress={onPress}>
      <Ionicons name="add" size={25} color="white" />
    </Pressable>
  );
}

export function Empty({ title = "Todavía no hay datos", text }: { title?: string; text: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name="leaf-outline" size={28} color={colors.clay} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.subtitle}>{text}</Text>
    </View>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput placeholderTextColor="#A4AAA7" {...props} style={[styles.input, props.style]} />
    </View>
  );
}

export function Choice({ selected, label, onPress }: { selected: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.choice, selected && styles.choiceOn]}>
      <Text style={[styles.choiceText, selected && styles.choiceTextOn]}>{label}</Text>
    </Pressable>
  );
}

export function FormModal({ visible, title, onClose, onSave, canSave = true, children }: {
  visible: boolean; title: string; onClose: () => void; onSave: () => void; canSave?: boolean; children: ReactNode;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modal}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose}><Text style={styles.cancel}>Cancelar</Text></Pressable>
          <Text style={styles.modalTitle}>{title}</Text>
          <Pressable onPress={onSave} disabled={!canSave}>
            <Text style={[styles.save, !canSave && { opacity: .35 }]}>Guardar</Text>
          </Pressable>
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

export const ui = StyleSheet.create({
  list: { padding: 16, gap: 12, paddingBottom: 45 },
  card: { backgroundColor: colors.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: "row", alignItems: "center" },
  name: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  muted: { color: colors.muted, fontSize: 13, marginTop: 4 },
  sectionLabel: { color: colors.muted, fontSize: 11, fontWeight: "800", letterSpacing: .8, marginTop: 7 },
  chip: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 11, fontWeight: "800" },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingTop: 13, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 11 },
  logo: { width: 46, height: 46, borderRadius: 23 },
  headerText: { flex: 1 },
  eyebrow: { color: colors.clay, fontSize: 10, fontWeight: "900", letterSpacing: 1.1, marginBottom: 3 },
  title: { color: colors.ink, fontSize: 29, lineHeight: 35, fontWeight: "900" },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 2 },
  addButton: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  empty: { margin: 16, padding: 28, gap: 6, alignItems: "center", backgroundColor: "white", borderRadius: 18 },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: colors.ink },
  fieldWrap: { gap: 7 },
  label: { color: colors.ink, fontWeight: "700", fontSize: 14 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: "white", paddingHorizontal: 14, color: colors.ink, fontSize: 16 },
  choice: { minHeight: 43, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "white" },
  choiceOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  choiceText: { color: colors.muted, fontWeight: "700" },
  choiceTextOn: { color: colors.primary },
  modal: { flex: 1, backgroundColor: colors.background },
  modalHeader: { padding: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderColor: colors.border, backgroundColor: "white" },
  modalTitle: { fontSize: 17, fontWeight: "800", color: colors.ink },
  cancel: { color: colors.muted, fontSize: 15 },
  save: { color: colors.primary, fontSize: 15, fontWeight: "800" },
  form: { padding: 20, paddingBottom: 120, gap: 16 },
});
