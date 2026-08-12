import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { grupoOcurreEnFecha } from "@/lib/grupos";
import { etiquetaMovimientoClase } from "@/lib/movimientosClase";
import { colors } from "@/lib/theme";
import { calcularLugaresDisponibles } from "@/lib/vacantes";
import type { AgendaAlumno, Feriado, Grupo } from "@/models";
import { TornoDecorativo } from "./TornoDecorativo";
import { VacanteAnimada } from "./VacanteAnimada";

const meses = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const diasSemana = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

const iso = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

interface CalendarioMesProps {
  cursor: Date;
  hoy: string;
  agenda: AgendaAlumno[];
  feriados: Feriado[];
  grupos: Grupo[];
  onCambiarMes: (incremento: number) => void;
  onAbrirDia: (fecha: string) => void;
}

export function CalendarioMes({
  cursor,
  hoy,
  agenda,
  feriados,
  grupos,
  onCambiarMes,
  onAbrirDia,
}: CalendarioMesProps) {
  const celdas = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = (new Date(year, month, 1).getDay() + 6) % 7;
    const count = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: 42 }, (_, index) => {
      const day = index - first + 1;
      if (day < 1 || day > count) return null;
      const date = iso(year, month, day);
      return {
        day,
        date,
        entries: agenda.filter(item => item.fecha === date),
        holiday: feriados.find(item => item.fecha === date),
      };
    });
  }, [cursor, agenda, feriados]);

  let ordenAnimacionVacantes = 0;
  const cicloAnimacionVacantes = `${cursor.getFullYear()}-${cursor.getMonth()}`;

  return (
    <View style={styles.calendar}>
      <View style={styles.monthHeader}>
        <Pressable onPress={() => onCambiarMes(-1)} style={styles.arrow}>
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
        </Pressable>
        <View style={styles.monthTitle}>
          <Text style={styles.month}>{meses[cursor.getMonth()].toUpperCase()}</Text>
          <TornoDecorativo />
        </View>
        <Pressable onPress={() => onCambiarMes(1)} style={styles.arrow}>
          <Ionicons name="chevron-forward" size={20} color={colors.primary} />
        </Pressable>
      </View>
      <View style={styles.weekRow}>
        {diasSemana.map(day => <Text key={day} style={styles.weekday}>{day}</Text>)}
      </View>
      <View style={styles.days}>
        {celdas.map((cell, index) => {
          const isToday = !!cell && cell.date === hoy;
          const tipoMovimiento = cell?.holiday?.tipo;
          const esFeriado = tipoMovimiento === "feriado";
          const esCompromiso = tipoMovimiento === "compromiso";
          const bloqueaDia = esFeriado || esCompromiso;
          const gruposDelDia = cell && !bloqueaDia
            ? Array.from(new Set([
                ...grupos
                  .filter(grupo => grupoOcurreEnFecha(grupo, cell.date))
                  .map(grupo => grupo.id),
                ...cell.entries.map(item => item.grupo_id),
              ]))
                .map(id => grupos.find(grupo => grupo.id === id))
                .filter((grupo): grupo is Grupo => !!grupo)
            : [];
          const vacantes = !cell || bloqueaDia || cell.date < hoy
            ? 0
            : gruposDelDia.reduce((total, grupo) => {
                const agendaGrupo = cell.entries.filter(item => item.grupo_id === grupo.id);
                return total + calcularLugaresDisponibles(grupo, agendaGrupo);
              }, 0);
          const ordenVacante = vacantes ? ordenAnimacionVacantes++ : 0;

          return (
            <Pressable
              key={index}
              disabled={!cell}
              onPress={() => cell && onAbrirDia(cell.date)}
              style={[
                styles.day,
                isToday && styles.today,
                cell?.holiday && (esFeriado
                  ? styles.holiday
                  : esCompromiso ? styles.commitment : styles.adjustment),
              ]}
            >
              {!!cell && <>
                {!!vacantes && (
                  <VacanteAnimada
                    cantidad={vacantes}
                    orden={ordenVacante}
                    ciclo={cicloAnimacionVacantes}
                  />
                )}
                <Text style={[
                  styles.dayNumber,
                  isToday && styles.todayNumber,
                  cell.holiday && (esFeriado
                    ? styles.holidayNumber
                    : esCompromiso ? styles.commitmentNumber : styles.adjustmentNumber),
                ]}>{cell.day}</Text>
                {!!cell.holiday && (
                  <Text style={esFeriado
                    ? styles.holidayLabel
                    : esCompromiso ? styles.commitmentLabel : styles.adjustmentLabel}>
                    {etiquetaMovimientoClase(cell.holiday.tipo).toUpperCase()}
                  </Text>
                )}
                <View style={styles.marks}>
                  {gruposDelDia.slice(0, 3).map(group => (
                    <View key={group.id} style={[styles.mark, { backgroundColor: group.color }]}>
                      <Text style={styles.markText}>{cell.entries.filter(item =>
                        item.grupo_id === group.id && item.estado !== "ausente"
                      ).length}</Text>
                    </View>
                  ))}
                </View>
              </>}
            </Pressable>
          );
        })}
      </View>
      <View style={styles.legend}>
        <View style={styles.vacancyLegend}>
          <View style={styles.vacancyLegendBadge}>
            <Text style={styles.vacancyLegendNumber}>2</Text>
          </View>
          <Text style={styles.vacancyLegendText}>
            Número verde: lugares disponibles según la capacidad
          </Text>
        </View>
        <Text style={styles.legendText}>
          Las cintas de color son los grupos. Su número indica cuántas personas vienen.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  calendar: { padding: 12, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  monthHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  monthTitle: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3 },
  month: { color: colors.ink, fontSize: 25, fontWeight: "900", letterSpacing: 1 },
  arrow: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.primarySoft },
  weekRow: { flexDirection: "row" },
  weekday: { width: `${100 / 7}%`, color: colors.muted, fontSize: 9, fontWeight: "900", textAlign: "center", paddingBottom: 8 },
  days: { flexDirection: "row", flexWrap: "wrap" },
  day: { width: `${100 / 7}%`, aspectRatio: .78, paddingVertical: 5, alignItems: "center", borderRadius: 9, position: "relative" },
  today: { borderWidth: 2, borderColor: colors.primarySoft },
  holiday: { backgroundColor: "#FBE1DF", borderWidth: 1.5, borderColor: "#DC8E87" },
  commitment: { backgroundColor: colors.claySoft, borderWidth: 1.5, borderColor: "#D6A68E" },
  adjustment: { backgroundColor: colors.primarySoft, borderWidth: 1.5, borderColor: "#78A99A" },
  dayNumber: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  todayNumber: { color: colors.primary, fontWeight: "900" },
  holidayNumber: { color: colors.danger, fontWeight: "900" },
  holidayLabel: { marginTop: 3, color: colors.danger, fontSize: 6, fontWeight: "900", letterSpacing: .2 },
  commitmentNumber: { color: colors.clay, fontWeight: "900" },
  commitmentLabel: { marginTop: 3, color: colors.clay, fontSize: 6, fontWeight: "900", letterSpacing: .2 },
  adjustmentNumber: { color: colors.primary, fontWeight: "900" },
  adjustmentLabel: { marginTop: 3, color: colors.primary, fontSize: 6, fontWeight: "900", letterSpacing: .2 },
  marks: { width: "100%", gap: 2, marginTop: 6, alignItems: "center" },
  mark: { width: "88%", height: 12, borderRadius: 3, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-2deg" }] },
  markText: { color: "white", fontSize: 8, fontWeight: "900" },
  legend: { marginTop: 12, paddingTop: 11, borderTopWidth: 1, borderTopColor: colors.border },
  legendText: { color: colors.muted, fontSize: 10, lineHeight: 15, textAlign: "center" },
  vacancyLegend: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 4 },
  vacancyLegendBadge: { minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 9, backgroundColor: colors.success, alignItems: "center", justifyContent: "center" },
  vacancyLegendNumber: { color: "white", fontSize: 8, fontWeight: "900" },
  vacancyLegendText: { color: colors.success, fontSize: 10, fontWeight: "800" },
});
