// ===========================
// ADMIN.JS - PARTE 1 (1/3)
// Desde inicio hasta guardarNegociacion()
// Basado en tu versión funcional (referencia). :contentReference[oaicite:1]{index=1}
// ===========================

const ENDPOINT = "/.netlify/functions/airtable";
let ventasChartInstance = null;

// Animación suave para KPIs
function animateValue(element, start, end, duration = 800) {
  if (!element) return;
  let startTime = null;
  function animation(currentTime) {
    if (!startTime) startTime = currentTime;
    const progress = currentTime - startTime;
    const value = Math.min(start + (end - start) * (progress / duration), end);
    element.innerText = "S/ " + Math.floor(value).toLocaleString();
    if (progress < duration) requestAnimationFrame(animation);
  }
  requestAnimationFrame(animation);
}

// Contenedores principales (asegúrate que existan en el DOM)
const reservasContainer = document.getElementById("reservasContainer");

// ===============================
// CARGAR RESERVAS (compatible y robusto)
// ===============================
async function loadReservas() {
  try {
    const res = await fetch(ENDPOINT + "?admin=1");
    const data = await res.json();

    if (!res.ok || !Array.isArray(data)) {
      if (reservasContainer) reservasContainer.innerHTML = "<p>Error cargando reservas</p>";
      return;
    }

    if (!reservasContainer) return;
    reservasContainer.innerHTML = "";

    data.forEach(r => {
      const div = document.createElement("div");
      div.className = "reserva-card";

      // campos defensivos: si no vienen, mostrar vacío o 0
      const cliente = r.cliente || "";
      const unidad = r.unidad || "";
      const agente = r.agente || "";
      const monto_reserva = Number(r.monto_reserva || 0);
      const precio_lista = Number(r.precio_lista || 0);
      const estado = r.estado || "";

      div.innerHTML = `
        <div class="reserva-header-pro">
          <div class="reserva-cliente-pro">${cliente}</div>
          <div class="reserva-estado-pro estado-${(estado||'').toLowerCase()}">${estado}</div>
        </div>

        <div class="reserva-body-pro">
          <div class="reserva-item"><span>Unidad</span><strong>${unidad}</strong></div>
          <div class="reserva-item"><span>Agente</span><strong>${agente}</strong></div>
          <div class="reserva-item"><span>Reserva</span><strong>S/ ${monto_reserva.toLocaleString()}</strong></div>
          <div class="reserva-item"><span>Precio Lista</span><strong>S/ ${precio_lista.toLocaleString()}</strong></div>
        </div>

        <div class="reserva-actions-pro">
          ${estado === "Solicitud" ? `
            <button class="btn-outline" onclick="validar('${r.id}')">Validar</button>
            <button class="btn-danger" onclick="rechazar('${r.id}', '${r.unidad_record_id || ""}')">Rechazar</button>
          ` : ""}

          ${estado === "Confirmada" ? `
            <button class="btn-outline" onclick="mostrarNegociacion('${r.id}')">Negociar</button>
            ${ (r.tipo_venta && Number(r.precio_final) > 0) ? 
              `<button class="btn-primary" onclick="convertirVenta('${r.id}', this)">Convertir</button>` : "" }
          ` : ""}
        </div>

        <div id="neg-${r.id}" class="negociacion-container-pro"></div>
      `;

      reservasContainer.appendChild(div);
    });

  } catch (error) {
    if (reservasContainer) reservasContainer.innerHTML = "<p>Error inesperado cargando reservas</p>";
    console.error("loadReservas error:", error);
  }
}

// Exponer globalmente (por si el HTML llama con onclick antes de evaluar)
window.loadReservas = loadReservas;

// ===============================
// VALIDAR
// ===============================
async function validar(id) {
  try {
    const res = await fetch(ENDPOINT, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "validar", reserva_id: id })
    });
    const data = await res.json();
    if (!res.ok || !data.success) return alert(data.error || "Error validando reserva");
    await loadReservas();
  } catch (error) {
    console.error("validar error:", error);
    alert("Error inesperado validando");
  }
}
window.validar = validar;

