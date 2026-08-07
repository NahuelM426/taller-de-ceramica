import { Image, StyleSheet, View } from "react-native";

const ilustracionTorno = require("../../assets/torno-ceramica.png");

export function TornoDecorativo() {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.container}
    >
      <Image source={ilustracionTorno} resizeMode="contain" style={styles.image} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 62,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    position: "absolute",
    top: -4,
    width: 60,
    height: 60,
  },
});
