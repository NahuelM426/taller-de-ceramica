import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { FormModal } from "@/components/ui";
import { etiquetaRecuperacion } from "@/lib/movimientosClase";
import { colors } from "@/lib/theme";
import type { AgendaAlumno, Feriado } from "@/models";

const SIN_NECESIDADES = "No necesita";

interface DetalleDiaModalProps {
  visible: boolean;
  fecha: string | null;
  esDetalleGrupo: boolean;
  personas: AgendaAlumno[];
  feriado?: Feriado;
  hoy: string;
  guardandoAsistencia: number | null;
  onClose: () => void;
  onCrearGrupo: (fecha: string) => void;
  onEditarModelo: (persona: AgendaAlumno) => void;
  onQuitar: (persona: AgendaAlumno) => void;
  onCambiarAsistencia: (persona: AgendaAlumno, viene: boolean) => void;
  onAgregarPersona: () => void;
  onMoverClase: () => void;
  onDeshacerMovimiento: () => void;
}

export function DetalleDiaModal({
  visible,
  fecha,
  esDetalleGrupo,
  personas,
  feriado,
  hoy,
  guardandoAsistencia,
  onClose,
  onCrearGrupo,
  onEditarModelo,
  onQuitar,
  onCambiarAsistencia,
  onAgregarPersona,
  onMoverClase,
  onDeshacerMovimiento,
}: DetalleDiaModalProps) {
  return (
    <FormModal
      visible={visible}
      title={esDetalleGrupo ? "Detalle del grupo" : fecha ? `Día ${fecha.slice(8, 10)}` : "Organizar día"}
      onClose={onClose}
      onSave={onClose}
    >
      <View style={[
        styles.daySummary,
        feriado && {
          backgroundColor: feriado.tipo === "compromiso" ? colors.claySoft : "#FFF0EF",
        },
      ]}>
        <Text style={styles.daySummaryTitle}>{fecha}</Text>
        <Text style={styles.daySummaryText}>
          {feriado
            ? `${feriado.motivo}${feriado.fecha_recuperacion
                ? ` · Recuperan el ${feriado.fecha_recuperacion.slice(8, 10)}/${feriado.fecha_recuperacion.slice(5, 7)}/${feriado.fecha_recuperacion.slice(0, 4)}`
                : ""}`
            : `${personas.length} persona${personas.length === 1 ? "" : "s"} programada${personas.length === 1 ? "" : "s"}`}
        </Text>
        <Pressable
          onPress={() => fecha && onCrearGrupo(fecha)}
          style={styles.addGroupInSummary}
        >
          <Ionicons name="add" size={20} color="white" />
          <Text style={styles.addGroupInSummaryText}>Crear grupo</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>PERSONAS DE ESTE DÍA</Text>
      {!personas.length && (
        <Text style={styles.emptyText}>Todavía no hay personas cargadas para este día.</Text>
      )}
      {personas.map(item => (
        <View key={item.id} style={[styles.personRow, { borderLeftColor: item.grupo_color }]}>
          <View style={styles.personHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.personName}>{item.alumno_nombre}</Text>
              <Text style={styles.personMeta}>
                {item.hora} · {item.grupo_nombre}
                {item.feriado_origen
                  ? ` · ${etiquetaRecuperacion(item.motivo_movimiento, item.feriado_origen)}`
                  : item.tipo === "recuperacion" ? " · Recuperación" : ""}
              </Text>
              <Text style={[
                styles.personModel,
                !item.modelo_id && item.necesidades !== SIN_NECESIDADES && {
                  color: colors.warning,
                },
              ]}>
                {item.necesidades === SIN_NECESIDADES
                  ? "No necesita modelo"
                  : item.modelo_nombre || "Falta preguntarle qué modelo quiere"}
              </Text>
              {!!item.necesidades && (
                <Text style={styles.personNeeds}>
                  {item.necesidades === SIN_NECESIDADES
                    ? "No necesita molde ni materiales"
                    : `Necesita: ${item.necesidades}`}
                </Text>
              )}
            </View>
            <View style={styles.personActions}>
              <Pressable onPress={() => onEditarModelo(item)} style={styles.modelEditButton}>
                <Ionicons name="color-palette-outline" size={15} color={colors.primary} />
                <Text style={styles.modelEditText}>Modelo</Text>
              </Pressable>
              <Pressable onPress={() => onQuitar(item)} style={styles.deleteButton}>
                <Ionicons name="close" size={15} color={colors.danger} />
                <Text style={styles.deleteButtonText}>Quitar</Text>
              </Pressable>
            </View>
          </View>
          <Text style={styles.attendanceLabel}>¿Viene a esta clase?</Text>
          <View style={styles.attendanceChoices}>
            <Pressable
              disabled={guardandoAsistencia === item.id}
              onPress={() => onCambiarAsistencia(item, true)}
              style={[
                styles.attendanceChoice,
                item.estado !== "ausente" && styles.attendanceYes,
              ]}
            >
              <Ionicons
                name={item.estado !== "ausente" ? "radio-button-on" : "radio-button-off"}
                size={17}
                color={item.estado !== "ausente" ? colors.success : colors.muted}
              />
              <Text style={[
                styles.attendanceText,
                item.estado !== "ausente" && { color: colors.success },
              ]}>Sí, viene</Text>
            </Pressable>
            <Pressable
              disabled={guardandoAsistencia === item.id}
              onPress={() => onCambiarAsistencia(item, false)}
              style={[
                styles.attendanceChoice,
                item.estado === "ausente" && styles.attendanceNo,
              ]}
            >
              <Ionicons
                name={item.estado === "ausente" ? "radio-button-on" : "radio-button-off"}
                size={17}
                color={item.estado === "ausente" ? colors.danger : colors.muted}
              />
              <Text style={[
                styles.attendanceText,
                item.estado === "ausente" && { color: colors.danger },
              ]}>No viene</Text>
            </Pressable>
          </View>
        </View>
      ))}

      {!!fecha && fecha >= hoy && <>
        <Text style={styles.sectionTitle}>AGREGAR UNA PERSONA</Text>
        <Pressable onPress={onAgregarPersona} style={styles.personPickerButton}>
          <View style={styles.personPickerIcon}>
            <Ionicons name="person-add-outline" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.personPickerTitle}>Elegir persona</Text>
            <Text style={styles.personPickerText}>
              Buscar, elegir cómo ocupa el lugar y confirmar
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={19} color={colors.primary} />
        </Pressable>
      </>}

      <Text style={styles.sectionTitle}>MOVER ESTA CLASE</Text>
      {!feriado ? (
        <Pressable onPress={onMoverClase} style={styles.datePickerButton}>
          <View style={styles.datePickerIcon}>
            <Ionicons name="calendar-outline" size={20} color={colors.clay} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.datePickerTitle}>Mover esta clase</Text>
            <Text style={styles.datePickerText}>Elegir motivo y fecha de recuperación</Text>
          </View>
          <Ionicons name="chevron-forward" size={19} color={colors.clay} />
        </Pressable>
      ) : (
        <Pressable onPress={onDeshacerMovimiento} style={styles.holidayButton}>
          <Text style={styles.holidayButtonText}>Quitar movimiento y volver atrás</Text>
        </Pressable>
      )}
    </FormModal>
  );
}