// ===============================
// RECHAZAR
// ===============================
async function rechazar(id, unidadId) {
  try {
    const res = await fetch(ENDPOINT, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rechazar", reserva_id: id, unidad_record_id: unidadId })
    });
    const data = await res.json();
    if (!res.ok || !data.success) return alert(data.error || "Error rechazando reserva");
    await loadReservas();
  } catch (error) {
    console.error("rechazar error:", error);
    alert("Error inesperado rechazando");
  }
}
window.rechazar = rechazar;

// ===============================
// MOSTRAR FORMULARIO DE NEGOCIACIÓN
// ===============================
function mostrarNegociacion(id) {
  const cont = document.getElementById(`neg-${id}`);
  if (!cont) return;

  // Si ya está renderizado, hacer toggle (útil para UX)
  if (cont.dataset.open === "1") {
    cont.innerHTML = "";
    cont.dataset.open = "0";
    return;
  }

  cont.dataset.open = "1";

  cont.innerHTML = `
    <div class="negociacion-card-pro">
      <h4>Negociación</h4>
      <div class="neg-grid-pro">
        <div>
          <label>Precio Final</label>
          <input type="number" id="precio_final_${id}">
        </div>
        <div>
          <label>Tipo Venta</label>
          <select id="tipo_venta_${id}">
            <option value="">Seleccionar</option>
            <option value="contado">Contado</option>
            <option value="financiamiento">Financiamiento</option>
          </select>
        </div>
        <div>
          <label>Monto Inicial</label>
          <input type="number" id="monto_inicial_${id}">
        </div>
        <div>
          <label>N° Cuotas</label>
          <input type="number" id="numero_cuotas_${id}">
        </div>
        <div>
          <label>Fecha Inicio Pagos</label>
          <input type="date" id="fecha_inicio_${id}">
        </div>
      </div>

      <label>Observaciones</label>
      <textarea id="obs_${id}" rows="2"></textarea>

      <div style="margin-top:12px;">
        <button class="btn-primary" onclick="guardarNegociacion('${id}')">Guardar Negociación</button>
      </div>
    </div>
  `;
}
window.mostrarNegociacion = mostrarNegociacion;

// ===============================
// GUARDAR NEGOCIACIÓN
// ===============================
async function guardarNegociacion(id) {
  try {
    const payload = {
      action: "negociacion",
      reserva_id: id,
      precio_final: (document.getElementById(`precio_final_${id}`)?.value) || "",
      tipo_venta: (document.getElementById(`tipo_venta_${id}`)?.value) || "",
      monto_inicial: (document.getElementById(`monto_inicial_${id}`)?.value) || 0,
      numero_cuotas: (document.getElementById(`numero_cuotas_${id}`)?.value) || 0,
      fecha_inicio_pagos: (document.getElementById(`fecha_inicio_${id}`)?.value) || "",
      observaciones: (document.getElementById(`obs_${id}`)?.value) || ""
    };

    const res = await fetch(ENDPOINT, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const response = await res.json();
    if (!res.ok || !response.success) return alert(response.error || "Error guardando negociación");

    // refrescar reservas y cerrar formulario de negociación
    const cont = document.getElementById(`neg-${id}`);
    if (cont) { cont.innerHTML = ""; cont.dataset.open = "0"; }

    await loadReservas();
  } catch (error) {
    console.error("guardarNegociacion error:", error);
    alert("Error inesperado guardando negociación");
  }
}
window.guardarNegociacion = guardarNegociacion;

// ===============================
// Nota: la PARTE 2 incluirá convertirVenta(), loadVentas(), showSection(), verVenta(), cargarCuotas(), etc.
// La PARTE 3 incluirá dashboard y utilidades finales.
// ===============================
// ===========================
// ADMIN.JS - PARTE 2 (2/3)
// Desde convertirVenta() hasta registrarPago()
// Basado en tu admin.js (referencia). :contentReference[oaicite:1]{index=1}
// ===========================

/**
 * CONVERTIR RESERVA A VENTA
 * - mantiene el botón deshabilitado mientras procesa
 * - refresca listados y navega a Ventas si todo sale OK
 */
async function convertirVenta(reservaId, btn) {
  if (!confirm("¿Confirmar conversión a venta?")) return;

  try {
    if (btn) {
      btn.disabled = true;
      btn.dataset.origText = btn.innerText || "Convertir";
      btn.innerText = "Procesando...";
    }

    const res = await fetch(ENDPOINT, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "convertir", reserva_id: reservaId })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      alert(data.error || "Error convirtiendo venta");
      if (btn) { btn.disabled = false; btn.innerText = btn.dataset.origText || "Convertir"; }
      return;
    }

    // éxito: recargar reservas y mostrar ventas
    await loadReservas();
    showSection("ventas", document.querySelector('[data-nav="ventas"]') || null);
    alert("Venta creada correctamente.");

  } catch (error) {
    console.error("convertirVenta error:", error);
    alert("Error inesperado convirtiendo");
    if (btn) { btn.disabled = false; btn.innerText = btn.dataset.origText || "Convertir"; }
  }
}
window.convertirVenta = convertirVenta;

