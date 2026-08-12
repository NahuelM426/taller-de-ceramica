import { useRef } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import {
  alturaCeldaCalendarioCompartible,
  type CalendarioCompartibleData,
} from "@/lib/calendarioCompartible";
import { colors } from "@/lib/theme";

const DIAS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];
const DIAS_COMPLETOS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export function CalendarioCompartible({
  data,
  onLogoListo,
  onLogoError,
}: {
  data: CalendarioCompartibleData;
  onLogoListo?: () => void;
  onLogoError?: () => void;
}) {
  const logoFallo = useRef(false);
  const alturaCelda = alturaCeldaCalendarioCompartible(data.filas, data.maxMarcasPorDia);
  return (
    <View style={styles.sheet} collapsable={false}>
      <View style={styles.brand}>
        <Image
          source={require("../../assets/mundo-ceramica-logo.png")}
          style={styles.logo}
          onLoadStart={() => { logoFallo.current = false; }}
          onError={() => {
            logoFallo.current = true;
            onLogoError?.();
          }}
          onLoadEnd={() => {
            if (!logoFallo.current) onLogoListo?.();
          }}
        />
        <View style={styles.brandText}>
          <Text style={styles.eyebrow}>TALLER DE CERÁMICA</Text>
          <Text style={styles.month}>{data.tituloMes.toUpperCase()}</Text>
        </View>
      </View>
      <View style={styles.weekdays}>
        {DIAS.map(dia => <Text key={dia} style={styles.weekday}>{dia}</Text>)}
      </View>
      <View style={styles.grid}>
        {data.celdas.map((celda, indice) => (
          <View key={`${celda.fecha || "vacio"}-${indice}`} style={[styles.day, { height: alturaCelda }]}>
            {celda.dia !== null && <Text style={styles.dayNumber}>{celda.dia}</Text>}
            <View style={styles.marks}>
              {celda.marcas.map(marca => (
                <View
                  key={marca.grupoId}
                  style={[styles.mark, { backgroundColor: marca.color }]}
                />
              ))}
            </View>
          </View>
        ))}
      </View>
      {!!data.leyenda.length && (
        <View style={styles.legend}>
          <Text style={styles.legendTitle}>GRUPOS DEL TALLER</Text>
          <View style={styles.legendGrid}>
            {data.leyenda.map(grupo => (
              <View key={grupo.id} style={styles.legendItem}>
                <View style={[styles.legendColor, { backgroundColor: grupo.color }]} />
                <View style={styles.legendTextWrap}>
                  <Text style={styles.legendName} numberOfLines={1}>{grupo.nombre}</Text>
                  <Text style={styles.legendMeta} numberOfLines={1}>
                    {DIAS_COMPLETOS[grupo.dia]} · {grupo.hora}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}
      <Text style={styles.footer}>Calendario habitual del taller</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { width: 360, padding: 22, backgroundColor: "#FFFDF9" },
  brand: { paddingBottom: 14, borderBottomWidth: 2, borderBottomColor: colors.primarySoft, flexDirection: "row", alignItems: "center", gap: 11 },
  logo: { width: 53, height: 53, borderRadius: 27 },
  brandText: { flex: 1 },
  eyebrow: { color: colors.clay, fontSize: 11, fontWeight: "900", letterSpacing: 1.3 },
  month: { marginTop: 4, color: colors.ink, fontSize: 24, fontWeight: "900", letterSpacing: 0.7 },
  weekdays: { marginTop: 13, flexDirection: "row" },
  weekday: { width: `${100 / 7}%`, color: colors.muted, fontSize: 9, fontWeight: "900", textAlign: "center" },
  grid: { marginTop: 7, flexDirection: "row", flexWrap: "wrap", borderTopWidth: 1, borderLeftWidth: 1, borderColor: "#ECE7DE" },
  day: { width: `${100 / 7}%`, paddingTop: 5, paddingBottom: 5, paddingHorizontal: 3, borderRightWidth: 1, borderBottomWidth: 1, borderColor: "#ECE7DE", backgroundColor: "#FFFDF9" },
  dayNumber: { color: colors.ink, fontSize: 12, lineHeight: 15, fontWeight: "800", textAlign: "center" },
  marks: { marginTop: 4, gap: 2 },
  mark: { width: "100%", height: 6, borderRadius: 3 },
  legend: { marginTop: 15, paddingTop: 14, borderTopWidth: 3, borderTopColor: colors.primarySoft },
  legendTitle: { color: colors.primary, fontSize: 13, fontWeight: "900", letterSpacing: 1.1 },
  legendGrid: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", rowGap: 12 },
  legendItem: { width: "50%", minHeight: 42, paddingRight: 8, flexDirection: "row", alignItems: "center", gap: 8 },
  legendColor: { width: 12, height: 35, borderRadius: 4 },
  legendTextWrap: { flex: 1 },
  legendName: { color: colors.ink, fontSize: 12, fontWeight: "900" },
  legendMeta: { marginTop: 3, color: colors.muted, fontSize: 10 },
  footer: { marginTop: 17, color: colors.muted, fontSize: 8, textAlign: "center" },
});
