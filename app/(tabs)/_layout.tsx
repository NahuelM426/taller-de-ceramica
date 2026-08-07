import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/lib/theme";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.muted,
      tabBarStyle: {
        height: 58 + insets.bottom,
        paddingBottom: Math.max(insets.bottom, 8),
        paddingTop: 7,
        borderTopColor: colors.border,
        backgroundColor: colors.card,
      },
      tabBarLabelStyle: { fontWeight: "700", fontSize: 10 },
    }}>
      <Tabs.Screen name="index" options={{
        title: "Hoy",
        tabBarIcon: ({ color, size }) => <Ionicons name="today-outline" color={color} size={size} />,
      }} />
      <Tabs.Screen name="calendario" options={{
        title: "Mes",
        tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" color={color} size={size} />,
      }} />
      <Tabs.Screen name="alumnos" options={{
        title: "Alumnos",
        tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" color={color} size={size} />,
      }} />
      <Tabs.Screen name="modelos" options={{
        title: "Modelos",
        href: null,
        tabBarIcon: ({ color, size }) => <Ionicons name="color-palette-outline" color={color} size={size} />,
      }} />
      <Tabs.Screen name="vacantes" options={{
        title: "Vacantes",
        href: null,
        tabBarIcon: ({ color, size }) => <Ionicons name="people-circle-outline" color={color} size={size} />,
      }} />
      <Tabs.Screen name="respaldo" options={{
        title: "Copia de seguridad",
        href: null,
        tabBarIcon: ({ color, size }) => <Ionicons name="cloud-outline" color={color} size={size} />,
      }} />
    </Tabs>
  );
}