/**
 * CARGAR VENTAS (KPIs + cards)
 * - seguro ante datos faltantes
 */
async function loadVentas() {
  try {
    const res = await fetch(`${ENDPOINT}?ventas=1`);
    const ventas = await res.json();

    const container = document.getElementById("ventasContainer");
    if (!container) return;

    if (!res.ok || !Array.isArray(ventas)) {
      container.innerHTML = "<p>Error cargando ventas</p>";
      return;
    }

    // KPIs
    let totalVendido = 0;
    let totalPendiente = 0;
    let ventasActivas = 0;
    let ventasPagadas = 0;

    ventas.forEach(v => {
      totalVendido += Number(v.precio_base || 0);
      totalPendiente += Number(v.saldo_restante || 0);
      if (v.estado_venta === "Activa") ventasActivas++;
      if (v.estado_venta === "Pagada") ventasPagadas++;
    });

    const totalCobrado = totalVendido - totalPendiente;

    container.innerHTML = `
      <div class="kpis-grid">
        <div class="kpi-card">
          <h3>Total Vendido</h3><p>S/ ${totalVendido.toLocaleString()}</p>
        </div>
        <div class="kpi-card">
          <h3>Total Cobrado</h3><p>S/ ${totalCobrado.toLocaleString()}</p>
        </div>
        <div class="kpi-card">
          <h3>Total Pendiente</h3><p>S/ ${totalPendiente.toLocaleString()}</p>
        </div>
        <div class="kpi-card">
          <h3>Ventas Activas</h3><p>${ventasActivas}</p>
        </div>
      </div>
      <hr style="margin:20px 0;">
    `;

    // Cards
    ventas.forEach(v => {
      const div = document.createElement("div");
      div.className = "venta-card-pro";
      const cliente = v.cliente || "";
      const unidad = v.unidad || "";
      const agente = v.agente || "";
      const precio = Number(v.precio_base || 0).toLocaleString();
      const reserva = Number(v.monto_reserva || 0).toLocaleString();
      const tipo = v.tipo_venta || "";
      const fecha = v.fecha_venta || "";
      const estado = v.estado_venta || "";

      div.innerHTML = `
        <div class="venta-header-pro">
          <div class="venta-cliente-pro">${cliente}</div>
          <div class="venta-estado-pro estado-${(estado||'').toLowerCase()}">${estado}</div>
        </div>

        <div class="venta-body-pro">
          <div><span>Unidad</span><strong>${unidad}</strong></div>
          <div><span>Agente</span><strong>${agente}</strong></div>
          <div><span>Tipo</span><strong>${tipo}</strong></div>
          <div><span>Fecha</span><strong>${fecha}</strong></div>
        </div>

        <div class="venta-finanzas-pro">
          <div><span>Precio</span><strong>S/ ${precio}</strong></div>
          <div><span>Reserva</span><strong>S/ ${reserva}</strong></div>
          <div style="align-self:flex-end;">
            <button class="btn-primary" onclick="verVenta('${v.id}')">Gestionar</button>
          </div>
        </div>
      `;

      container.appendChild(div);
    });

  } catch (error) {
    console.error("loadVentas error:", error);
    const container = document.getElementById("ventasContainer");
    if (container) container.innerHTML = "<p>Error inesperado cargando ventas</p>";
  }
}
window.loadVentas = loadVentas;

