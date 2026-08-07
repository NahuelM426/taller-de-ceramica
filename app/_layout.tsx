import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import type { NotificationResponse } from "expo-notifications";
import { initDb } from "@/database/init";
import { notificacionesDisponibles, reprogramarNotificaciones } from "@/lib/notifications";
import { colors } from "@/lib/theme";

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [notificationUrl, setNotificationUrl] = useState<string | null>(null);

  useEffect(() => {
    initDb().then(async () => {
      setReady(true);
      await reprogramarNotificaciones(false);
    }).catch(() => setError(true));

    let cancelarListener: (() => void) | undefined;
    if (notificacionesDisponibles()) {
      import("expo-notifications").then(Notifications => {
        const abrirNotificacion = (response: NotificationResponse | null) => {
          const url = response?.notification.request.content.data?.url;
          if (typeof url === "string") setNotificationUrl(url);
        };
        abrirNotificacion(Notifications.getLastNotificationResponse());
        const subscription = Notifications.addNotificationResponseReceivedListener(abrirNotificacion);
        cancelarListener = () => subscription.remove();
      });
    }
    return () => cancelarListener?.();
  }, []);

  useEffect(() => {
    if (!ready || !notificationUrl) return;
    const timer = setTimeout(() => {
      router.push(notificationUrl as never);
      if (notificacionesDisponibles()) {
        import("expo-notifications").then(module => module.clearLastNotificationResponse());
      }
      setNotificationUrl(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [ready, notificationUrl]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>No se pudo iniciar la aplicación</Text>
        <Text style={styles.text}>Cerrala y volvé a abrirla para intentar nuevamente.</Text>
      </View>
    );
  }
  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.text}>Preparando el taller...</Text>
      </View>
    );
  }
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, backgroundColor: colors.background },
  errorTitle: { color: colors.ink, fontSize: 20, fontWeight: "800", textAlign: "center" },
  text: { color: colors.muted, fontSize: 15, marginTop: 12, textAlign: "center" },
});
