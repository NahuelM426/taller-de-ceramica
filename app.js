const STORAGE_KEY = "barro-jardin-demo-v1";

const seed = {
  students: [
    { id: 1, name: "Ana López", phone: "11 4421 0832", group: "Viernes Tarde", frequency: "Semanal", mold: "Cuenco Nórdico", debt: 0 },
    { id: 2, name: "Lucía Bianchi", phone: "11 3981 2044", group: "Viernes Tarde", frequency: "Semanal", mold: "Sin molde", debt: 0 },
    { id: 3, name: "Sofía Molina", phone: "11 6672 9190", group: "Viernes Tarde", frequency: "Quincenal", mold: "Jarrón Alto", debt: 1 },
    { id: 4, name: "Diego Ruiz", phone: "11 2340 1142", group: "Viernes Tarde", frequency: "Semanal", mold: "Plato Ondas", debt: 0 },
    { id: 5, name: "Marta Silva", phone: "11 5701 3341", group: "Martes Mañana", frequency: "Semanal", mold: "Sin molde", debt: 1 },
    { id: 6, name: "Carla Medina", phone: "11 2170 9891", group: "Miércoles Tarde", frequency: "Quincenal", mold: "Maceta Baja", debt: 0 },
    { id: 7, name: "Paula Ríos", phone: "11 3611 7740", group: "Martes Mañana", frequency: "Semanal", mold: "Taza Recta", debt: 0 },
    { id: 8, name: "Julia Fernández", phone: "11 4420 3132", group: "Miércoles Tarde", frequency: "Semanal", mold: "Sin molde", debt: 0 },
    { id: 9, name: "Emilia Torres", phone: "11 6023 1833", group: "Martes Mañana", frequency: "Quincenal", mold: "Cuenco Nórdico", debt: 1 },
    { id: 10, name: "Laura Paz", phone: "11 3329 8831", group: "Miércoles Tarde", frequency: "Semanal", mold: "Sin molde", debt: 0 },
    { id: 11, name: "Nora Acosta", phone: "11 7204 2239", group: "Martes Mañana", frequency: "Semanal", mold: "Sin molde", debt: 0 },
    { id: 12, name: "Camila Soto", phone: "11 5088 7341", group: "Miércoles Tarde", frequency: "Semanal", mold: "Bandeja Oval", debt: 0 }
  ],
  groups: [
    { id: 1, name: "Martes Mañana", day: "Martes", time: "10:00", capacity: 6, color: "clay" },
    { id: 2, name: "Miércoles Tarde", day: "Miércoles", time: "17:00", capacity: 6, color: "green" },
    { id: 3, name: "Viernes Tarde", day: "Viernes", time: "18:00", capacity: 6, color: "amber" }
  ],
  molds: [
    { id: 1, name: "Cuenco Nórdico", code: "M-01", available: 2, total: 4, symbol: "⌣" },
    { id: 2, name: "Jarrón Alto", code: "M-02", available: 1, total: 2, symbol: "♙" },
    { id: 3, name: "Plato Ondas", code: "M-03", available: 2, total: 3, symbol: "◡" },
    { id: 4, name: "Maceta Baja", code: "M-04", available: 1, total: 2, symbol: "⌑" },
    { id: 5, name: "Taza Recta", code: "M-05", available: 3, total: 3, symbol: "◰" },
    { id: 6, name: "Bandeja Oval", code: "M-06", available: 0, total: 1, symbol: "⬭" }
  ],
  absences: []
};

let state = loadState();
let calendarDate = new Date(2026, 6, 1);
let activeOfferStudent = null;

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : structuredClone(seed);
  } catch {
    return structuredClone(seed);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderAll();
}

function initials(name) {
  return name.split(" ").slice(0, 2).map(part => part[0]).join("").toUpperCase();
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.querySelector("p").textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function switchView(view) {
  document.querySelectorAll(".view").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(el => el.classList.remove("active"));
  document.querySelector(`#${view}View`)?.classList.add("active");
  document.querySelector(`.nav-item[data-view="${view}"]`)?.classList.add("active");
  const titles = { agenda: "Hola, Marina", alumnos: "Personas del taller", grupos: "Horarios y cupos", moldes: "Biblioteca de moldes", pendientes: "Clases a recuperar" };
  document.querySelector("#pageTitle").innerHTML = `${titles[view]} <span>✦</span>`;
  document.querySelector(".sidebar").classList.remove("open");
}

document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => switchView(button.dataset.view)));
document.querySelectorAll("[data-view-link]").forEach(button => button.addEventListener("click", () => switchView(button.dataset.viewLink)));
document.querySelector("#mobileMenu").addEventListener("click", () => document.querySelector(".sidebar").classList.toggle("open"));