/**
 * NAV / SHOW SECTION
 * - asegura activar pestaña y pedir datos
 * - espera btn con data-nav en HTML cuando exista
 */
function showSection(sectionId, btn) {
  document.querySelectorAll('.section').forEach(sec => sec.classList.add('hidden'));
  const section = document.getElementById(sectionId);
  if (section) section.classList.remove('hidden');

  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  // cargar datos dependientes
  if (sectionId === "reservas") loadReservas();
  if (sectionId === "ventas") loadVentas();
  if (sectionId === "dashboard") loadDashboard();
}
window.showSection = showSection;

/**
 * VER DETALLE VENTA (modal)
 * - construye modal pro y luego carga cuotas
 */
async function verVenta(id) {
  try {
    const res = await fetch(`${ENDPOINT}?venta_id=${id}`);
    const data = await res.json();

    if (!res.ok || !data || !data.id) {
      alert(data?.error || "Error cargando venta");
      return;
    }

    const cont = document.getElementById("modalVentaContenido");
    if (!cont) return;

    // porcentaje cobrado defensivo
    const precio = Number(data.precio_base || 0);
    const saldo = Number(data.saldo_restante || 0);
    const cobrado = precio - saldo;
    const porcentaje = precio > 0 ? Math.round((cobrado / precio) * 100) : 0;

    cont.innerHTML = `
      <div class="modal-header-pro">
        <h3>Detalle de Venta</h3>
        <div class="venta-estado-pro estado-${(data.estado_venta||'').toLowerCase()}">${data.estado_venta || ''}</div>
      </div>

      <div class="modal-body-pro">
        <div class="modal-section-pro">
          <div><strong>Cliente:</strong> ${data.cliente || ""}</div>
          <div><strong>Unidad:</strong> ${data.unidad || ""}</div>
          <div><strong>Agente:</strong> ${data.agente || ""}</div>
        </div>

        <div class="modal-finanzas-pro">
          <div><span>Precio Base</span><strong>S/ ${precio.toLocaleString()}</strong></div>
          <div><span>Reserva</span><strong>S/ ${Number(data.monto_reserva||0).toLocaleString()}</strong></div>
          <div><span>Monto Inicial</span><strong>S/ ${Number(data.monto_inicial||0).toLocaleString()}</strong></div>
          <div><span>Saldo Restante</span><strong>S/ ${saldo.toLocaleString()}</strong></div>
        </div>

        <div class="barra-progreso-pro" aria-hidden="true">
          <div class="barra-interna-pro" style="width:${porcentaje}%;"></div>
        </div>

        <div class="modal-section-pro">
          <div><strong>Tipo:</strong> ${data.tipo_venta || ""}</div>
          <div><strong>Fecha:</strong> ${data.fecha_venta || ""}</div>
        </div>

        <hr>

        <h4>Cuotas</h4>
        <div id="listaCuotas"></div>

        <div id="formCuota" class="hidden" style="margin-top:12px;"></div>

        <div style="margin-top:18px;">
          <button class="btn-outline" onclick="mostrarFormularioCuota('${data.id}')">Agregar Cuota</button>
        </div>

      </div>
    `;

    const modal = document.getElementById("ventaModal");
    if (modal) modal.classList.remove("hidden");

    // cargar cuotas
    await cargarCuotas(id);

    // scroll to top inside modal content for UX
    const modalContent = document.querySelector("#ventaModal .modal-content");
    if (modalContent) modalContent.scrollTop = 0;

  } catch (error) {
    console.error("verVenta error:", error);
    alert("Error inesperado cargando detalle");
  }
}
window.verVenta = verVenta;

