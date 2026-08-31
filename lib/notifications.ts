import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { notificacionRepository } from "@/repositories/notificacionRepository";
import { pagoRepository } from "@/repositories/pagoRepository";
import { clavesPreferencias, preferenciaRepository } from "@/repositories/preferenciaRepository";
import { mesPagoActual } from "@/lib/pagos";

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
    await Notifications.setNotificationChannelAsync("pagos", {
      name: "Pagos de alumnos",
      importance: Notifications.AndroidImportance.HIGH,
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
          for (const modelo of persona.modelo_nombres) {
            total[modelo] = (total[modelo] || 0) + 1;
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

    const configuracionPagos = await obtenerConfiguracionRecordatorioPagos();
    if (configuracionPagos.activo) {
      const pagos = await pagoRepository.listarMes(mesPagoActual());
      const faltantes = pagos.filter(pago => pago.pagado !== 1);
      const nombres = faltantes.slice(0, 5).map(pago => pago.alumno_nombre).join(", ");
      const resto = faltantes.length > 5 ? ` y ${faltantes.length - 5} más` : "";
      const [hora, minuto] = configuracionPagos.hora.split(":").map(Number);
      await Notifications.scheduleNotificationAsync({
        content: {
          title: faltantes.length
            ? `${faltantes.length} pago${faltantes.length === 1 ? " pendiente" : "s pendientes"}`
            : "Control mensual de pagos",
          body: faltantes.length
            ? `Falta registrar el pago de: ${nombres}${resto}.`
            : "Revisá los pagos del nuevo mes en Alumnos.",
          data: { url: "/(tabs)/alumnos" },
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
          day: configuracionPagos.dia,
          hour: hora,
          minute: minuto,
          channelId: "pagos",
        },
      });
    }
    return true;
  } catch {
    return false;
  }
}

export interface ConfiguracionRecordatorioPagos {
  activo: boolean;
  dia: number;
  hora: string;
}

export async function obtenerConfiguracionRecordatorioPagos(): Promise<ConfiguracionRecordatorioPagos> {
  const [activo, diaGuardado, horaGuardada] = await Promise.all([
    preferenciaRepository.obtener(clavesPreferencias.recordatorioPagosActivo),
    preferenciaRepository.obtener(clavesPreferencias.recordatorioPagosDia),
    preferenciaRepository.obtener(clavesPreferencias.recordatorioPagosHora),
  ]);
  const dia = Math.min(28, Math.max(1, Number(diaGuardado) || 10));
  const hora = /^([01]\d|2[0-3]):[0-5]\d$/.test(horaGuardada || "")
    ? horaGuardada as string
    : "10:00";
  return { activo: activo === "1", dia, hora };
}

export async function configurarRecordatorioPagos(
  configuracion: ConfiguracionRecordatorioPagos
) {
  const dia = Math.min(28, Math.max(1, Math.floor(configuracion.dia)));
  const hora = /^([01]\d|2[0-3]):[0-5]\d$/.test(configuracion.hora)
    ? configuracion.hora
    : "10:00";
  await Promise.all([
    preferenciaRepository.guardar(
      clavesPreferencias.recordatorioPagosActivo,
      configuracion.activo ? "1" : "0"
    ),
    preferenciaRepository.guardar(clavesPreferencias.recordatorioPagosDia, String(dia)),
    preferenciaRepository.guardar(clavesPreferencias.recordatorioPagosHora, hora),
  ]);
  const resultado = await reprogramarNotificaciones(configuracion.activo);
  if (configuracion.activo && !resultado) {
    await preferenciaRepository.guardar(clavesPreferencias.recordatorioPagosActivo, "0");
    return false;
  }
  return true;
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