function renderStats() {
  const debt = state.students.reduce((sum, student) => sum + student.debt, 0);
  const inUse = state.molds.reduce((sum, mold) => sum + (mold.total - mold.available), 0);
  document.querySelector("#activeStudents").textContent = state.students.length;
  document.querySelector("#studentCountBadge").textContent = state.students.length;
  document.querySelector("#pendingClasses").textContent = debt;
  document.querySelector("#debtCountBadge").textContent = debt;
  document.querySelector("#moldsInUse").textContent = inUse;
  document.querySelector("#recoverySuggestion").textContent = `${state.students.filter(s => s.debt > 0).length} personas tienen clases pendientes.`;
}

function renderCalendar() {
  const grid = document.querySelector("#calendarGrid");
  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  document.querySelector("#calendarTitle").textContent = `${monthNames[calendarDate.getMonth()]} ${calendarDate.getFullYear()}`;
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysCurrent = new Date(year, month + 1, 0).getDate();
  const daysPrev = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const rawDay = i - firstDay + 1;
    let date, muted = false;
    if (rawDay < 1) { date = new Date(year, month - 1, daysPrev + rawDay); muted = true; }
    else if (rawDay > daysCurrent) { date = new Date(year, month + 1, rawDay - daysCurrent); muted = true; }
    else date = new Date(year, month, rawDay);
    const day = date.getDate();
    const weekday = date.getDay();
    const isToday = date.getFullYear() === 2026 && date.getMonth() === 6 && day === 30;
    const events = [];
    if (!muted && weekday === 2) events.push(`<span class="calendar-event">10:00 · Martes Mañana</span>`);
    if (!muted && weekday === 3) events.push(`<span class="calendar-event">17:00 · Miércoles Tarde</span>`);
    if (!muted && weekday === 5) events.push(`<span class="calendar-event${day === 17 ? " full" : ""}">18:00 · Viernes Tarde</span>`);
    if (!muted && ((month === 6 && day === 31) || (month === 7 && day === 5))) events.push(`<span class="calendar-event recovery">Recuperación</span>`);
    cells.push(`<div class="calendar-day ${muted ? "muted" : ""} ${isToday ? "today" : ""}"><span class="day-number">${day}</span>${events.join("")}</div>`);
  }
  grid.innerHTML = cells.join("");
}

document.querySelector("#prevMonth").addEventListener("click", () => { calendarDate.setMonth(calendarDate.getMonth() - 1); renderCalendar(); });
document.querySelector("#nextMonth").addEventListener("click", () => { calendarDate.setMonth(calendarDate.getMonth() + 1); renderCalendar(); });
document.querySelector("#todayButton").addEventListener("click", () => { calendarDate = new Date(2026, 6, 1); renderCalendar(); });

function renderAttendees() {
  const students = state.students.filter(student => student.group === "Viernes Tarde");
  document.querySelector("#fridayAttendance").textContent = students.length;
  document.querySelector("#attendeeList").innerHTML = students.slice(0, 4).map(student => `
    <div class="attendee">
      <span class="mini-avatar">${initials(student.name)}</span>
      <div><strong>${student.name}</strong><small>${student.frequency}</small></div>
      ${student.mold !== "Sin molde" ? `<span class="mold-tag">◇ ${student.mold}</span>` : ""}
    </div>`).join("");
}

function renderStudents(filter = "") {
  const normalized = filter.toLowerCase();
  const students = state.students.filter(s => s.name.toLowerCase().includes(normalized));
  document.querySelector("#studentsTable").innerHTML = students.map(student => `
    <tr>
      <td><div class="person-cell"><span class="mini-avatar">${initials(student.name)}</span><div><strong>${student.name}</strong><small>${student.phone || "Sin teléfono"}</small></div></div></td>
      <td>${student.group}</td>
      <td><span class="tag ${student.frequency === "Quincenal" ? "clay" : ""}">${student.frequency}</span></td>
      <td>${student.mold === "Sin molde" ? `<span class="tag gray">Sin molde</span>` : `◇ ${student.mold}`}</td>
      <td>${student.debt ? `<span class="tag clay">${student.debt} clase${student.debt > 1 ? "s" : ""}</span>` : "—"}</td>
      <td><button class="row-action" title="Marcar que no viene" data-absence="${student.id}">•••</button></td>
    </tr>`).join("");
  document.querySelectorAll("[data-absence]").forEach(button => button.addEventListener("click", () => {
    const student = state.students.find(s => s.id === Number(button.dataset.absence));
    student.debt++;
    state.absences.push({ studentId: student.id, date: new Date().toISOString() });
    saveState();
    showToast(`Ausencia registrada. ${student.name} tiene una clase a favor.`);
  }));
}

