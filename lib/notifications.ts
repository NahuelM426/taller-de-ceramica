import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { notificacionRepository } from "@/repositories/notificacionRepository";
import { clavesPreferencias, preferenciaRepository } from "@/repositories/preferenciaRepository";

let handlerConfigurado = false;

export function notificacionesDisponibles() {
  return Platform.OS !== "web" &&
    Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
}

async function cargarNotifications() {
  if (!notificacionesDisponibles()) return null;
  const Notifications = await import("expo-notifications");
  if (!handlerConfigurado) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    handlerConfigurado = true;
  }
  return Notifications;
}

async function obtenerPermiso(solicitar: boolean) {
  const Notifications = await cargarNotifications();
  if (!Notifications) return null;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("clases", {
      name: "Próximas clases",
      importance: Notifications.AndroidImportance.HIGH,
    });
    await Notifications.setNotificationChannelAsync("copias", {
      name: "Copias de seguridad",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  let permiso = await Notifications.getPermissionsAsync();
  if (permiso.status !== "granted" && solicitar) {
    permiso = await Notifications.requestPermissionsAsync();
  }
  return permiso.status === "granted" ? Notifications : null;
}

function fechaLocal(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export async function reprogramarNotificaciones(solicitarPermiso = false) {
  try {
    const Notifications = await obtenerPermiso(solicitarPermiso);
    if (!Notifications) return false;
    await Notifications.cancelAllScheduledNotificationsAsync();
    const grupos = await notificacionRepository.listarGruposActivos();

    for (const grupo of grupos) {
      const proximas = await notificacionRepository.listarFechas(grupo.id, fechaLocal());
      for (const proxima of proximas) {
        const personas = await notificacionRepository.listarPersonas(grupo.id, proxima.fecha);
        if (!personas.length) continue;

        const cantidades = personas.reduce<Record<string, number>>((total, persona) => {
          if (persona.modelo_nombre) {
            total[persona.modelo_nombre] = (total[persona.modelo_nombre] || 0) + 1;
          }
          return total;
        }, {});
        const preparacion = Object.entries(cantidades)
          .map(([modelo, cantidad]) => `${cantidad} ${modelo}`)
          .join(", ");
        const fechaClase = new Date(`${proxima.fecha}T${grupo.hora}:00`);
        const fechaAviso = new Date(fechaClase.getTime() - grupo.minutos_antes * 60_000);
        if (fechaAviso.getTime() <= Date.now()) continue;

        await Notifications.scheduleNotificationAsync({
          content: {
            title: `${grupo.nombre} · ${grupo.hora}`,
            body: `Vienen (${personas.length}): ${personas.map(item => item.nombre).join(", ")}. Preparar: ${preparacion || "faltan definir modelos"}.`,
            data: {
              url: `/(tabs)/calendario?fecha=${proxima.fecha}&grupoId=${grupo.id}`,
            },
            sound: true,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: fechaAviso,
            channelId: "clases",
          },
        });
      }
    }

    const recordatorioCopia = await preferenciaRepository.obtener(
      clavesPreferencias.recordatorioCopiaActivo
    );
    if (recordatorioCopia === "1") {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Copia semanal del taller",
          body: "Guardá una copia de alumnos, grupos, agenda, modelos y fotografías.",
          data: { url: "/(tabs)/respaldo" },
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: 1,
          hour: 20,
          minute: 0,
          channelId: "copias",
        },
      });
    }
    return true;
  } catch {
    return false;
  }
}

export async function configurarRecordatorioCopia(activo: boolean) {
  await preferenciaRepository.guardar(
    clavesPreferencias.recordatorioCopiaActivo,
    activo ? "1" : "0"
  );
  const resultado = await reprogramarNotificaciones(activo);
  if (activo && !resultado) {
    await preferenciaRepository.guardar(clavesPreferencias.recordatorioCopiaActivo, "0");
    return false;
  }
  return true;
}
