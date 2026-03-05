// ===============================
// 🔐 AUTENTICACIÓN Y SEGURIDAD
// ===============================

const token = localStorage.getItem("auth_token");

if (!token) {
  window.location.href = "/login-agente.html";
}

function parseJwt(token) {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(
    atob(base64)
      .split('')
      .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('')
  );
  return JSON.parse(jsonPayload);
}

let decoded;

try {
  decoded = parseJwt(token);
} catch {
  localStorage.removeItem("auth_token");
  window.location.href = "/login-agente.html";
}

// 🔴 Redirección si es admin
if (decoded.rol === "admin") {
  window.location.href = "/admin.html";
}

// ===============================
// 🎯 VARIABLES GLOBALES
// ===============================

const ENDPOINT = "/.netlify/functions/airtable";

const mainContent = document.getElementById("viewContainer");
const heroTitle = document.getElementById("heroTitle");
const heroSubtitle = document.getElementById("heroSubtitle");
const agentNameEl = document.getElementById("agentName");
const loader = document.getElementById("globalLoader");

// KPIs
const kpiReservas = document.getElementById("kpiReservas");
const kpiVentas = document.getElementById("kpiVentas");
const kpiComisionProyectada = document.getElementById("kpiComisionProyectada");
const kpiComisionDisponible = document.getElementById("kpiComisionDisponible");

// ===============================
// 🧑‍💼 SET AGENTE
// ===============================

agentNameEl.innerText = decoded.nombre;
heroTitle.innerText = `Hola, ${decoded.nombre.split(" ")[0]}`;

// ===============================
// 🔄 UTILIDADES UI
// ===============================

function showLoader() {
  loader.classList.remove("hidden");
}

function hideLoader() {
  loader.classList.add("hidden");
}

function formatCurrency(value) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN"
  }).format(value || 0);
}

function animateValue(element, end, duration = 600) {
  let start = 0;
  let startTime = null;

  function animation(currentTime) {
    if (!startTime) startTime = currentTime;
    const progress = currentTime - startTime;
    const value = Math.min(start + (end * (progress / duration)), end);
    element.innerText = formatCurrency(value);

    if (progress < duration) {
      requestAnimationFrame(animation);
    }
  }

  requestAnimationFrame(animation);
}

// ===============================
// 📦 SISTEMA DE VISTAS
// ===============================

const views = {
  inicio: renderInicio,
  reservas: renderReservas,
  ventas: renderVentas,
  comisiones: renderComisiones
};

async function setView(viewName) {

  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.classList.remove("active");
    if (btn.dataset.view === viewName) {
      btn.classList.add("active");
    }
  });

  heroSubtitle.innerText = getSubtitle(viewName);

  if (viewName === "reservas") {
    mainContent.innerHTML = await renderReservas();
  } else {
    mainContent.innerHTML = views[viewName]();
  }
}

// ===============================
// 🏠 VISTA INICIO
// ===============================

function renderInicio() {
  return `
    <div class="section-card">
      <h2>Centro Operativo</h2>
      <p>Accesos rápidos a tus herramientas principales.</p>
    </div>

    <div class="quick-actions">

      <button class="action-card primary" onclick="goToFormulario()">
        <div class="action-icon">➕</div>
        <div class="action-title">Nueva Reserva</div>
        <div class="action-sub">Registrar cliente y unidad</div>
      </button>

      <button class="action-card" onclick="goToPlano()">
        <div class="action-icon">🗺</div>
        <div class="action-title">Ver Plano</div>
        <div class="action-sub">Explorar disponibilidad</div>
      </button>

      <button class="action-card" onclick="setView('reservas')">
        <div class="action-icon">📄</div>
        <div class="action-title">Mis Reservas</div>
        <div class="action-sub">Seguimiento activo</div>
      </button>

      <button class="action-card" onclick="setView('comisiones')">
        <div class="action-icon">💰</div>
        <div class="action-title">Comisiones</div>
        <div class="action-sub">Estado financiero</div>
      </button>

    </div>
  `;
}
function goToFormulario() {
  window.location.href = "/index.html";
}