document.querySelector("#studentSearch").addEventListener("input", event => renderStudents(event.target.value));
document.querySelectorAll(".filter-pills button").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".filter-pills button").forEach(el => el.classList.remove("active"));
  button.classList.add("active");
  const filter = button.textContent;
  document.querySelectorAll("#studentsTable tr").forEach(row => {
    row.style.display = filter === "Todos" || row.textContent.includes(filter) ? "" : "none";
  });
}));

function renderGroups() {
  document.querySelector("#groupGrid").innerHTML = state.groups.map(group => {
    const enrolled = state.students.filter(student => student.group === group.name).length;
    const percent = Math.min(100, Math.round(enrolled / group.capacity * 100));
    return `<article class="group-card">
      <p class="section-kicker">${group.day}</p><h3>${group.name}</h3><p>Grupo regular del taller</p>
      <div class="group-meta"><span><b>${group.time}</b>Horario</span><span><b>${enrolled}/${group.capacity}</b>Alumnos</span></div>
      <small>${group.capacity - enrolled > 0 ? `${group.capacity - enrolled} lugares disponibles` : "Grupo completo"}</small>
      <div class="capacity-bar"><i style="width:${percent}%"></i></div>
      <div class="card-footer"><span>${enrolled ? initials(state.students.find(s => s.group === group.name)?.name || "") : "Sin alumnos"}</span><button data-group-detail="${group.id}">Ver grupo →</button></div>
    </article>`;
  }).join("");
  document.querySelector("#studentGroupSelect").innerHTML = state.groups.map(group => `<option>${group.name}</option>`).join("");
}

function renderMolds() {
  document.querySelector("#moldGrid").innerHTML = state.molds.map(mold => `
    <article class="mold-card">
      <div class="mold-visual">${mold.symbol}</div>
      <span class="mold-status">${mold.available ? `${mold.available} disponible${mold.available > 1 ? "s" : ""}` : "En uso"}</span>
      <p class="section-kicker">${mold.code}</p><h3>${mold.name}</h3>
      <p>${mold.total} unidad${mold.total > 1 ? "es" : ""} · ${mold.total - mold.available} asignada${mold.total - mold.available !== 1 ? "s" : ""}</p>
    </article>`).join("");
  document.querySelector("#studentMoldSelect").innerHTML = state.molds.filter(m => m.available > 0).map(mold => `<option>${mold.name}</option>`).join("");
}

function renderPending() {
  const pending = state.students.filter(student => student.debt > 0);
  const total = pending.reduce((sum, student) => sum + student.debt, 0);
  document.querySelector("#pendingTotalLabel").textContent = `${total} en total`;
  document.querySelector("#pendingList").innerHTML = pending.length ? pending.map(student => `
    <div class="pending-person">
      <div class="person-cell"><span class="mini-avatar">${initials(student.name)}</span><div><p><b>${student.name}</b></p><small>${student.group}</small></div></div>
      <span class="debt-badge">${student.debt} pendiente${student.debt > 1 ? "s" : ""}</span>
      <button class="offer-button" data-offer-student="${student.id}">Ofrecer cupo</button>
    </div>`).join("") : `<div class="pending-person"><p>¡Todo al día! No hay clases pendientes.</p></div>`;
  document.querySelectorAll("[data-offer-student]").forEach(button => button.addEventListener("click", () => {
    activeOfferStudent = Number(button.dataset.offerStudent);
    showToast("Elegí uno de los próximos cupos disponibles.");
  }));
}

document.querySelectorAll("[data-slot]").forEach(button => button.addEventListener("click", () => {
  let student = activeOfferStudent && state.students.find(s => s.id === activeOfferStudent && s.debt > 0);
  if (!student) student = state.students.find(s => s.debt > 0);
  if (!student) return showToast("No hay clases pendientes para asignar.");
  student.debt--;
  saveState();
  activeOfferStudent = null;
  showToast(`Recuperación de ${student.name} agendada: ${button.dataset.slot}.`);
}));

