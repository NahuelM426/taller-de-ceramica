import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, StyleSheet, Text } from "react-native";
import { colors } from "@/lib/theme";

export function VacanteAnimada({ cantidad, orden, ciclo }: {
  cantidad: number;
  orden: number;
  ciclo: string;
}) {
  const opacidad = useRef(new Animated.Value(0)).current;
  const escala = useRef(new Animated.Value(.55)).current;
  const subida = useRef(new Animated.Value(7)).current;

  useEffect(() => {
    let activa = true;
    let animacion: Animated.CompositeAnimation | null = null;
    opacidad.setValue(0);
    escala.setValue(.55);
    subida.setValue(7);

    AccessibilityInfo.isReduceMotionEnabled().then(reducir => {
      if (!activa) return;
      if (reducir) {
        opacidad.setValue(1);
        escala.setValue(1);
        subida.setValue(0);
        return;
      }
      animacion = Animated.sequence([
        Animated.delay(Math.min(orden, 12) * 85),
        Animated.parallel([
          Animated.timing(opacidad, {
            toValue: 1,
            duration: 160,
            useNativeDriver: true,
          }),
          Animated.spring(escala, {
            toValue: 1,
            friction: 4,
            tension: 125,
            useNativeDriver: true,
          }),
          Animated.spring(subida, {
            toValue: 0,
            friction: 5,
            tension: 115,
            useNativeDriver: true,
          }),
        ]),
      ]);
      animacion.start();
    });

    return () => {
      activa = false;
      animacion?.stop();
    };
  }, [ciclo, escala, opacidad, orden, subida]);

  return (
    <Animated.View
      style={[
        styles.badge,
        { opacity: opacidad, transform: [{ translateY: subida }, { scale: escala }] },
      ]}
    >
      <Text style={styles.number}>{cantidad}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: 1,
    right: 2,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  number: { color: "white", fontSize: 8, fontWeight: "900" },
});