const styles = StyleSheet.create({
  daySummary: { padding: 15, borderRadius: 14, backgroundColor: colors.primarySoft },
  daySummaryTitle: { color: colors.ink, fontSize: 19, fontWeight: "900" },
  daySummaryText: { color: colors.muted, fontSize: 12, marginTop: 4 },
  addGroupInSummary: { minHeight: 42, marginTop: 14, borderRadius: 11, backgroundColor: colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  addGroupInSummaryText: { color: "white", fontSize: 12, fontWeight: "900" },
  sectionTitle: { color: colors.muted, fontSize: 11, fontWeight: "900", letterSpacing: .8, marginTop: 4 },
  emptyText: { color: colors.muted, fontSize: 13, fontStyle: "italic" },
  personRow: { minHeight: 58, gap: 9, padding: 11, borderRadius: 12, borderLeftWidth: 5, backgroundColor: "white", borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  personHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  personActions: { alignItems: "stretch", gap: 6 },
  personName: { color: colors.ink, fontSize: 14, fontWeight: "900" },
  personMeta: { color: colors.muted, fontSize: 10, marginTop: 3 },
  personModel: { color: colors.primary, fontSize: 11, fontWeight: "900", marginTop: 5 },
  personNeeds: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 2 },
  modelEditButton: { minHeight: 34, paddingHorizontal: 8, borderRadius: 9, backgroundColor: colors.primarySoft, flexDirection: "row", alignItems: "center", gap: 4 },
  modelEditText: { color: colors.primary, fontSize: 9, fontWeight: "900" },
  deleteButton: { minHeight: 34, paddingHorizontal: 8, borderRadius: 9, backgroundColor: "#FFF0EF", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  deleteButtonText: { color: colors.danger, fontSize: 9, fontWeight: "900" },
  attendanceLabel: { color: colors.muted, fontSize: 11, fontWeight: "800", marginTop: 2 },
  attendanceChoices: { flexDirection: "row", gap: 7 },
  attendanceChoice: { flex: 1, minHeight: 39, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: "white", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  attendanceYes: { borderColor: colors.success, backgroundColor: `${colors.success}12` },
  attendanceNo: { borderColor: colors.danger, backgroundColor: `${colors.danger}10` },
  attendanceText: { color: colors.muted, fontSize: 11, fontWeight: "900" },
  personPickerButton: { minHeight: 66, padding: 12, borderRadius: 13, borderWidth: 1, borderColor: "#BCD2CA", backgroundColor: colors.primarySoft, flexDirection: "row", alignItems: "center", gap: 10 },
  personPickerIcon: { width: 39, height: 39, borderRadius: 12, backgroundColor: "white", alignItems: "center", justifyContent: "center" },
  personPickerTitle: { color: colors.primary, fontSize: 14, fontWeight: "900" },
  personPickerText: { color: colors.muted, fontSize: 10, marginTop: 3 },
  datePickerButton: { minHeight: 66, padding: 12, borderRadius: 13, borderWidth: 1, borderColor: "#E5C8B8", backgroundColor: colors.claySoft, flexDirection: "row", alignItems: "center", gap: 10 },
  datePickerIcon: { width: 39, height: 39, borderRadius: 12, backgroundColor: "white", alignItems: "center", justifyContent: "center" },
  datePickerTitle: { color: colors.clay, fontSize: 14, fontWeight: "900" },
  datePickerText: { color: colors.muted, fontSize: 10, marginTop: 3 },
  holidayButton: { minHeight: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF0EF", borderWidth: 1, borderColor: "#F0C5C0" },
  holidayButtonText: { color: colors.danger, fontSize: 13, fontWeight: "900" },
});