const studentModal = document.querySelector("#studentModal");
["#openStudentModal", "#openStudentModal2"].forEach(selector => document.querySelector(selector).addEventListener("click", () => studentModal.showModal()));
document.querySelector("#wantsMold").addEventListener("change", event => document.querySelector("#moldSelectLabel").classList.toggle("hidden", !event.target.checked));
document.querySelector("#saveStudent").addEventListener("click", event => {
  const form = document.querySelector("#studentForm");
  if (!form.reportValidity()) { event.preventDefault(); return; }
  const data = new FormData(form);
  state.students.push({
    id: Date.now(), name: data.get("name"), phone: data.get("phone"), group: data.get("group"),
    frequency: data.get("frequency"), mold: data.get("wantsMold") ? data.get("mold") : "Sin molde", debt: 0
  });
  if (data.get("wantsMold")) {
    const mold = state.molds.find(m => m.name === data.get("mold"));
    if (mold?.available) mold.available--;
  }
  form.reset();
  document.querySelector("#moldSelectLabel").classList.add("hidden");
  saveState();
  showToast("Persona cargada correctamente.");
});

const attendanceModal = document.querySelector("#attendanceModal");
document.querySelector("#openAttendance").addEventListener("click", () => {
  renderAttendance();
  attendanceModal.showModal();
});

function renderAttendance() {
  const students = state.students.filter(s => s.group === "Viernes Tarde");
  document.querySelector("#attendanceRows").innerHTML = students.map(student => `
    <div class="attendance-row">
      <span class="mini-avatar">${initials(student.name)}</span>
      <div><strong>${student.name}</strong><small>${student.frequency}</small></div>
      <button data-mark-absent="${student.id}">No viene</button>
    </div>`).join("");
  document.querySelectorAll("[data-mark-absent]").forEach(button => button.addEventListener("click", event => {
    event.preventDefault();
    if (button.classList.contains("absent")) return;
    const student = state.students.find(s => s.id === Number(button.dataset.markAbsent));
    student.debt++;
    button.classList.add("absent");
    button.textContent = "Ausencia cargada";
    saveState();
    showToast(`${student.name}: se agregó 1 clase pendiente.`);
  }));
}

const simpleModal = document.querySelector("#simpleModal");
let simpleMode = "";
document.querySelector("#newGroupButton").addEventListener("click", () => openSimple("group"));
document.querySelector("#newMoldButton").addEventListener("click", () => openSimple("mold"));
function openSimple(mode) {
  simpleMode = mode;
  const isGroup = mode === "group";
  document.querySelector("#simpleKicker").textContent = isGroup ? "Nuevo horario" : "Nuevo inventario";
  document.querySelector("#simpleTitle").textContent = isGroup ? "Crear grupo" : "Cargar molde";
  document.querySelector("#simpleFields").innerHTML = isGroup ? `
    <label class="wide">Nombre del grupo<input name="name" required placeholder="Ej. Sábado Mañana"></label>
    <label>Día<select name="day"><option>Lunes</option><option>Martes</option><option>Miércoles</option><option>Jueves</option><option>Viernes</option><option>Sábado</option></select></label>
    <label>Hora<input type="time" name="time" required value="10:00"></label>
    <label class="wide">Capacidad<input type="number" name="capacity" required min="1" value="6"></label>` : `
    <label class="wide">Nombre del molde<input name="name" required placeholder="Ej. Fuente Redonda"></label>
    <label>Código<input name="code" required placeholder="M-07"></label>
    <label>Cantidad<input type="number" name="total" min="1" required value="1"></label>`;
  simpleModal.showModal();
}

document.querySelector("#saveSimple").addEventListener("click", event => {
  const form = document.querySelector("#simpleForm");
  if (!form.reportValidity()) { event.preventDefault(); return; }
  const data = new FormData(form);
  if (simpleMode === "group") state.groups.push({ id: Date.now(), name: data.get("name"), day: data.get("day"), time: data.get("time"), capacity: Number(data.get("capacity")) });
  else {
    const total = Number(data.get("total"));
    state.molds.push({ id: Date.now(), name: data.get("name"), code: data.get("code"), total, available: total, symbol: "◯" });
  }
  form.reset();
  saveState();
  showToast(simpleMode === "group" ? "Grupo creado correctamente." : "Molde cargado correctamente.");
});

function renderAll() {
  renderStats();
  renderCalendar();
  renderAttendees();
  renderStudents(document.querySelector("#studentSearch")?.value || "");
  renderGroups();
  renderMolds();
  renderPending();
}

renderAll();
