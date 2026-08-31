import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { Empty, Screen, ui } from "@/components/ui";
import { agendaDelMes } from "@/repositories/agendaRepository";
import { listarFeriados } from "@/repositories/feriadoRepository";
import { listarGrupos } from "@/repositories/grupoRepository";
import { colors } from "@/lib/theme";
import {
  armarVacantes, fechaLocal, horaTexto, mensajeVacante,
  momentoTexto,
} from "@/lib/vacantes";
import { AgendaAlumno, Feriado, Grupo, Vacante } from "@/models";

export default function VacantesScreen() {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [agenda, setAgenda] = useState<AgendaAlumno[]>([]);
  const [feriados, setFeriados] = useState<Feriado[]>([]);
  const [loading, setLoading] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    const fin = new Date();
    fin.setDate(fin.getDate() + 60);
    const inicioTexto = fechaLocal();
    const finTexto = fechaLocal(fin);
    const [gruposCargados, agendaCargada, feriadosCargados] = await Promise.all([
      listarGrupos(), agendaDelMes(inicioTexto, finTexto), listarFeriados(inicioTexto, finTexto),
    ]);
    setGrupos(gruposCargados);
    setAgenda(agendaCargada);
    setFeriados(feriadosCargados);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const vacantes = useMemo(
    () => armarVacantes(grupos, agenda, feriados),
    [grupos, agenda, feriados]
  );

  const compartir = async (mensaje: string) => {
    try {
      await Share.share(
        { message: mensaje, title: "Aviso de vacantes" },
        { dialogTitle: "Compartir aviso de vacantes" }
      );
    } catch {
      Alert.alert("No se pudo compartir", "Probá nuevamente en unos segundos.");
    }
  };

  return (
    <Screen
      title="Vacantes"
      subtitle="Próximas fechas con lugares disponibles"
      action={(
        <Pressable accessibilityLabel="Volver" onPress={() => router.back()} style={styles.close}>
          <Ionicons name="close" size={24} color={colors.primary} />
        </Pressable>
      )}
    >
      <ScrollView
        contentContainerStyle={ui.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={cargar} />}
      >
        <View style={styles.info}>
          <Ionicons name="logo-whatsapp" size={21} color={colors.success} />
          <Text style={styles.infoText}>Elegí una fecha y compartí el aviso en el grupo de WhatsApp.</Text>
        </View>
        {!vacantes.length && !loading && (
          <Empty title="No hay vacantes" text="Las próximas clases están completas." />
        )}
        {vacantes.map(vacante => (
          <VacanteCard key={vacante.key} vacante={vacante} onShare={compartir} />
        ))}
      </ScrollView>
    </Screen>
  );
}

function VacanteCard({ vacante, onShare }: {
  vacante: Vacante;
  onShare: (mensaje: string) => void;
}) {
  const aviso = mensajeVacante(vacante);
  return (
    <View style={[ui.card, styles.card, { borderLeftColor: vacante.grupo.color }]}>
      <View style={ui.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.date}>{momentoTexto(vacante.fecha).toUpperCase()}</Text>
          <Text style={ui.name}>{vacante.grupo.nombre}</Text>
          <Text style={ui.muted}>{horaTexto(vacante.grupo.hora)} · {vacante.vienen.length} asisten de {vacante.grupo.capacidad}</Text>
          {!!vacante.liberados && (
            <Text style={styles.released}>
              {vacante.liberados} {vacante.liberados === 1 ? "lugar liberado" : "lugares liberados"} por ausencias
            </Text>
          )}
        </View>
        <View style={styles.spots}>
          <Text style={styles.spotsNumber}>{vacante.lugares}</Text>
          <Text style={styles.spotsLabel}>{vacante.lugares === 1 ? "lugar" : "lugares"}</Text>
        </View>
      </View>
      <View style={styles.messageBox}><Text style={styles.message}>{aviso}</Text></View>
      <Pressable onPress={() => onShare(aviso)} style={styles.primaryButton}>
        <Ionicons name="logo-whatsapp" size={18} color="white" />
        <Text style={styles.primaryButtonText}>Compartir aviso</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  close: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  info: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 14, backgroundColor: colors.primarySoft },
  infoText: { flex: 1, color: colors.ink, fontSize: 13, lineHeight: 18 },
  card: { borderLeftWidth: 5, gap: 12 },
  date: { color: colors.clay, fontSize: 11, fontWeight: "900", marginBottom: 4 },
  spots: { minWidth: 61, padding: 9, alignItems: "center", borderRadius: 13, backgroundColor: colors.claySoft },
  spotsNumber: { color: colors.clay, fontSize: 22, lineHeight: 24, fontWeight: "900" },
  spotsLabel: { color: colors.clay, fontSize: 10, fontWeight: "800" },
  released: { color: colors.success, fontSize: 12, fontWeight: "800", marginTop: 4 },
  messageBox: { padding: 12, borderRadius: 12, backgroundColor: "#F3F1EA" },
  message: { color: colors.ink, fontSize: 13, lineHeight: 19 },
  primaryButton: { minHeight: 45, borderRadius: 12, backgroundColor: colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryButtonText: { color: "white", fontSize: 13, fontWeight: "900" },
});