/**
 * CERRAR MODAL (limpieza)
 */
function cerrarModal() {
  const modal = document.getElementById("ventaModal");
  const cont = document.getElementById("modalVentaContenido");
  if (modal) modal.classList.add("hidden");
  if (cont) cont.innerHTML = "";
  // también ocultar formulario si estaba abierto
  const form = document.getElementById("formCuota");
  if (form) { form.classList.add("hidden"); form.innerHTML = ""; }
}
window.cerrarModal = cerrarModal;

/**
 * CARGAR CUOTAS (robusto)
 * - asume que endpoint devuelve array [{ id, numero, monto, fecha, estado }]
 * - muestra listado en orden ascendente por numero
 */
async function cargarCuotas(ventaId) {
  try {
    const res = await fetch(`${ENDPOINT}?cuotas_venta=${ventaId}`);
    const cuotas = await res.json();
    const cont = document.getElementById("listaCuotas");
    if (!cont) return;

    if (!res.ok || !Array.isArray(cuotas)) {
      cont.innerHTML = "<em>Error cargando cuotas.</em>";
      return;
    }

    // ordenar por numero_cuota / numero
    cuotas.sort((a,b) => (Number(a.numero||a.numero_cuota||0)) - (Number(b.numero||b.numero_cuota||0)));

    if (!cuotas.length) {
      cont.innerHTML = "<em>No hay cuotas registradas.</em>";
      return;
    }

    cont.innerHTML = cuotas.map(c => {
      const numero = c.numero || c.numero_cuota || "";
      const monto = Number(c.monto || c.monto_programado || 0).toLocaleString();
      const fecha = c.fecha || c.fecha_vencimiento || "";
      const estado = c.estado || c.estado_cuota || "Pendiente";
      const cuotaId = c.id || "";

      return `
        <div class="cuota-card-pro">
          <div class="cuota-header-pro">
            <strong>Cuota ${numero}</strong>
            <span class="estado-${(estado||'').toLowerCase()}">${estado}</span>
          </div>
          <div>Monto: S/ ${monto}</div>
          <div>Fecha: ${fecha}</div>
          <div style="margin-top:8px;">
            <button class="btn-outline" onclick="mostrarPago('${ventaId}', '${cuotaId}')">Registrar Pago</button>
          </div>
        </div>
      `;
    }).join("");

  } catch (error) {
    console.error("cargarCuotas error:", error);
    const cont = document.getElementById("listaCuotas");
    if (cont) cont.innerHTML = "<em>Error inesperado cargando cuotas.</em>";
  }
}
window.cargarCuotas = cargarCuotas;

/**
 * MOSTRAR FORMULARIO AGREGAR CUOTA
 * - reutiliza #formCuota dentro del modal, hace toggle
 */
function mostrarFormularioCuota(ventaId) {
  const form = document.getElementById("formCuota");
  if (!form) return;

  // si abierto, close
  if (form.dataset.open === "1") {
    form.innerHTML = "";
    form.dataset.open = "0";
    form.classList.add("hidden");
    return;
  }

  form.dataset.open = "1";
  form.classList.remove("hidden");

  form.innerHTML = `
    <div class="negociacion-card-pro">
      <div style="display:grid;grid-template-columns:1fr 1fr; gap:8px;">
        <input id="numCuota" type="number" placeholder="Número cuota" />
        <input id="montoCuota" type="number" placeholder="Monto (S/)" />
      </div>
      <div style="margin-top:8px;">
        <input id="fechaCuota" type="date" />
      </div>
      <div style="margin-top:10px; display:flex; gap:8px;">
        <button class="btn-primary" onclick="crearCuota('${ventaId}')">Guardar Cuota</button>
        <button class="btn-outline" onclick="mostrarFormularioCuota('${ventaId}')">Cancelar</button>
      </div>
    </div>
  `;
}
window.mostrarFormularioCuota = mostrarFormularioCuota;

