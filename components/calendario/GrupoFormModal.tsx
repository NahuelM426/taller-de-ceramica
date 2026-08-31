import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { CalendarioFechaModal } from "@/components/agenda/CalendarioFechaModal";
import { BotonSelectorHora, SelectorHoraModal } from "@/components/agenda/SelectorHoraModal";
import { Choice, Field, FormModal } from "@/components/ui";
import { anticipacionDesdeHorario, horarioDesdeAnticipacion } from "@/lib/horarios";
import { notificacionesDisponibles, reprogramarNotificaciones } from "@/lib/notifications";
import { colors, groupColors } from "@/lib/theme";
import type { FrecuenciaGrupo, Grupo } from "@/models";
import { crearGrupo, editarGrupo, eliminarGrupo } from "@/repositories/grupoRepository";

const diasCompletos = [
  "Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado",
];
const diasSelectorGrupo = [1, 2, 3, 4, 5, 6, 0];

const iso = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const proximaFechaDelDia = (dia: number, desde: string) => {
  const fecha = new Date(`${desde}T12:00:00`);
  while (fecha.getDay() !== dia) fecha.setDate(fecha.getDate() + 1);
  return iso(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
};

interface GrupoFormModalProps {
  grupo: Grupo | null;
  fechaInicial: string;
  colorInicial: string;
  hoy: string;
  cantidadIntegrantes: number;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onDeleted: () => Promise<void>;
}

export function GrupoFormModal({
  grupo,
  fechaInicial,
  colorInicial,
  hoy,
  cantidadIntegrantes,
  onClose,
  onSaved,
  onDeleted,
}: GrupoFormModalProps) {
  const diaInicial = grupo?.dia ?? new Date(`${fechaInicial}T12:00:00`).getDay();
  const horarioAviso = grupo
    ? horarioDesdeAnticipacion(grupo.hora, grupo.minutos_antes)
    : { diasAntes: 1, horaAviso: "10:00" };
  const [nombre, setNombre] = useState(grupo?.nombre || "");
  const [dia, setDia] = useState(diaInicial);
  const [hora, setHora] = useState(grupo?.hora || "14:00");
  const [capacidad, setCapacidad] = useState(String(grupo?.capacidad || 6));
  const [color, setColor] = useState(grupo?.color || colorInicial);
  const [notificacion, setNotificacion] = useState(!!grupo?.notificacion);
  const [frecuencia, setFrecuencia] = useState<FrecuenciaGrupo>(
    grupo?.frecuencia || "semanal"
  );
  const [primeraClase, setPrimeraClase] = useState(
    grupo?.fecha_inicio || fechaInicial
  );
  const [diasAntes, setDiasAntes] = useState(String(horarioAviso.diasAntes));
  const [horaAviso, setHoraAviso] = useState(horarioAviso.horaAviso);
  const [selectorHoraVisible, setSelectorHoraVisible] = useState(false);
  const [selectorAvisoVisible, setSelectorAvisoVisible] = useState(false);
  const [selectorFechaVisible, setSelectorFechaVisible] = useState(false);

  const guardar = async () => {
    if (!nombre.trim() || !hora.trim()) return;
    const cantidadDias = Math.max(0, Number(diasAntes) || 0);
    const minutosAntes = anticipacionDesdeHorario(hora, cantidadDias, horaAviso);
    if (notificacion && minutosAntes < 0) {
      Alert.alert(
        "Horario de aviso inválido",
        "Si elegís 0 días antes, la hora del aviso tiene que ser anterior a la clase."
      );
      return;
    }
    if (new Date(`${primeraClase}T12:00:00`).getDay() !== dia) {
      Alert.alert(
        "Revisá la primera clase",
        "La fecha elegida tiene que coincidir con el día del grupo."
      );
      return;
    }
    const data = {
      nombre,
      dia,
      hora,
      capacidad: Math.max(1, Number(capacidad) || 6),
      color,
      notificacion: notificacion ? 1 : 0,
      minutos_antes: minutosAntes,
      frecuencia,
      fecha_inicio: primeraClase,
    };
    try {
      if (grupo) {
        await editarGrupo(grupo.id, data);
      } else {
        await crearGrupo(data);
      }
      const notificacionesOk = await reprogramarNotificaciones(notificacion);
      if (notificacion && !notificacionesOk) {
        Alert.alert(
          notificacionesDisponibles() ? "Notificaciones desactivadas" : "Requiere la app instalada",
          notificacionesDisponibles()
            ? "El grupo quedó guardado, pero el teléfono no autorizó los recordatorios. Podés habilitarlos desde los ajustes del dispositivo."
            : "Expo Go no ejecuta este módulo completo en Android. El recordatorio funcionará en la development build o APK instalada de Taller de Cerámica."
        );
      }
      await onSaved();
    } catch (error) {
      Alert.alert(
        "No se pudo guardar el grupo",
        error instanceof Error ? error.message : "Revisá las fechas e intentá nuevamente."
      );
    }
  };

  const confirmarEliminar = () => {
    if (!grupo) return;
    Alert.alert(
      "Eliminar grupo",
      `${grupo.nombre} dejará de aparecer. ${cantidadIntegrantes
        ? `${cantidadIntegrantes} alumno${cantidadIntegrantes === 1 ? "" : "s"} quedará${cantidadIntegrantes === 1 ? "" : "n"} sin grupo habitual. `
        : ""}Las clases futuras se cancelarán y el historial anterior se conservará.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar grupo",
          style: "destructive",
          onPress: async () => {
            try {
              await eliminarGrupo(grupo.id);
              await reprogramarNotificaciones(false);
              await onDeleted();
            } catch {
              Alert.alert("No se pudo eliminar", "Probá nuevamente en unos segundos.");
            }
          },
        },
      ]
    );
  };

  return <>
    <FormModal
      visible={!selectorHoraVisible && !selectorAvisoVisible && !selectorFechaVisible}
      title={grupo ? "Editar grupo" : "Nuevo grupo"}
      onClose={onClose}
      onSave={guardar}
      canSave={!!nombre.trim() && !!hora.trim()}
    >
      <Field label="Nombre del grupo" value={nombre} onChangeText={setNombre} placeholder="Ej. Lunes 14 hs" />
      <Text style={styles.formLabel}>Día de la semana</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {diasSelectorGrupo.map(diaNumero => (
          <Choice
            key={diaNumero}
            label={diasCompletos[diaNumero].slice(0, 3)}
            selected={dia === diaNumero}
            onPress={() => {
              setDia(diaNumero);
              setPrimeraClase(proximaFechaDelDia(diaNumero, hoy));
            }}
          />
        ))}
      </ScrollView>
      <BotonSelectorHora label="Hora de la clase" value={hora} onPress={() => setSelectorHoraVisible(true)} />
      <Text style={styles.formLabel}>Frecuencia del grupo</Text>
      <View style={styles.needChoices}>
        <Choice label="Todas las semanas" selected={frecuencia === "semanal"} onPress={() => setFrecuencia("semanal")} />
        <Choice label="2 veces por mes" selected={frecuencia === "quincenal"} onPress={() => setFrecuencia("quincenal")} />
      </View>
      <Pressable onPress={() => setSelectorFechaVisible(true)} style={styles.datePickerButton}>
        <View style={styles.datePickerIcon}>
          <Ionicons name="calendar-outline" size={20} color={colors.clay} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.datePickerTitle}>
            Primera clase: {primeraClase.slice(8, 10)}/{primeraClase.slice(5, 7)}/{primeraClase.slice(0, 4)}
          </Text>
          <Text style={styles.datePickerText}>
            {frecuencia === "quincenal"
              ? "Define si usa la 1.ª y 3.ª semana o la 2.ª y 4.ª"
              : "El grupo comenzará desde esta fecha"}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={19} color={colors.clay} />
      </Pressable>
      <Field label="Cantidad de personas" value={capacidad} onChangeText={setCapacidad} keyboardType="number-pad" />
      <Text style={styles.formLabel}>Color en el calendario</Text>
      <View style={styles.colorPicker}>
        {groupColors.map(opcion => (
          <Pressable
            key={opcion}
            accessibilityLabel={`Elegir color ${opcion}`}
            onPress={() => setColor(opcion)}
            style={[
              styles.colorOption,
              { backgroundColor: opcion },
              color === opcion && styles.colorOptionOn,
            ]}
          >
            {color === opcion && <Ionicons name="checkmark" size={18} color="white" />}
          </Pressable>
        ))}
      </View>
      <Text style={styles.formLabel}>Recordatorio de la clase</Text>
      <View style={styles.needChoices}>
        <Choice label="Sin aviso" selected={!notificacion} onPress={() => setNotificacion(false)} />
        <Choice label="Activar aviso" selected={notificacion} onPress={() => setNotificacion(true)} />
      </View>
      {notificacion && (
        <View style={styles.reminderFields}>
          <View style={{ flex: 1 }}>
            <Field label="Días antes" value={diasAntes} onChangeText={setDiasAntes} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <BotonSelectorHora label="Hora del aviso" value={horaAviso} onPress={() => setSelectorAvisoVisible(true)} />
          </View>
        </View>
      )}
      <View style={styles.notificationHelp}>
        <Ionicons name="notifications-outline" size={19} color={colors.primary} />
        <Text style={styles.notificationHelpText}>
          El aviso dirá quiénes vienen y cuántas piezas de cada modelo hay que preparar.
        </Text>
      </View>
      {!!grupo && (
        dia !== grupo.dia ||
        frecuencia !== grupo.frecuencia ||
        primeraClase !== grupo.fecha_inicio
      ) && (
        <Text style={styles.dateWarning}>
          {grupo.frecuencia === "quincenal" && frecuencia === "quincenal" &&
          dia === grupo.dia && primeraClase !== grupo.fecha_inicio
            ? "Cambiar la primera clase hará un reajuste de todo el patrón futuro. Después podrás deshacerlo desde el detalle del grupo."
            : "Cambiar el día o la frecuencia rearma las próximas clases habituales. Las fechas que acomodaste manualmente se conservan."}
        </Text>
      )}
      {!!grupo && (
        <Pressable onPress={confirmarEliminar} style={styles.deleteGroupButton}>
          <Ionicons name="trash-outline" size={19} color={colors.danger} />
          <Text style={styles.deleteGroupText}>Eliminar grupo</Text>
        </Pressable>
      )}
    </FormModal>

    <SelectorHoraModal
      visible={selectorHoraVisible}
      titulo="Hora de la clase"
      valor={hora}
      onClose={() => setSelectorHoraVisible(false)}
      onConfirm={nuevaHora => {
        setHora(nuevaHora);
        setSelectorHoraVisible(false);
      }}
    />
    <CalendarioFechaModal
      visible={selectorFechaVisible}
      titulo="Primera clase del grupo"
      fechaInicial={primeraClase}
      fechaMinima={hoy}
      onClose={() => setSelectorFechaVisible(false)}
      onConfirm={fecha => {
        setPrimeraClase(fecha);
        setDia(new Date(`${fecha}T12:00:00`).getDay());
        setSelectorFechaVisible(false);
      }}
    />
    <SelectorHoraModal
      visible={selectorAvisoVisible}
      titulo="Hora del recordatorio"
      valor={horaAviso}
      onClose={() => setSelectorAvisoVisible(false)}
      onConfirm={nuevaHora => {
        setHoraAviso(nuevaHora);
        setSelectorAvisoVisible(false);
      }}
    />
  </>;
}

const styles = StyleSheet.create({
  needChoices: { flexDirection: "row", gap: 8 },
  formLabel: { color: colors.ink, fontWeight: "700", fontSize: 14 },
  datePickerButton: { minHeight: 66, padding: 12, borderRadius: 13, borderWidth: 1, borderColor: "#E5C8B8", backgroundColor: colors.claySoft, flexDirection: "row", alignItems: "center", gap: 10 },
  datePickerIcon: { width: 39, height: 39, borderRadius: 12, backgroundColor: "white", alignItems: "center", justifyContent: "center" },
  datePickerTitle: { color: colors.clay, fontSize: 14, fontWeight: "900" },
  datePickerText: { color: colors.muted, fontSize: 10, marginTop: 3 },
  notificationHelp: { padding: 12, borderRadius: 12, backgroundColor: colors.primarySoft, flexDirection: "row", alignItems: "center", gap: 9 },
  notificationHelpText: { flex: 1, color: colors.primaryDark, fontSize: 12, lineHeight: 18 },
  dateWarning: { color: colors.warning, fontSize: 11, lineHeight: 17, fontWeight: "700" },
  colorPicker: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  colorOption: { width: 43, height: 43, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  colorOptionOn: { borderWidth: 3, borderColor: colors.ink, transform: [{ scale: 1.08 }] },
  reminderFields: { flexDirection: "row", gap: 10 },
  deleteGroupButton: { minHeight: 48, marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: "#F0C1BD", backgroundColor: "#FFF0EF", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  deleteGroupText: { color: colors.danger, fontSize: 14, fontWeight: "900" },
});