function goToPlano() {
  // Puedes ajustar proyecto/fase dinámicamente luego
  window.location.href = "/plano-test.html?proyecto=ALP&fase=F2";
}
// ===============================
// 📄 VISTA RESERVAS
// ===============================

async function renderReservas() {

  showLoader();

  try {
    const res = await fetch(`${ENDPOINT}?mis_reservas=1`, {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (!res.ok) {
  throw new Error("Error HTTP");
}

const data = await res.json();

    hideLoader();

    if (!Array.isArray(data) || data.length === 0) {
      return `
        <div class="section-card">
          <h2>Mis Reservas</h2>
          <p>No tienes reservas registradas.</p>
        </div>
      `;
    }

    return `
      <div class="section-card">
        <h2>Mis Reservas</h2>
      </div>

      ${data.map(r => `
        <div class="reserva-card">
          <div class="reserva-header">
            <strong>${r.cliente}</strong>
            <span class="estado-${(r.estado || '').toLowerCase()}">${r.estado}</span>
          </div>
          <div class="reserva-body">
            <div>Unidad: ${r.unidad}</div>
            <div>Monto: ${formatCurrency(r.monto)}</div>
          </div>
        </div>
      `).join("")}
    `;

  } catch (error) {
    hideLoader();
    return `
      <div class="section-card">
        <h2>Error</h2>
        <p>No se pudieron cargar tus reservas.</p>
      </div>
    `;
  }
}

// ===============================
// 📊 VISTA VENTAS
// ===============================

async function renderVentas() {

  showLoader();

  try {

    const res = await fetch(`${ENDPOINT}?mis_ventas=1`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!res.ok) throw new Error("Error ventas");

    const data = await res.json();

    hideLoader();

    if (!Array.isArray(data) || data.length === 0) {
      return `
        <div class="section-card">
          <h2>Mis Ventas</h2>
          <p>No tienes ventas registradas.</p>
        </div>
      `;
    }

    return `
      <div class="section-card">
        <h2>Mis Ventas</h2>
      </div>

      ${data.map(v => `
        <div class="reserva-card">
          <div class="reserva-header">
            <strong>${v.cliente}</strong>
            <span>${v.estado}</span>
          </div>
          <div class="reserva-body">
            <div>Unidad: ${v.unidad}</div>
            <div>Precio: ${formatCurrency(v.precio_base)}</div>
            <div>Saldo: ${formatCurrency(v.saldo_restante)}</div>
          </div>
        </div>
      `).join("")}
    `;

  } catch (error) {

    hideLoader();

    return `
      <div class="section-card">
        <h2>Error</h2>
        <p>No se pudieron cargar tus ventas.</p>
      </div>
    `;
  }
}

// ===============================
// 💰 VISTA COMISIONES
// ===============================

function renderComisiones() {
  return `
    <div class="section-card">
      <h2>Comisiones</h2>
      <p>Las comisiones se habilitarán cuando la venta esté completamente pagada.</p>
    </div>
  `;
}

// ===============================
// 📑 SUBTÍTULOS DINÁMICOS
// ===============================

function getSubtitle(view) {
  const map = {
    inicio: "Resumen general de tu actividad comercial",
    reservas: "Seguimiento de tus reservas activas",
    ventas: "Estado financiero de tus ventas",
    comisiones: "Detalle y disponibilidad de comisiones"
  };
  return map[view] || "";
}

// ===============================
// 🔘 EVENTOS NAVEGACIÓN
// ===============================

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    setView(btn.dataset.view);
  });
});

// ===============================
// 📊 SIMULACIÓN KPI (Temporal)
// ===============================
async function loadKpis() {

  try {

    const res = await fetch(`${ENDPOINT}?kpis_agente=1`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!res.ok) throw new Error("Error KPIs");

    const data = await res.json();

    kpiReservas.innerText = data.reservas;
kpiVentas.innerText = data.ventas;

kpiComisionProyectada.innerText =
  formatCurrency(data.comision_proyectada || 0);

  } catch (err) {
    console.error("Error cargando KPIs", err);
  }
}
// ===============================
// 🚀 INICIALIZACIÓN
// ===============================

function init() {

  setView("inicio");

  loadKpis();

}
init();