/**
 * CREAR CUOTA (POST)
 */
async function crearCuota(ventaId) {
  try {
    const numero = document.getElementById("numCuota")?.value;
    const monto = document.getElementById("montoCuota")?.value;
    const fecha = document.getElementById("fechaCuota")?.value;

    if (!numero || !monto || !fecha) {
      return alert("Completa todos los campos");
    }

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "crear_cuota", venta_id: ventaId, numero, monto, fecha })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return alert(data.error || "Error creando cuota");
    }

    // limpiar form y recargar cuotas
    const form = document.getElementById("formCuota");
    if (form) { form.innerHTML = ""; form.classList.add("hidden"); form.dataset.open = "0"; }
    await cargarCuotas(ventaId);

  } catch (error) {
    console.error("crearCuota error:", error);
    alert("Error inesperado creando cuota");
  }
}
window.crearCuota = crearCuota;

/**
 * MOSTRAR FORMULARIO PAGO
 * - recibe cuotaId opcional (si quieres mostrar a qué cuota se asocia)
 * - coloca el formulario en #formCuota (reusa)
 */
function mostrarPago(ventaId, cuotaId = "") {
  const form = document.getElementById("formCuota");
  if (!form) return;

  // abrir como pago (sobrescribe)
  form.dataset.open = "1";
  form.classList.remove("hidden");

  form.innerHTML = `
    <div class="negociacion-card-pro">
      <h4>Registrar Pago ${cuotaId ? " - Cuota " + cuotaId : ""}</h4>
      <div style="display:grid; gap:8px;">
        <input id="montoPago" type="number" placeholder="Monto (S/)" />
        <select id="metodoPago">
          <option value="Efectivo">Efectivo</option>
          <option value="Transferencia">Transferencia</option>
          <option value="Yape">Yape</option>
          <option value="Otro">Otro</option>
        </select>
        <input id="fechaPago" type="date" />
      </div>
      <div style="margin-top:8px; display:flex; gap:8px;">
        <button class="btn-primary" onclick="registrarPago('${ventaId}', '${cuotaId}')">Guardar Pago</button>
        <button class="btn-outline" onclick="(()=>{ form.innerHTML=''; form.classList.add('hidden'); form.dataset.open='0'; })()">Cancelar</button>
      </div>
    </div>
  `;
}
window.mostrarPago = mostrarPago;

/**
 * REGISTRAR PAGO (PATCH registrar_pago)
 * - llama al endpoint y actualiza modal
 */
async function registrarPago(ventaId, cuotaId = "") {
  try {
    const monto = document.getElementById("montoPago")?.value;
    const metodo = document.getElementById("metodoPago")?.value || "Efectivo";
    const fecha = document.getElementById("fechaPago")?.value;

    if (!monto || Number(monto) <= 0) return alert("Monto inválido");
    if (!fecha) return alert("Selecciona fecha de pago");

    const payload = { action: "registrar_pago", venta_id: ventaId, monto, metodo, fecha_pago: fecha };
    // si se pasó cuotaId opcional, se deja que backend lo asocie por orden; no es obligatorio.
    if (cuotaId) payload.cuota_id = cuotaId;

    const res = await fetch(ENDPOINT, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return alert(data.error || "Error registrando pago");
    }

    // cerrar form, recargar modal detalle para ver cuotas actualizadas
    const form = document.getElementById("formCuota");
    if (form) { form.innerHTML = ""; form.classList.add("hidden"); form.dataset.open = "0"; }

    // recargar la vista de venta (refresca cuotas y barra)
    await verVenta(ventaId);

  } catch (error) {
    console.error("registrarPago error:", error);
    alert("Error inesperado registrando pago");
  }
}
window.registrarPago = registrarPago;

