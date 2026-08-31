import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { Screen, ui } from "@/components/ui";
import {
  compartirCopiaSeguridad,
  elegirCopiaSeguridad,
  estadoCopiaSeguridad,
  hayCopiaDeEmergencia,
  restaurarCopiaDeEmergencia,
  restaurarCopiaSeguridad,
  ResumenCopia,
  resumenDatosActuales,
} from "@/lib/copiaSeguridad";
import { configurarRecordatorioCopia, reprogramarNotificaciones } from "@/lib/notifications";
import { colors } from "@/lib/theme";

function fechaLegible(valor: string) {
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return valor;
  return fecha.toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function RespaldoScreen() {
  const [resumen, setResumen] = useState<ResumenCopia | null>(null);
  const [procesando, setProcesando] = useState<"crear" | "restaurar" | "deshacer" | "recordatorio" | null>(null);
  const [puedeDeshacer, setPuedeDeshacer] = useState(false);
  const [recordatorioActivo, setRecordatorioActivo] = useState(false);
  const [ultimaCopia, setUltimaCopia] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [datos, estado] = await Promise.all([resumenDatosActuales(), estadoCopiaSeguridad()]);
    setResumen(datos);
    setRecordatorioActivo(estado.recordatorioActivo);
    setUltimaCopia(estado.ultimaCopia);
    setPuedeDeshacer(hayCopiaDeEmergencia());
  }, []);
  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const crear = async () => {
    try {
      setProcesando("crear");
      await compartirCopiaSeguridad();
      await cargar();
      Alert.alert(
        "Copia preparada",
        "Guardala en Drive o en Archivos y comprobá que el archivo aparezca allí."
      );
    } catch (error) {
      Alert.alert("No se pudo crear la copia", error instanceof Error ? error.message : "Intentá nuevamente.");
    } finally {
      setProcesando(null);
    }
  };

  const cambiarRecordatorio = async (activo: boolean) => {
    try {
      setProcesando("recordatorio");
      const guardado = await configurarRecordatorioCopia(activo);
      if (!guardado) {
        Alert.alert(
          "No se pudo activar",
          "El teléfono no autorizó las notificaciones. Podés habilitarlas desde los ajustes de Taller de Cerámica."
        );
      }
      await cargar();
    } catch {
      Alert.alert("No se pudo guardar", "Probá nuevamente en unos segundos.");
    } finally {
      setProcesando(null);
    }
  };

  const elegirYRestaurar = async () => {
    try {
      setProcesando("restaurar");
      const seleccion = await elegirCopiaSeguridad();
      if (!seleccion) return;
      Alert.alert(
        "Restaurar esta copia",
        `${seleccion.nombre}\nCreada: ${fechaLegible(seleccion.resumen.creadaEn)}\n${seleccion.resumen.alumnos} alumnos · ${seleccion.resumen.grupos} grupos · ${seleccion.resumen.modelos} modelos\n\nLos datos actuales serán reemplazados. Antes guardaremos una copia interna para poder deshacerlo.`,
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Restaurar",
            style: "destructive",
            onPress: async () => {
              try {
                setProcesando("restaurar");
                await restaurarCopiaSeguridad(seleccion.copia);
                await reprogramarNotificaciones(false);
                await cargar();
                Alert.alert("Copia restaurada", "Los datos del taller ya fueron recuperados.");
              } catch (error) {
                Alert.alert("No se pudo restaurar", error instanceof Error ? error.message : "La copia no pudo aplicarse.");
              } finally {
                setProcesando(null);
              }
            },
          },
        ]
      );
    } catch (error) {
      Alert.alert("Copia no válida", error instanceof Error ? error.message : "Elegí otro archivo.");
    } finally {
      setProcesando(null);
    }
  };

  const confirmarDeshacer = () => Alert.alert(
    "Deshacer última restauración",
    "Volverán los datos que estaban en el teléfono antes de la última restauración.",
    [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Deshacer",
        style: "destructive",
        onPress: async () => {
          try {
            setProcesando("deshacer");
            await restaurarCopiaDeEmergencia();
            await reprogramarNotificaciones(false);
            await cargar();
            Alert.alert("Restauración deshecha", "Volvieron los datos anteriores.");
          } catch (error) {
            Alert.alert("No se pudo deshacer", error instanceof Error ? error.message : "Intentá nuevamente.");
          } finally {
            setProcesando(null);
          }
        },
      },
    ]
  );

  return (
    <Screen
      title="Copia de seguridad"
      subtitle="Protegé la información del taller"
      action={(
        <Pressable accessibilityLabel="Volver" onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="close" size={22} color={colors.primary} />
        </Pressable>
      )}
    >
      <ScrollView contentContainerStyle={ui.list}>
        <View style={[ui.card, styles.summaryCard]}>
          <View style={styles.summaryIcon}>
            <Ionicons name="shield-checkmark-outline" size={25} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryTitle}>Datos incluidos</Text>
            {resumen ? (
              <Text style={styles.summaryText}>
                {resumen.alumnos} alumnos · {resumen.grupos} grupos · {resumen.modelos} modelos{"\n"}
                También incluye agenda, pendientes, pagos, feriados y fotos.
              </Text>
            ) : <ActivityIndicator color={colors.primary} style={{ alignSelf: "flex-start" }} />}
          </View>
        </View>

        <View style={[ui.card, styles.reminderCard]}>
          <View style={styles.actionHeader}>
            <View style={[styles.actionIcon, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="notifications-outline" size={24} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionTitle}>Recordatorio semanal</Text>
              <Text style={styles.actionText}>Todos los domingos a las 20:00.</Text>
            </View>
            {procesando === "recordatorio" ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Switch
                value={recordatorioActivo}
                onValueChange={cambiarRecordatorio}
                trackColor={{ false: colors.border, true: "#8DB7A8" }}
                thumbColor={recordatorioActivo ? colors.primary : "#F4F3EF"}
              />
            )}
          </View>
          <Text style={styles.lastBackupText}>
            {ultimaCopia
              ? `Última copia: ${fechaLegible(ultimaCopia)}`
              : "Todavía no se registró ninguna copia guardada."}
          </Text>
        </View>

        <View style={[ui.card, styles.actionCard]}>
          <View style={styles.actionHeader}>
            <View style={[styles.actionIcon, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="cloud-upload-outline" size={24} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionTitle}>Crear una copia ahora</Text>
              <Text style={styles.actionText}>Se genera un único archivo con todos los datos y fotografías.</Text>
            </View>
          </View>
          <Pressable disabled={!!procesando} onPress={crear} style={styles.primaryButton}>
            {procesando === "crear"
              ? <ActivityIndicator color="white" />
              : <><Ionicons name="download-outline" size={19} color="white" /><Text style={styles.primaryText}>Guardar copia</Text></>}
          </Pressable>
        </View>

        <View style={[ui.card, styles.actionCard]}>
          <View style={styles.actionHeader}>
            <View style={[styles.actionIcon, { backgroundColor: colors.claySoft }]}>
              <Ionicons name="cloud-download-outline" size={24} color={colors.clay} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionTitle}>Restaurar una copia</Text>
              <Text style={styles.actionText}>Elegí un archivo guardado anteriormente para recuperar el taller.</Text>
            </View>
          </View>
          <Pressable disabled={!!procesando} onPress={elegirYRestaurar} style={styles.secondaryButton}>
            {procesando === "restaurar"
              ? <ActivityIndicator color={colors.clay} />
              : <><Ionicons name="folder-open-outline" size={19} color={colors.clay} /><Text style={styles.secondaryText}>Elegir archivo</Text></>}
          </Pressable>
        </View>

        {puedeDeshacer && (
          <Pressable disabled={!!procesando} onPress={confirmarDeshacer} style={styles.undoButton}>
            <Ionicons name="arrow-undo-outline" size={20} color={colors.danger} />
            <View style={{ flex: 1 }}>
              <Text style={styles.undoTitle}>Deshacer última restauración</Text>
              <Text style={styles.undoText}>Recuperar lo que había antes en este teléfono.</Text>
            </View>
          </Pressable>
        )}

        <Pressable onPress={() => router.push("/privacidad" as never)} style={styles.privacyNotice}>
          <Ionicons name="lock-closed-outline" size={21} color={colors.warning} />
          <Text style={styles.privacyText}>
            La copia contiene nombres, teléfonos y fotografías. Guardala en un lugar privado, como tu Drive personal, y no la envíes a grupos.
          </Text>
          <Ionicons name="chevron-forward" size={19} color={colors.warning} />
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backButton: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  summaryCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.primarySoft },
  summaryIcon: { width: 48, height: 48, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "white" },
  summaryTitle: { color: colors.ink, fontSize: 15, fontWeight: "900" },
  summaryText: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 4 },
  actionCard: { gap: 15 },
  reminderCard: { gap: 11 },
  actionHeader: { flexDirection: "row", alignItems: "center", gap: 11 },
  actionIcon: { width: 47, height: 47, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  actionTitle: { color: colors.ink, fontSize: 15, fontWeight: "900" },
  actionText: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 4 },
  lastBackupText: { color: colors.primary, fontSize: 11, fontWeight: "800", paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  primaryButton: { minHeight: 49, borderRadius: 13, backgroundColor: colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryText: { color: "white", fontSize: 13, fontWeight: "900" },
  secondaryButton: { minHeight: 49, borderRadius: 13, backgroundColor: colors.claySoft, borderWidth: 1, borderColor: "#E3C3B2", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  secondaryText: { color: colors.clay, fontSize: 13, fontWeight: "900" },
  undoButton: { minHeight: 66, padding: 13, borderRadius: 14, backgroundColor: "#FFF0EF", borderWidth: 1, borderColor: "#F0C1BD", flexDirection: "row", alignItems: "center", gap: 10 },
  undoTitle: { color: colors.danger, fontSize: 13, fontWeight: "900" },
  undoText: { color: colors.muted, fontSize: 10, marginTop: 3 },
  privacyNotice: { padding: 14, borderRadius: 14, backgroundColor: "#FFF7E7", flexDirection: "row", alignItems: "flex-start", gap: 10 },
  privacyText: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 18 },
});
