import { useCallback, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
import { AddButton, Choice, Empty, Field, FormModal, Screen, ui } from "@/components/ui";
import { PagoAlumnoModal } from "@/components/alumnos/PagoAlumnoModal";
import { PendientesAlumnoModal } from "@/components/alumnos/PendientesAlumnoModal";
import { RecordatorioPagosModal } from "@/components/alumnos/RecordatorioPagosModal";
import { actualizarPendientesAlumno, crearAlumno, editarAlumno, eliminarAlumno, listarAlumnos } from "@/repositories/alumnoRepository";
import { listarGrupos } from "@/repositories/grupoRepository";
import { cobrarExtrasAlumno, guardarPagoAlumno, listarPagosMes } from "@/repositories/pagoRepository";
import { mesPagoActual, mesPagoSiguiente, nombreMesPago } from "@/lib/pagos";
import {
  alumnoPasaFiltro, FiltroListadoAlumnos, SubfiltroNoPagaron,
  SubfiltroPendientes,
} from "@/lib/filtrosAlumnos";
import {
  pendientesExtraAlumno,
  pendientesRegularesAlumno,
} from "@/lib/seleccionAgenda";
import { colors } from "@/lib/theme";
import {
  ConfiguracionRecordatorioPagos,
  configurarRecordatorioPagos,
  obtenerConfiguracionRecordatorioPagos,
  reprogramarNotificaciones,
} from "@/lib/notifications";
import { Alumno, CantidadClasesPagadas, EstadoPagoAlumno, Grupo } from "@/models";

const fechaHoy = () => {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
};

export default function AlumnosScreen() {
  const mesActual = mesPagoActual();
  const mesSiguiente = mesPagoSiguiente(mesActual);
  const [mesPagoSeleccionado, setMesPagoSeleccionado] = useState(mesActual);
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [pagos, setPagos] = useState<EstadoPagoAlumno[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Alumno | null>(null);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [grupoId, setGrupoId] = useState<number | null>(null);
  const [fechaInicio, setFechaInicio] = useState(fechaHoy());
  const [abriendoContactos, setAbriendoContactos] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<FiltroListadoAlumnos>("todos");
  const [subfiltroPendientes, setSubfiltroPendientes] =
    useState<SubfiltroPendientes>("todos");
  const [subfiltroNoPagaron, setSubfiltroNoPagaron] =
    useState<SubfiltroNoPagaron>("todos");
  const [alumnoPendientes, setAlumnoPendientes] = useState<Alumno | null>(null);
  const [alumnoPago, setAlumnoPago] = useState<Alumno | null>(null);
  const [recordatorioVisible, setRecordatorioVisible] = useState(false);
  const [recordatorioPagos, setRecordatorioPagos] = useState<ConfiguracionRecordatorioPagos>({
    activo: false,
    dia: 10,
    hora: "10:00",
  });

  const cargar = useCallback(async () => {
    const [personas, gruposCargados, pagosCargados, configuracionPagos] = await Promise.all([
      listarAlumnos(), listarGrupos(), listarPagosMes(mesPagoSeleccionado),
      obtenerConfiguracionRecordatorioPagos(),
    ]);
    setAlumnos(personas);
    setGrupos(gruposCargados);
    setPagos(pagosCargados);
    setRecordatorioPagos(configuracionPagos);
    setGrupoId(actual => actual || gruposCargados[0]?.id || null);
  }, [mesPagoSeleccionado]);
  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const abrirNuevo = () => {
    if (!grupos.length) {
      Alert.alert(
        "Primero creá un grupo",
        "Para cargar un alumno necesitás indicar su grupo habitual.",
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Ir al calendario", onPress: () => router.push("/(tabs)/calendario") },
        ]
      );
      return;
    }
    setEditando(null);
    setNombre("");
    setTelefono("");
    setGrupoId(grupos[0]?.id || null);
    setFechaInicio(fechaHoy());
    setModal(true);
  };

  const abrirEdicion = (alumno: Alumno) => {
    setEditando(alumno);
    setNombre(alumno.nombre);
    setTelefono(alumno.telefono || "");
    setGrupoId(alumno.sin_grupo ? null : alumno.grupo_id);
    setFechaInicio(alumno.fecha_inicio || fechaHoy());
    setModal(true);
  };

  const elegirContacto = async () => {
    try {
      setAbriendoContactos(true);
      if (!(await Contacts.isAvailableAsync())) {
        Alert.alert("Contactos no disponibles", "Este dispositivo no permite abrir la agenda de contactos.");
        return;
      }
      if (Platform.OS === "android") {
        const permiso = await Contacts.requestPermissionsAsync();
        if (permiso.status !== "granted") {
          Alert.alert("Permiso necesario", "Necesitamos permiso para que puedas elegir un contacto del teléfono.");
          return;
        }
      }
      const contacto = await Contacts.presentContactPickerAsync();
      if (!contacto) return;
      const nombreContacto = contacto.name || [contacto.firstName, contacto.lastName].filter(Boolean).join(" ");
      const numero = contacto.phoneNumbers?.[0]?.number || "";
      if (nombreContacto) setNombre(nombreContacto);
      if (numero) setTelefono(numero);
      if (!numero) {
        Alert.alert("Contacto sin teléfono", "Se cargó el nombre. Podés escribir el teléfono ahora o agregarlo más adelante.");
      }
    } catch {
      Alert.alert("No se pudo abrir contactos", "Podés cargar el nombre manualmente y agregar el teléfono después.");
    } finally {
      setAbriendoContactos(false);
    }
  };

  const guardar = async () => {
    if (!nombre.trim()) return;
    if (editando) {
      await editarAlumno(editando.id, nombre, telefono, grupoId);
    } else {
      if (!grupoId) return;
      await crearAlumno({
        nombre, telefono,
        frecuencia: grupos.find(grupo => grupo.id === grupoId)?.frecuencia || "semanal",
        grupo_id: grupoId, molde_id: null,
        fecha_inicio: fechaInicio,
      });
    }
    await reprogramarNotificaciones(false);
    setModal(false);
    setEditando(null);
    await cargar();
  };

  const confirmarEliminar = () => {
    if (!editando) return;
    Alert.alert(
      "Eliminar alumno",
      `${editando.nombre} dejará de aparecer y se cancelarán sus próximas clases. El historial anterior se conservará.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            await eliminarAlumno(editando.id);
            await reprogramarNotificaciones(false);
            setModal(false);
            setEditando(null);
            await cargar();
          },
        },
      ]
    );
  };

  const guardarPendientes = async (cantidad: number) => {
    if (!alumnoPendientes) return;
    await actualizarPendientesAlumno(alumnoPendientes.id, cantidad);
    setAlumnoPendientes(null);
    await cargar();
  };

  const guardarPago = async (
    pagado: boolean,
    clasesPagadas: CantidadClasesPagadas,
    cobrarExtras: boolean
  ) => {
    if (!alumnoPago) return;
    try {
      await guardarPagoAlumno(
        alumnoPago.id,
        mesPagoSeleccionado,
        pagado,
        clasesPagadas,
        pagos.find(pago => pago.alumno_id === alumnoPago.id)?.clases_extra || 0,
        cobrarExtras
      );
      await reprogramarNotificaciones(false);
      setAlumnoPago(null);
      await cargar();
    } catch (error) {
      Alert.alert(
        "No se pudo guardar el pago",
        error instanceof Error ? error.message : "Revisá los datos e intentá nuevamente."
      );
    }
  };

  const cobrarSoloExtras = async () => {
    if (!alumnoPago) return;
    try {
      const cobradas = await cobrarExtrasAlumno(alumnoPago.id, mesPagoSeleccionado);
      if (!cobradas) {
        Alert.alert("Sin extras pendientes", "No hay clases extra para cobrar en este período.");
        return;
      }
      await reprogramarNotificaciones(false);
      setAlumnoPago(null);
      await cargar();
    } catch (error) {
      Alert.alert(
        "No se pudieron cobrar las extras",
        error instanceof Error ? error.message : "Revisá los datos e intentá nuevamente."
      );
    }
  };

  const guardarRecordatorioPagos = async (configuracion: ConfiguracionRecordatorioPagos) => {
    const guardado = await configurarRecordatorioPagos(configuracion);
    const configuracionActual = await obtenerConfiguracionRecordatorioPagos();
    setRecordatorioPagos(configuracionActual);
    if (!guardado && configuracion.activo) {
      Alert.alert(
        "No se pudo activar",
        "Permití las notificaciones desde la configuración del teléfono y volvé a intentarlo."
      );
      return;
    }
    setRecordatorioVisible(false);
  };

  const pagosPorAlumno = new Map(pagos.map(pago => [pago.alumno_id, pago]));
  const noPagaron = pagos.filter(pago => pago.pagado !== 1).length;
  const debenExtras = pagos.filter(pago => pago.clases_extra_adeudadas > 0).length;
  const deudasPago = pagos.filter(
    pago => pago.pagado !== 1 || pago.clases_extra_adeudadas > 0
  ).length;
  const nombreMes = nombreMesPago(mesPagoSeleccionado);

  const termino = busqueda.trim().toLocaleLowerCase("es");
  const alumnosVisibles = alumnos.filter(alumno => {
    const coincide = !termino || alumno.nombre.toLocaleLowerCase("es").includes(termino) ||
      (alumno.telefono || "").toLocaleLowerCase("es").includes(termino);
    const pago = pagosPorAlumno.get(alumno.id);
    const pasaFiltro = alumnoPasaFiltro(
      alumno,
      pago,
      filtro,
      subfiltroPendientes,
      subfiltroNoPagaron
    );
    return coincide && pasaFiltro;
  });

  return (
    <Screen
      title="Alumnos"
      subtitle="Personas, grupos y frecuencia de asistencia"
      action={(
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="Copia de seguridad"
            onPress={() => router.push("/(tabs)/respaldo" as never)}
            style={styles.backupButton}
          >
            <Ionicons name="cloud-outline" size={22} color={colors.primary} />
          </Pressable>
          <AddButton onPress={abrirNuevo} />
        </View>
      )}
    >
      <ScrollView contentContainerStyle={ui.list}>
        {!alumnos.length && <Empty text="Cargá la primera persona del taller." />}
        {!!alumnos.length && <>
          <View style={styles.monthSelector}>
            <Pressable
              onPress={() => setMesPagoSeleccionado(mesActual)}
              style={[styles.monthOption, mesPagoSeleccionado === mesActual && styles.monthOptionOn]}
            >
              <Text style={[styles.monthHint, mesPagoSeleccionado === mesActual && styles.monthTextOn]}>ESTE MES</Text>
              <Text style={[styles.monthName, mesPagoSeleccionado === mesActual && styles.monthTextOn]}>
                {nombreMesPago(mesActual)}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMesPagoSeleccionado(mesSiguiente)}
              style={[styles.monthOption, mesPagoSeleccionado === mesSiguiente && styles.monthOptionOn]}
            >
              <Text style={[styles.monthHint, mesPagoSeleccionado === mesSiguiente && styles.monthTextOn]}>MES SIGUIENTE</Text>
              <Text style={[styles.monthName, mesPagoSeleccionado === mesSiguiente && styles.monthTextOn]}>
                {nombreMesPago(mesSiguiente)}
              </Text>
            </Pressable>
          </View>
          {!!noPagaron && (
            <Pressable
              onPress={() => {
                setFiltro("no_pagaron");
                setSubfiltroNoPagaron("cuota");
              }}
              style={styles.paymentNotice}
            >
              <View style={styles.paymentNoticeIcon}>
                <Ionicons name="notifications" size={20} color={colors.danger} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.paymentNoticeTitle}>Faltan pagos de {nombreMes}</Text>
                <Text style={styles.paymentNoticeText}>
                  {noPagaron} {noPagaron === 1 ? "alumno todavía no pagó" : "alumnos todavía no pagaron"}. Tocá para verlos.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.danger} />
            </Pressable>
          )}
          <View style={styles.paymentSummaryRow}>
            <Pressable onPress={() => setRecordatorioVisible(true)} style={styles.reminderButton}>
              <View style={styles.reminderIcon}>
                <Ionicons
                  name={recordatorioPagos.activo ? "alarm" : "alarm-outline"}
                  size={20}
                  color={colors.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.reminderTitle}>Recordatorio de pagos</Text>
                <Text style={styles.reminderText}>
                  {recordatorioPagos.activo
                    ? `Día ${recordatorioPagos.dia} de cada mes a las ${recordatorioPagos.hora}`
                    : "Desactivado · tocá para configurar"}
                </Text>
              </View>
              <Ionicons name="settings-outline" size={18} color={colors.primary} />
            </Pressable>
            {!!debenExtras && (
              <Pressable
                onPress={() => {
                  setFiltro("no_pagaron");
                  setSubfiltroNoPagaron("extras");
                }}
                style={styles.extrasDebtNotice}
              >
                <Ionicons name="cash-outline" size={19} color={colors.danger} />
                <Text style={styles.extrasDebtNoticeText}>
                  {debenExtras} con extra{debenExtras === 1 ? "" : "s"} a cobrar
                </Text>
              </Pressable>
            )}
          </View>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={19} color={colors.muted} />
            <TextInput
              value={busqueda}
              onChangeText={setBusqueda}
              placeholder="Buscar por nombre o teléfono"
              placeholderTextColor="#9AA29E"
              style={styles.searchInput}
            />
            {!!busqueda && (
              <Pressable onPress={() => setBusqueda("")} hitSlop={8}>
                <Ionicons name="close-circle" size={19} color={colors.muted} />
              </Pressable>
            )}
          </View>
          <View style={styles.filters}>
            <Pressable onPress={() => setFiltro("todos")} style={[styles.filter, filtro === "todos" && styles.filterOn]}>
              <Text style={[styles.filterText, filtro === "todos" && styles.filterTextOn]}>Todos</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setFiltro("pendientes");
                setSubfiltroPendientes("todos");
              }}
              style={[styles.filter, filtro === "pendientes" && styles.filterOn]}
            >
              <Text style={[styles.filterText, filtro === "pendientes" && styles.filterTextOn]}>Con pendientes</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setFiltro("no_pagaron");
                setSubfiltroNoPagaron("todos");
              }}
              style={[styles.filter, filtro === "no_pagaron" && styles.filterUnpaidOn]}
            >
              <Text style={[styles.filterText, filtro === "no_pagaron" && styles.filterUnpaidText]}>
                No pagaron {deudasPago ? `(${deudasPago})` : ""}
              </Text>
            </Pressable>
          </View>
          {filtro === "pendientes" && (
            <View style={styles.subfilters}>
              <Text style={styles.subfilterLabel}>MOSTRAR</Text>
              <SubfilterButton
                label="Todos"
                selected={subfiltroPendientes === "todos"}
                onPress={() => setSubfiltroPendientes("todos")}
              />
              <SubfilterButton
                label="Clases"
                selected={subfiltroPendientes === "regulares"}
                onPress={() => setSubfiltroPendientes("regulares")}
              />
              <SubfilterButton
                label="Extras a favor"
                selected={subfiltroPendientes === "extras"}
                onPress={() => setSubfiltroPendientes("extras")}
              />
            </View>
          )}
          {filtro === "no_pagaron" && (
            <View style={styles.subfilters}>
              <Text style={styles.subfilterLabel}>MOSTRAR</Text>
              <SubfilterButton
                label="Todos"
                selected={subfiltroNoPagaron === "todos"}
                danger
                onPress={() => setSubfiltroNoPagaron("todos")}
              />
              <SubfilterButton
                label="Cuota"
                selected={subfiltroNoPagaron === "cuota"}
                danger
                onPress={() => setSubfiltroNoPagaron("cuota")}
              />
              <SubfilterButton
                label="Extras a cobrar"
                selected={subfiltroNoPagaron === "extras"}
                danger
                onPress={() => setSubfiltroNoPagaron("extras")}
              />
            </View>
          )}
        </>}
        {!!alumnos.length && !alumnosVisibles.length && (
          <Empty title="Sin resultados" text="No encontramos alumnos con esa búsqueda o filtro." />
        )}
        {alumnosVisibles.map(alumno => {
          const colorGrupo = alumno.sin_grupo ? colors.muted : alumno.grupo_color || colors.primary;
          const pago = pagosPorAlumno.get(alumno.id);
          const estaPagado = pago?.pagado === 1;
          const extrasAdeudadas = pago?.clases_extra_adeudadas || 0;
          const pendientesRegulares = pendientesRegularesAlumno(alumno);
          const pendientesExtra = pendientesExtraAlumno(alumno);
          return (
          <Pressable
            key={alumno.id}
            onPress={() => abrirEdicion(alumno)}
            style={[ui.card, styles.studentCard, { borderLeftColor: colorGrupo }]}
          >
            <View style={styles.studentHeader}>
              <View style={[styles.avatar, { backgroundColor: `${colorGrupo}20` }]}>
                <Text style={[styles.avatarText, { color: colorGrupo }]}>{alumno.nombre.split(" ").map(p => p[0]).slice(0, 2).join("")}</Text>
              </View>
              <View style={styles.studentIdentity}>
                <View style={styles.nameLine}>
                  <Text style={[ui.name, styles.studentName]}>{alumno.nombre}</Text>
                  {!pendientesRegulares && (
                    <Pressable
                      onPress={event => {
                        event.stopPropagation();
                        setAlumnoPendientes(alumno);
                      }}
                      style={styles.loadPendingButton}
                    >
                      <Ionicons name="add-circle-outline" size={13} color={colors.primary} />
                      <Text style={styles.loadPendingText}>Cargar pendientes</Text>
                    </Pressable>
                  )}
                </View>
                <View style={styles.groupLine}>
                  <View style={[styles.groupDot, { backgroundColor: colorGrupo }]} />
                  <Text style={[styles.groupName, { color: colorGrupo }]}>
                    {alumno.sin_grupo ? "Sin grupo habitual" : alumno.grupo_nombre}
                  </Text>
                  {!alumno.sin_grupo && (
                    <Text style={styles.frequency}>· {alumno.frecuencia === "semanal" ? "Semanal" : "2 veces por mes"}</Text>
                  )}
                </View>
                <View style={styles.creditSummary}>
                  {!!pendientesRegulares && (
                    <Pressable
                      onPress={event => {
                        event.stopPropagation();
                        setAlumnoPendientes(alumno);
                      }}
                      style={[styles.pendingButton, { backgroundColor: colors.claySoft }]}
                    >
                      <Ionicons name="time-outline" size={14} color={colors.clay} />
                      <Text style={[styles.pendingButtonText, { color: colors.clay }]}>
                        {pendientesRegulares} pendiente{pendientesRegulares === 1 ? "" : "s"}
                      </Text>
                    </Pressable>
                  )}
                  {!!pendientesExtra && (
                    <View style={styles.extraCreditButton}>
                      <Ionicons name="ticket-outline" size={14} color={colors.primary} />
                      <Text style={styles.extraCreditButtonText}>
                        {pendientesExtra} extra{pendientesExtra === 1 ? "" : "s"} a favor
                      </Text>
                    </View>
                  )}
                </View>
              </View>
              <Pressable
                accessibilityLabel={`Editar a ${alumno.nombre}`}
                onPress={event => {
                  event.stopPropagation();
                  abrirEdicion(alumno);
                }}
                style={styles.editIcon}
              >
                <Ionicons name="pencil-outline" size={17} color={colors.primary} />
              </Pressable>
            </View>
            <View style={styles.bottomActions}>
              {!!extrasAdeudadas && (
                  <Pressable
                    onPress={event => {
                      event.stopPropagation();
                      setAlumnoPago(alumno);
                    }}
                    style={styles.extraDebtButton}
                  >
                    <Ionicons name="cash-outline" size={14} color={colors.danger} />
                    <Text style={styles.extraDebtButtonText}>
                      {extrasAdeudadas} extra{extrasAdeudadas === 1 ? "" : "s"} a cobrar
                    </Text>
                  </Pressable>
              )}
              <Pressable
                onPress={event => {
                  event.stopPropagation();
                  setAlumnoPago(alumno);
                }}
                style={[
                  styles.paymentButton,
                  estaPagado ? styles.paymentButtonPaid : styles.paymentButtonUnpaid,
                ]}
              >
                <Ionicons
                  name={estaPagado ? "checkmark-circle" : "alert-circle"}
                  size={14}
                  color={estaPagado ? colors.success : colors.danger}
                />
                <Text style={[
                  styles.paymentButtonText,
                  { color: estaPagado ? colors.success : colors.danger },
                ]}>
                  {estaPagado ? `Pagó · ${pago.clases_pagadas} clases` : "No pagó"}
                </Text>
              </Pressable>
            </View>
            <View style={styles.details}>
              <Ionicons name={alumno.telefono ? "call-outline" : "alert-circle-outline"} size={15} color={alumno.telefono ? colors.muted : colors.warning} />
              <Text style={[styles.detail, !alumno.telefono && { color: colors.warning, fontWeight: "800" }]}>
                {alumno.telefono || "Sin teléfono · tocá para agregarlo"}
              </Text>
            </View>
          </Pressable>
          );
        })}
      </ScrollView>
      <FormModal
        visible={modal}
        title={editando ? "Editar alumno" : "Nueva persona"}
        onClose={() => setModal(false)}
        onSave={guardar}
        canSave={!!nombre.trim() && (!!editando || !!grupoId)}
      >
        <Pressable disabled={abriendoContactos} onPress={elegirContacto} style={styles.contactButton}>
          <Ionicons name="person-circle-outline" size={23} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.contactTitle}>{abriendoContactos ? "Abriendo contactos..." : "Elegir de mis contactos"}</Text>
            <Text style={styles.contactText}>Completa el nombre y el teléfono automáticamente</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.primary} />
        </Pressable>
        <Field label="Nombre y apellido" value={nombre} onChangeText={setNombre} placeholder="Ej. Julia Fernández" />
        <Field label="Teléfono (opcional)" value={telefono} onChangeText={setTelefono} keyboardType="phone-pad" placeholder="Podés agregarlo después" />
        {!editando && <>
          <Field label="Comenzar desde" value={fechaInicio} onChangeText={setFechaInicio} placeholder="AAAA-MM-DD" autoCapitalize="none" />
          <View style={styles.help}>
            <Text style={styles.helpText}>El teléfono no es obligatorio. Podés crear el alumno solamente con el nombre y completarlo más adelante.</Text>
          </View>
        </>}
        <Text style={styles.label}>Grupo habitual</Text>
        <View style={{ gap: 8 }}>
          {!!editando && (
            <Choice
              label="Sin grupo habitual"
              selected={grupoId === null}
              onPress={() => setGrupoId(null)}
            />
          )}
          {grupos.map(grupo => <Choice key={grupo.id} label={`${grupo.nombre} · ${grupo.hora}`} selected={grupoId === grupo.id} onPress={() => setGrupoId(grupo.id)} />)}
        </View>
        {!!editando && grupoId !== (editando.sin_grupo ? null : editando.grupo_id) && (
          <View style={styles.help}>
            <Text style={styles.helpText}>
              {grupoId
                ? "Al guardar, sus próximas clases habituales se rearmarán con este grupo y frecuencia. Las fechas agregadas manualmente se conservan."
                : "Al guardar, dejará de pertenecer a su grupo y se quitarán sus próximas clases habituales. Las fechas agregadas manualmente se conservan."}
            </Text>
          </View>
        )}
        {!!editando && (
          <Pressable onPress={confirmarEliminar} style={styles.deleteButton}>
            <Ionicons name="trash-outline" size={19} color={colors.danger} />
            <Text style={styles.deleteText}>Eliminar alumno</Text>
          </Pressable>
        )}
      </FormModal>
      <PendientesAlumnoModal
        alumno={alumnoPendientes}
        onClose={() => setAlumnoPendientes(null)}
        onConfirm={guardarPendientes}
      />
      <PagoAlumnoModal
        alumno={alumnoPago}
        pago={alumnoPago ? pagosPorAlumno.get(alumnoPago.id) || null : null}
        mes={mesPagoSeleccionado}
        onClose={() => setAlumnoPago(null)}
        onConfirm={guardarPago}
        onPayExtrasOnly={cobrarSoloExtras}
      />
      <RecordatorioPagosModal
        visible={recordatorioVisible}
        configuracion={recordatorioPagos}
        onClose={() => setRecordatorioVisible(false)}
        onConfirm={guardarRecordatorioPagos}
      />
    </Screen>
  );
}

function SubfilterButton({ label, selected, danger = false, onPress }: {
  label: string;
  selected: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.subfilter,
        selected && (danger ? styles.subfilterDangerOn : styles.subfilterOn),
      ]}
    >
      <Text style={[
        styles.subfilterText,
        selected && (danger ? styles.subfilterDangerText : styles.subfilterTextOn),
      ]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: "row", alignItems: "center", gap: 7 },
  backupButton: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  studentCard: { borderLeftWidth: 5 },
  studentHeader: { flexDirection: "row", alignItems: "flex-start" },
  studentIdentity: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7 },
  studentName: { flexShrink: 1 },
  avatar: { width: 45, height: 45, borderRadius: 23, marginRight: 11, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.primary, fontWeight: "900", fontSize: 13 },
  groupLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4, marginTop: 4 },
  groupDot: { width: 7, height: 7, borderRadius: 4 },
  groupName: { fontSize: 12, fontWeight: "900" },
  frequency: { color: colors.muted, fontSize: 12 },
  details: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 13, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  detail: { color: colors.muted, fontSize: 12 },
  label: { color: colors.ink, fontWeight: "700", fontSize: 14 },
  help: { padding: 12, borderRadius: 12, backgroundColor: colors.claySoft },
  helpText: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  contactButton: { minHeight: 67, padding: 13, borderRadius: 14, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: "#BCD2CA", flexDirection: "row", alignItems: "center", gap: 10 },
  contactTitle: { color: colors.primary, fontSize: 14, fontWeight: "900" },
  contactText: { color: colors.muted, fontSize: 10, marginTop: 3 },
  searchBox: { minHeight: 48, paddingHorizontal: 13, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: "row", alignItems: "center", gap: 9 },
  searchInput: { flex: 1, color: colors.ink, fontSize: 14 },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filter: { minHeight: 39, paddingHorizontal: 14, borderRadius: 99, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  filterOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  filterText: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  filterTextOn: { color: colors.primary },
  filterUnpaidOn: { borderColor: colors.danger, backgroundColor: "#FFF0EF" },
  filterUnpaidText: { color: colors.danger },
  subfilters: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 7, marginTop: -2 },
  subfilterLabel: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: .6, marginRight: 2 },
  subfilter: { minHeight: 32, paddingHorizontal: 11, borderRadius: 99, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  subfilterOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  subfilterDangerOn: { borderColor: colors.danger, backgroundColor: "#FFF0EF" },
  subfilterText: { color: colors.muted, fontSize: 10, fontWeight: "800" },
  subfilterTextOn: { color: colors.primary },
  subfilterDangerText: { color: colors.danger },
  creditSummary: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 9 },
  loadPendingButton: { minHeight: 28, paddingHorizontal: 8, borderRadius: 99, backgroundColor: colors.primarySoft, flexDirection: "row", alignItems: "center", gap: 4 },
  loadPendingText: { color: colors.primary, fontSize: 9, fontWeight: "900" },
  bottomActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center", gap: 7, marginTop: 12 },
  paymentNotice: { padding: 13, borderRadius: 15, borderWidth: 1, borderColor: "#E9ABA5", backgroundColor: "#FFF0EF", flexDirection: "row", alignItems: "center", gap: 10 },
  paymentNoticeIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: "white", alignItems: "center", justifyContent: "center" },
  paymentNoticeTitle: { color: colors.danger, fontSize: 13, fontWeight: "900", textTransform: "capitalize" },
  paymentNoticeText: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  monthSelector: { flexDirection: "row", gap: 8 },
  monthOption: { flex: 1, minHeight: 58, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  monthOptionOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  monthHint: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: .5 },
  monthName: { color: colors.ink, fontSize: 12, fontWeight: "900", textTransform: "capitalize", marginTop: 3 },
  monthTextOn: { color: "white" },
  paymentSummaryRow: { gap: 8 },
  reminderButton: { minHeight: 66, padding: 12, borderRadius: 15, borderWidth: 1, borderColor: "#BCD2CA", backgroundColor: colors.primarySoft, flexDirection: "row", alignItems: "center", gap: 10 },
  reminderIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: "white", alignItems: "center", justifyContent: "center" },
  reminderTitle: { color: colors.primary, fontSize: 13, fontWeight: "900" },
  reminderText: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  extrasDebtNotice: { minHeight: 46, paddingHorizontal: 13, borderRadius: 14, borderWidth: 1, borderColor: "#E9ABA5", backgroundColor: "#FFF0EF", flexDirection: "row", alignItems: "center", gap: 8 },
  extrasDebtNoticeText: { color: colors.danger, fontSize: 12, fontWeight: "900" },
  paymentButton: { minHeight: 31, paddingHorizontal: 9, borderRadius: 99, flexDirection: "row", alignItems: "center", gap: 4 },
  paymentButtonPaid: { backgroundColor: "#EAF5F0" },
  paymentButtonUnpaid: { backgroundColor: "#FFF0EF" },
  paymentButtonText: { fontSize: 10, fontWeight: "900" },
  extraDebtButton: { minHeight: 31, paddingHorizontal: 9, borderRadius: 99, backgroundColor: "#FFF0EF", flexDirection: "row", alignItems: "center", gap: 4 },
  extraDebtButtonText: { color: colors.danger, fontSize: 10, fontWeight: "900" },
  extraCreditButton: { minHeight: 31, paddingHorizontal: 9, borderRadius: 99, backgroundColor: colors.primarySoft, flexDirection: "row", alignItems: "center", gap: 4 },
  extraCreditButtonText: { color: colors.primary, fontSize: 10, fontWeight: "900" },
  pendingButton: { minHeight: 31, paddingHorizontal: 9, borderRadius: 99, flexDirection: "row", alignItems: "center", gap: 4 },
  pendingButtonText: { fontSize: 10, fontWeight: "900" },
  editIcon: { width: 38, height: 38, marginLeft: 8, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  deleteButton: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: "#F0C1BD", backgroundColor: "#FFF0EF", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 10 },
  deleteText: { color: colors.danger, fontSize: 14, fontWeight: "900" },
});