// FIN PARTE 2
// ===========================
// ADMIN.JS - PARTE 3 (3/3)
// Dashboard + utilidades + init
// ===========================

/* ---------- UTILIDADES ---------- */

function formatMoney(n) {
  const num = Number(n || 0);
  return "S/ " + num.toLocaleString();
}
window.formatMoney = formatMoney;

function safeNumber(v) {
  return Number(v === undefined || v === null ? 0 : v);
}
window.safeNumber = safeNumber;

// clases para estados (puedes expandir)
function getVentaEstadoClass(estado) {
  if (!estado) return "";
  const s = estado.toLowerCase();
  if (s.includes("act")) return "venta-activa";
  if (s.includes("pag")) return "venta-pagada";
  if (s.includes("can")) return "venta-cancelada";
  return "venta-otra";
}
window.getVentaEstadoClass = getVentaEstadoClass;

function getCuotaEstadoClass(estado) {
  if (!estado) return "";
  const s = estado.toLowerCase();
  if (s.includes("pag")) return "cuota-pagada";
  if (s.includes("parc")) return "cuota-parcial";
  if (s.includes("pend")) return "cuota-pendiente";
  return "cuota-otra";
}
window.getCuotaEstadoClass = getCuotaEstadoClass;

/* ---------- DASHBOARD (PRO) ---------- */

let ventasChartInstanceLocal = null;

async function loadDashboard() {
  try {
    const res = await fetch(`${ENDPOINT}?ventas=1`);
    const ventas = await res.json();

    if (!res.ok || !Array.isArray(ventas)) {
      // si no hay datos, limpia widget
      const kpis = document.getElementById("dashboardKpis");
      if (kpis) kpis.innerHTML = "<p>No hay datos de ventas.</p>";
      return;
    }

    // ordenar cronológicamente por fecha_venta (si existe)
    ventas.sort((a,b) => new Date(a.fecha_venta || 0) - new Date(b.fecha_venta || 0));

    // KPIs acumulados
    let totalVendido = 0;
    let totalPendiente = 0;
    let ventasActivas = 0;
    let ventasPagadas = 0;

    const labels = [];
    const ventasData = [];
    const cobradoData = [];

    let acumuladoVentas = 0;
    let acumuladoCobrado = 0;

    ventas.forEach(v => {
      const precio = safeNumber(v.precio_base);
      const saldo = safeNumber(v.saldo_restante);
      const cobrado = precio - saldo;

      totalVendido += precio;
      totalPendiente += saldo;
      if ((v.estado_venta || "").toLowerCase() === "activa") ventasActivas++;
      if ((v.estado_venta || "").toLowerCase() === "pagada") ventasPagadas++;

      acumuladoVentas += precio;
      acumuladoCobrado += cobrado;

      // label legible: fecha o índice
      labels.push(v.fecha_venta || "");
      ventasData.push(Math.round(acumuladoVentas));
      cobradoData.push(Math.round(acumuladoCobrado));
    });

    const totalCobrado = totalVendido - totalPendiente;

    const kpis = document.getElementById("dashboardKpis");
    if (!kpis) return;

    kpis.innerHTML = `
      <div class="kpi-card-pro">
        <div class="kpi-title">Total Vendido</div>
        <div class="kpi-value" id="kpiTotalVendido">S/ 0</div>
      </div>
      <div class="kpi-card-pro">
        <div class="kpi-title">Total Cobrado</div>
        <div class="kpi-value" id="kpiTotalCobrado">S/ 0</div>
      </div>
      <div class="kpi-card-pro">
        <div class="kpi-title">Total Pendiente</div>
        <div class="kpi-value" id="kpiTotalPendiente">S/ 0</div>
      </div>
      <div class="kpi-card-pro">
        <div class="kpi-title">Ventas Activas</div>
        <div class="kpi-value">${ventasActivas}</div>
      </div>
      <div class="kpi-card-pro">
        <div class="kpi-title">Ventas Pagadas</div>
        <div class="kpi-value">${ventasPagadas}</div>
      </div>
    `;

    // animar KPIs
    animateValue(document.getElementById("kpiTotalVendido"), 0, totalVendido);
    animateValue(document.getElementById("kpiTotalCobrado"), 0, totalCobrado);
    animateValue(document.getElementById("kpiTotalPendiente"), 0, totalPendiente);

    // Gráfico: si Chart no está cargado, ignora (evita crash)
    const canvas = document.getElementById("ventasChart");
    if (!canvas) return;

    // destruye instancia previa si existe
    if (ventasChartInstanceLocal && typeof ventasChartInstanceLocal.destroy === "function") {
      ventasChartInstanceLocal.destroy();
      ventasChartInstanceLocal = null;
    }

    // Si Chart.js no está definido, inserta mensaje y retorna
    if (typeof Chart === "undefined") {
      canvas.parentElement.innerHTML = "<p>Chart.js no cargado. Añade la librería para ver el gráfico.</p>";
      return;
    }

    const ctx = canvas.getContext("2d");
    ventasChartInstanceLocal = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Ventas",
            data: ventasData,
            borderColor: "#10b981",
            backgroundColor: "rgba(16,185,129,0.08)",
            tension: 0.35,
            fill: true,
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: "#10b981"
          },
          {
            label: "Cobrado",
            data: cobradoData,
            borderColor: "#3b82f6",
            backgroundColor: "rgba(59,130,246,0.08)",
            tension: 0.35,
            fill: true,
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: "#3b82f6"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: "#cbd5e1" }
          },
          tooltip: {
            mode: "index",
            intersect: false,
            callbacks: {
              label: ctxItem => `S/ ${Number(ctxItem.parsed.y).toLocaleString()}`
            }
          }
        },
        scales: {
          x: {
            grid: { color: "rgba(255,255,255,0.03)" },
            ticks: { color: "#94a3b8" }
          },
          y: {
            grid: { color: "rgba(255,255,255,0.03)" },
            ticks: { color: "#94a3b8" }
          }
        }
      }
    });

  } catch (error) {
    console.error("loadDashboard error:", error);
  }
}
window.loadDashboard = loadDashboard;

/* ---------- INICIALIZADOR / BINDINGS ---------- */

function initAdmin() {
  // asegurar que los botones de nav llaman showSection con data-nav
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const sec = btn.getAttribute('data-nav');
      showSection(sec, btn);
    });
  });

  // cargar dashboard por defecto si existe
  const activeSection = document.querySelector('.nav-btn.active')?.getAttribute('data-nav') || "dashboard";
  showSection(activeSection, document.querySelector(`[data-nav="${activeSection}"]`));

  // Modal cierre al overlay y Escape
  document.addEventListener('click', (e) => {
    const modal = document.getElementById("ventaModal");
    if (!modal) return;
    if (e.target === modal) cerrarModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === "Escape") cerrarModal();
  });

  // Mejora UX: limitar altura modal y permitir scroll interno
  const modalContent = document.querySelector("#ventaModal .modal-content");
  if (modalContent) {
    modalContent.style.maxHeight = "80vh";
    modalContent.style.overflowY = "auto";
  }

  // Si hay canvas ventasChart y Chart.js ya cargada, cargar dashboard
  // (defer para permitir fetch de librerías externas)
  setTimeout(() => {
    if (document.getElementById("dashboardKpis")) {
      loadDashboard();
    }
  }, 200);
}

// Exponer init y ejecutar cuando DOM esté listo
window.initAdmin = initAdmin;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAdmin);
} else {
  initAdmin();
}

// ---------- FIN PARTE 3 ----------