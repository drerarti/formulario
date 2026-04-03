// ===========================
// ADMIN.JS - PARTE 1 (1/3)
// Desde inicio hasta guardarNegociacion()
// Basado en tu versiÃ³n funcional (referencia). :contentReference[oaicite:1]{index=1}
// ===========================
const { AppCore } = window;
const session = AppCore.requireSession({
  role: "admin",
  forbiddenRedirect: "/dashboard-agente.html"
});

if (!session) {
  throw new Error("Admin session required");
}

const token = session.token;
const h = AppCore.escapeHtml;
let unidadesCache = [];
 

// ðŸ”´ OPCIONAL PERO RECOMENDADO

const ENDPOINT = AppCore.API_ENDPOINT;
let ventasChartInstance = null;

function encodeArg(value) {
  return encodeURIComponent(String(value ?? ""));
}

function adminApi(options = {}) {
  return AppCore.apiRequest({
    auth: true,
    ...options
  });
}

function fillSelectOptions(element, placeholderLabel, values, labelBuilder = (value) => value) {
  if (!element) return;

  AppCore.clearElement(element);

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = placeholderLabel;
  element.appendChild(placeholder);

  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labelBuilder(value);
    element.appendChild(option);
  });
}

// AnimaciÃ³n suave para KPIs
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

// Contenedores principales (asegÃºrate que existan en el DOM)
const reservasContainer = document.getElementById("reservasContainer");

// ===============================
// CARGAR RESERVAS (compatible y robusto)
// ===============================
async function loadReservas() {
  try {
    const data = await adminApi({ query: { admin: 1 } });

    if (!Array.isArray(data)) {
      if (reservasContainer) reservasContainer.innerHTML = "<p>Error cargando reservas</p>";
      return;
    }

    if (!reservasContainer) return;
    reservasContainer.innerHTML = "";

    data.forEach(r => {
      const div = document.createElement("div");
      div.className = "reserva-card";

      // campos defensivos: si no vienen, mostrar vacÃ­o o 0
      const cliente = r.cliente || "";
      let unidad = r.unidad || "";
const agente = r.agente || "";
const monto_reserva = Number(r.monto_reserva || 0);
let precio_lista = Number(r.precio_lista || 0);
      const reservaId = encodeArg(r.id);
      const unidadRecordId = encodeArg(r.unidad_record_id || "");
      const unidadData = unidadesCache.find(u => u.id === unidad);

if (unidadData) {
  unidad = unidadData.codigo;
  precio_lista = unidadData.precio;
}
      const estado = r.estado || "";
      const clienteHtml = h(cliente);
      const unidadHtml = h(unidad);
      const agenteHtml = h(agente);
      const estadoHtml = h(estado);
      const motivoHtml = h(r.motivo_descuento || "");

      div.innerHTML = `
        <div class="reserva-header-pro">
          <div class="reserva-cliente-pro">${clienteHtml}</div>
          <div class="reserva-estado-pro estado-${(estado||'').toLowerCase()}">${estadoHtml}</div>
        </div>

        <div class="reserva-body-pro">
          <div class="reserva-item"><span>Unidad</span><strong>${unidadHtml}</strong></div>
          <div class="reserva-item"><span>Agente</span><strong>${agenteHtml}</strong></div>
          <div class="reserva-item"><span>Reserva</span><strong>S/ ${monto_reserva.toLocaleString()}</strong></div>
          <div class="reserva-item"><span>Precio Lista</span><strong>S/ ${precio_lista.toLocaleString()}</strong></div>
        </div><div class="reserva-item">
<span>Descuento</span>
<strong>S/ ${Number(r.descuento_solicitado || 0).toLocaleString()}</strong>
</div>

<div class="reserva-item">
<span>Sobreprecio</span>
<strong>S/ ${Number(r.sobreprecio || 0).toLocaleString()}</strong>
</div>
${r.motivo_descuento ? `
<div class="reserva-motivo">
Motivo: ${motivoHtml}
</div>
` : ""}
        <div class="reserva-actions-pro">
          ${estado === "Solicitud" ? `
            <button class="btn-outline" onclick="validar(decodeURIComponent('${reservaId}'))">Validar</button>
            <button class="btn-danger" onclick="rechazar(decodeURIComponent('${reservaId}'), decodeURIComponent('${unidadRecordId}'))">Rechazar</button>
          ` : ""}

          ${estado === "Confirmada" ? `
            <button class="btn-outline" onclick="mostrarNegociacion(decodeURIComponent('${reservaId}'))">Negociar</button>
            ${estado === "Confirmada" && !r.boleta_emitida ? `
<button class="btn-boleta"
  onclick="abrirPreviewBoleta(decodeURIComponent('${reservaId}'))">
  Generar Boleta
</button>
` : ""}
            ${ (r.tipo_venta && Number(r.precio_final) > 0) ? 
              `<button class="btn-primary" onclick="convertirVenta(decodeURIComponent('${reservaId}'), this)">Convertir</button>` : "" }
          ` : ""}
        </div>

        <div id="neg-${h(r.id)}" class="negociacion-container-pro"></div>
      `;

      reservasContainer.appendChild(div);
    });

  } catch (error) {
    if (reservasContainer) reservasContainer.innerHTML = "<p>Error inesperado cargando reservas</p>";
    console.error("loadReservas error:", error);
  }
}
function abrirPreviewBoleta(reservaId) {
  window.location.href = `preview-boleta.html?id=${encodeURIComponent(reservaId)}`;
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
      headers: {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${token}`
},
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
      headers: {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${token}`
},
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
// MOSTRAR FORMULARIO DE NEGOCIACIÃ“N
// ===============================
function mostrarNegociacion(id) {
  const cont = document.getElementById(`neg-${id}`);
  if (!cont) return;

  // Si ya estÃ¡ renderizado, hacer toggle (Ãºtil para UX)
  if (cont.dataset.open === "1") {
    cont.innerHTML = "";
    cont.dataset.open = "0";
    return;
  }

  cont.dataset.open = "1";

  cont.innerHTML = `
    <div class="negociacion-card-pro">
      <h4>NegociaciÃ³n</h4>
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
          <label>NÂ° Cuotas</label>
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
        <button class="btn-primary" onclick="guardarNegociacion('${id}')">Guardar NegociaciÃ³n</button>
      </div>
    </div>
  `;
}
window.mostrarNegociacion = mostrarNegociacion;

// ===============================
// GUARDAR NEGOCIACIÃ“N
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
      headers: {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${token}`
},
      body: JSON.stringify(payload)
    });

    const response = await res.json();
    if (!res.ok || !response.success) return alert(response.error || "Error guardando negociaciÃ³n");

    // refrescar reservas y cerrar formulario de negociaciÃ³n
    const cont = document.getElementById(`neg-${id}`);
    if (cont) { cont.innerHTML = ""; cont.dataset.open = "0"; }

    await loadReservas();
  } catch (error) {
    console.error("guardarNegociacion error:", error);
    alert("Error inesperado guardando negociaciÃ³n");
  }
}
window.guardarNegociacion = guardarNegociacion;

// ===============================
// Nota: la PARTE 2 incluirÃ¡ convertirVenta(), loadVentas(), showSection(), verVenta(), cargarCuotas(), etc.
// La PARTE 3 incluirÃ¡ dashboard y utilidades finales.
// ===============================
// ===========================
// ADMIN.JS - PARTE 2 (2/3)
// Desde convertirVenta() hasta registrarPago()
// Basado en tu admin.js (referencia). :contentReference[oaicite:1]{index=1}
// ===========================

/**
 * CONVERTIR RESERVA A VENTA
 * - mantiene el botÃ³n deshabilitado mientras procesa
 * - refresca listados y navega a Ventas si todo sale OK
 */
async function convertirVenta(reservaId, btn) {
  if (!confirm("Â¿Confirmar conversiÃ³n a venta?")) return;

  try {
    if (btn) {
      btn.disabled = true;
      btn.dataset.origText = btn.innerText || "Convertir";
      btn.innerText = "Procesando...";
    }

    const res = await fetch(ENDPOINT, {
      
      method: "PATCH",
      headers: {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${token}`
},
      body: JSON.stringify({ action: "convertir", reserva_id: reservaId })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      alert(data.error || "Error convirtiendo venta");
      if (btn) { btn.disabled = false; btn.innerText = btn.dataset.origText || "Convertir"; }
      return;
    }

    // Ã©xito: recargar reservas y mostrar ventas
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
    const ventas = await adminApi({ query: { ventas: 1 } });

    const container = document.getElementById("ventasContainer");
    if (!container) return;

    if (!Array.isArray(ventas)) {
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
container.innerHTML = "";
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
      let unidad = v.unidad || "";
      const agente = v.agente || "";
      const precio = Number(v.precio_base || 0).toLocaleString();
      const unidadData = unidadesCache.find(u => u.id === unidad);

if (unidadData) {
  unidad = unidadData.codigo;
}
      const reserva = Number(v.monto_reserva || 0).toLocaleString();
      const tipo = v.tipo_venta || "";
      const fecha = v.fecha_venta || "";
      const estado = v.estado_venta || "";
      const ventaId = encodeArg(v.id);

      div.innerHTML = `
        <div class="venta-header-pro">
          <div class="venta-cliente-pro">${h(cliente)}</div>
          <div class="venta-estado-pro estado-${(estado||'').toLowerCase()}">${h(estado)}</div>
        </div>

        <div class="venta-body-pro">
          <div><span>Unidad</span><strong>${h(unidad)}</strong></div>
          <div><span>Agente</span><strong>${h(agente)}</strong></div>
          <div><span>Tipo</span><strong>${h(tipo)}</strong></div>
          <div><span>Fecha</span><strong>${h(fecha)}</strong></div>
        </div>

        <div class="venta-finanzas-pro">
          <div><span>Precio</span><strong>S/ ${precio}</strong></div>
          <div><span>Reserva</span><strong>S/ ${reserva}</strong></div>
          <div style="align-self:flex-end;">
            <button class="btn-primary" onclick="verVenta(decodeURIComponent('${ventaId}'))">Gestionar</button>
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
 * - asegura activar pestaÃ±a y pedir datos
 * - espera btn con data-nav en HTML cuando exista
 */
function showSection(sectionId, btn) {
  document.querySelectorAll('.section').forEach(sec => sec.classList.add('hidden'));
  const section = document.getElementById(sectionId);
  if (section) section.classList.remove('hidden');
if (sectionId === "unidades") loadUnidades();
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
    const data = await adminApi({ query: { venta_id: id } });

    if (!data || !data.id) {
      alert("Error cargando venta");
      return;
    }

    const cont = document.getElementById("modalVentaContenido");
    if (!cont) return;

    // porcentaje cobrado defensivo
    const precio = Number(data.precio_base || 0);
    const saldo = Number(data.saldo_restante || 0);
    const totalPagado = Number(data.total_pagado || Math.max(0, precio - saldo));
    const porcentaje = data.avance_porcentaje || (precio > 0 ? Math.round((totalPagado / precio) * 100) : 0);
    const estadoVenta = String(data.estado_venta || "");
    const estadoVentaClass = estadoVenta.toLowerCase().replace(/\s+/g, "-");
    const totalFinanciable = Math.max(0, Number(data.saldo_financiado || (precio - Number(data.monto_reserva || 0) - Number(data.monto_inicial || 0))));
    const totalProgramado = Math.max(0, Number(data.total_programado_cuotas || 0));
    const saldoPendienteProgramar = Math.max(0, Number(data.saldo_pendiente_programar || (totalFinanciable - totalProgramado)));
    const saldoPendientePago = Math.max(0, Number(data.saldo_pendiente_pago || saldo));
    const cuotasPendientes = Number(data.cuotas_pendientes || 0);
    const isLockedSale = ["cerrada", "cancelada", "bloqueada"].includes(estadoVenta.toLowerCase());
    const canAddQuota = saldoPendienteProgramar > 0 && !isLockedSale;
    const canRegisterPayment = Number(data.total_cuotas || 0) > 0 && saldoPendientePago > 0 && !isLockedSale;
    const quotaMessage = canAddQuota
      ? ""
      : isLockedSale
          ? `La venta esta ${estadoVenta.toLowerCase()} y no admite nuevas cuotas.`
          : totalFinanciable <= 0
            ? "No existe saldo financiable disponible para programar cuotas."
          : "No queda saldo pendiente por programar en cuotas.";
    const paymentMessage = canRegisterPayment
      ? ""
      : isLockedSale
        ? `La venta esta ${estadoVenta.toLowerCase()} y no admite nuevos pagos.`
        : Number(data.total_cuotas || 0) <= 0
          ? "Primero programa al menos una cuota para registrar pagos."
          : "No hay saldo pendiente de pago.";
    const ventaId = encodeArg(data.id);

    cont.innerHTML = `
      <div class="modal-header-pro">
        <h3>Detalle de Venta</h3>
        <div class="venta-estado-pro estado-${estadoVentaClass}">${h(data.estado_venta || "")}</div>
      </div>

      <div class="modal-body-pro">
        <div class="modal-section-pro">
          <div><strong>Cliente:</strong> ${h(data.cliente || "")}</div>
          <div><strong>Unidad:</strong> ${h(data.unidad || "")}</div>
          <div><strong>Agente:</strong> ${h(data.agente || "")}</div>
        </div>

        <div class="modal-finanzas-pro venta-summary-grid">
          <div class="finance-kpi-card"><span>Precio final</span><strong>S/ ${precio.toLocaleString()}</strong></div>
          <div class="finance-kpi-card"><span>Monto inicial</span><strong>S/ ${Number(data.monto_inicial || 0).toLocaleString()}</strong></div>
          <div class="finance-kpi-card"><span>Saldo financiado</span><strong>S/ ${totalFinanciable.toLocaleString()}</strong></div>
          <div class="finance-kpi-card"><span>Total programado</span><strong>S/ ${totalProgramado.toLocaleString()}</strong></div>
          <div class="finance-kpi-card"><span>Pendiente por programar</span><strong>S/ ${saldoPendienteProgramar.toLocaleString()}</strong></div>
          <div class="finance-kpi-card"><span>Total pagado</span><strong>S/ ${totalPagado.toLocaleString()}</strong></div>
          <div class="finance-kpi-card"><span>Saldo pendiente de pago</span><strong>S/ ${saldoPendientePago.toLocaleString()}</strong></div>
          <div class="finance-kpi-card"><span>Cuotas pendientes</span><strong>${cuotasPendientes}</strong></div>
        </div>

        <div class="barra-progreso-pro" aria-hidden="true">
          <div class="barra-interna-pro" style="width:${porcentaje}%;"></div>
        </div>

        <div class="modal-section-pro">
          <div><strong>Tipo:</strong> ${h(data.tipo_venta || "")}</div>
          <div><strong>Fecha:</strong> ${h(data.fecha_venta || "")}</div>
          <div><strong>Proxima cuota:</strong> ${h(data.proxima_cuota || "No programada")}</div>
          <div><strong>Cuotas vencidas:</strong> ${h(String(data.cuotas_vencidas || 0))}</div>
          <div><strong>Cuotas morosas:</strong> ${h(String(data.cuotas_morosas || 0))}</div>
        </div>

        <hr>

        <div class="quota-toolbar-pro">
          <div>
            <h4>Cuotas</h4>
            <div class="form-note-pro">Revisa la distribucion programada, pagos aplicados y saldo restante antes de registrar cambios.</div>
          </div>
          <div class="quota-toolbar-actions">
            ${canAddQuota
              ? `<button class="btn-outline" onclick="mostrarFormularioCuota(decodeURIComponent('${ventaId}'), 'manual')">Agregar cuota</button>
                 <button class="btn-outline" onclick="mostrarFormularioCuota(decodeURIComponent('${ventaId}'), 'automatico')">Distribucion automatica</button>`
              : `<div class="form-note-pro">${h(quotaMessage)}</div>`}
            ${canRegisterPayment
              ? `<button class="btn-primary" onclick="mostrarPago(decodeURIComponent('${ventaId}'))">Registrar pago</button>`
              : `<div class="form-note-pro">${h(paymentMessage)}</div>`}
          </div>
        </div>
        <div id="listaCuotas"></div>

        <div id="formCuota" class="hidden" style="margin-top:12px;"></div>

      </div>
    `;

    const modal = document.getElementById("ventaModal");
    if (modal) modal.classList.remove("hidden");

    // cargar cuotas
    await window.cargarCuotas(id);

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
  // tambiÃ©n ocultar formulario si estaba abierto
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
    const cuotas = await adminApi({ query: { cuotas_venta: ventaId } });
    const cont = document.getElementById("listaCuotas");
    if (!cont) return;

    if (!Array.isArray(cuotas)) {
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
      const saldoCuota = Number(c.saldo_pendiente || 0).toLocaleString();
      const diasAtraso = Number(c.dias_atraso || 0);
      const cuotaId = c.id || "";
      const cuotaIdEncoded = encodeArg(cuotaId);
      const ventaIdEncoded = encodeArg(ventaId);

      return `
        <div class="cuota-card-pro">
          <div class="cuota-header-pro">
            <strong>Cuota ${h(numero)}</strong>
            <span class="estado-${(estado||'').toLowerCase()}">${h(estado)}</span>
          </div>
          <div>Monto: S/ ${monto}</div>
          <div>Fecha: ${h(fecha)}</div>
          <div>Saldo: S/ ${saldoCuota}</div>
          ${diasAtraso > 0 ? `<div>DÃ­as de atraso: ${diasAtraso}</div>` : ""}
          <div style="margin-top:8px;">
            ${estado === "Pagada"
              ? `<span class="small">Cuota al dÃ­a</span>`
              : `<button class="btn-outline" onclick="mostrarPago(decodeURIComponent('${ventaIdEncoded}'), decodeURIComponent('${cuotaIdEncoded}'))">Registrar Pago</button>`}
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

async function cargarCuotasOptimizado(ventaId) {
  try {
    const cuotas = await adminApi({ query: { cuotas_venta: ventaId } });
    const cont = document.getElementById("listaCuotas");
    if (!cont) return;

    if (!Array.isArray(cuotas)) {
      cont.innerHTML = "<em>Error cargando cuotas.</em>";
      return;
    }

    cuotas.sort((a, b) => Number(a.numero || a.numero_cuota || 0) - Number(b.numero || b.numero_cuota || 0));

    if (!cuotas.length) {
      cont.innerHTML = "<em>No hay cuotas registradas.</em>";
      return;
    }

    cont.innerHTML = `
      <div class="quota-list-pro">
        ${cuotas.map((cuota) => {
          const numero = Number(cuota.numero || cuota.numero_cuota || 0);
          const montoProgramado = Math.max(0, Number(cuota.monto_programado ?? cuota.monto ?? 0));
          const montoPagado = Math.max(0, Number(cuota.monto_pagado || 0));
          const saldoCuota = Math.max(0, Number(cuota.saldo_pendiente ?? Math.max(0, montoProgramado - montoPagado)));
          const fecha = cuota.fecha_vencimiento || cuota.fecha || "";
          const estado = String(cuota.estado_cuota || cuota.estado || "Pendiente");
          const estadoClass = estado.toLowerCase().replace(/\s+/g, "-");
          const diasAtraso = Math.max(0, Number(cuota.dias_atraso || 0));
          const cuotaIdEncoded = encodeArg(cuota.id || "");
          const ventaIdEncoded = encodeArg(ventaId);
          const progress = montoProgramado > 0 ? Math.min(100, Math.round((montoPagado / montoProgramado) * 100)) : 0;
          const helperCopy = estado === "Pagada"
            ? "Cuota liquidada."
            : saldoCuota <= 0
              ? "Sin saldo pendiente."
              : diasAtraso > 0
                ? `${diasAtraso} dias de atraso.`
                : "Cuota vigente.";

          return `
            <article class="cuota-card-pro">
              <div class="cuota-header-pro">
                <div>
                  <strong>Cuota ${h(String(numero || ""))}</strong>
                  <div class="small">Vence: ${h(fecha || "Sin fecha")}</div>
                </div>
                <span class="estado-${estadoClass}">${h(estado)}</span>
              </div>

              <div class="cuota-metrics-grid">
                <div class="cuota-metric">
                  <span>Programado</span>
                  <strong>S/ ${montoProgramado.toLocaleString()}</strong>
                </div>
                <div class="cuota-metric">
                  <span>Pagado</span>
                  <strong>S/ ${montoPagado.toLocaleString()}</strong>
                </div>
                <div class="cuota-metric">
                  <span>Saldo</span>
                  <strong>S/ ${saldoCuota.toLocaleString()}</strong>
                </div>
                <div class="cuota-metric">
                  <span>Avance</span>
                  <strong>${progress}%</strong>
                </div>
              </div>

              <div class="quota-progress-mini" aria-hidden="true">
                <div class="quota-progress-mini-bar" style="width:${progress}%;"></div>
              </div>

              <div class="cuota-footer-pro">
                <span class="small">${h(helperCopy)}</span>
                <div class="quota-card-actions">
                  ${estado === "Pagada"
                    ? `<span class="small">Sin acciones pendientes</span>`
                    : `<button class="btn-outline" onclick="mostrarPago(decodeURIComponent('${ventaIdEncoded}'), decodeURIComponent('${cuotaIdEncoded}'))">Registrar pago</button>`}
                </div>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    `;
  } catch (error) {
    console.error("cargarCuotasOptimizado error:", error);
    const cont = document.getElementById("listaCuotas");
    if (cont) cont.innerHTML = "<em>Error inesperado cargando cuotas.</em>";
  }
}

window.cargarCuotas = cargarCuotasOptimizado;

/**
 * MOSTRAR FORMULARIO AGREGAR CUOTA
 * - reutiliza #formCuota dentro del modal, hace toggle
 */
function mostrarFormularioCuota(ventaId) {
  const form = document.getElementById("formCuota");
  if (!form) return;
  const ventaIdEncoded = encodeArg(ventaId);

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
        <input id="numCuota" type="number" placeholder="NÃºmero cuota" />
        <input id="montoCuota" type="number" placeholder="Monto (S/)" />
      </div>
      <div style="margin-top:8px;">
        <input id="fechaCuota" type="date" />
      </div>
      <div style="margin-top:10px; display:flex; gap:8px;">
        <button class="btn-primary" onclick="crearCuota(decodeURIComponent('${ventaIdEncoded}'))">Guardar Cuota</button>
        <button class="btn-outline" onclick="mostrarFormularioCuota(decodeURIComponent('${ventaIdEncoded}'))">Cancelar</button>
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

    const data = await adminApi({
      method: "POST",
      body: { action: "crear_cuota", venta_id: ventaId, numero, monto, fecha }
    });

    if (!data.success) {
      return alert(data.error || "Error creando cuota");
    }

    // limpiar form y recargar el detalle completo
    const form = document.getElementById("formCuota");
    if (form) { form.innerHTML = ""; form.classList.add("hidden"); form.dataset.open = "0"; }
    await verVenta(ventaId);

  } catch (error) {
    console.error("crearCuota error:", error);
    alert("Error inesperado creando cuota");
  }
}
window.crearCuota = crearCuota;

/**
 * MOSTRAR FORMULARIO PAGO
 * - recibe cuotaId opcional (si quieres mostrar a quÃ© cuota se asocia)
 * - coloca el formulario en #formCuota (reusa)
 */
function mostrarPago(ventaId, cuotaId = "") {
  const form = document.getElementById("formCuota");
  if (!form) return;
  const ventaIdEncoded = encodeArg(ventaId);
  const cuotaIdEncoded = encodeArg(cuotaId);

  // abrir como pago (sobrescribe)
  form.dataset.open = "1";
  form.classList.remove("hidden");

  form.innerHTML = `
    <div class="negociacion-card-pro">
      <h4>Registrar Pago ${cuotaId ? " - Cuota " + h(cuotaId) : ""}</h4>
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
        <button class="btn-primary" onclick="registrarPago(decodeURIComponent('${ventaIdEncoded}'), decodeURIComponent('${cuotaIdEncoded}'))">Guardar Pago</button>
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

    if (!monto || Number(monto) <= 0) return alert("Monto invÃ¡lido");
    if (!fecha) return alert("Selecciona fecha de pago");

    const payload = { action: "registrar_pago", venta_id: ventaId, monto, metodo, fecha_pago: fecha };
    // si se pasÃ³ cuotaId opcional, se deja que backend lo asocie por orden; no es obligatorio.
    if (cuotaId) payload.cuota_id = cuotaId;

    const data = await adminApi({
      method: "PATCH",
      body: payload
    });

    if (!data.success) {
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
  if (s.includes("mora")) return "venta-cancelada";
  if (s.includes("venc")) return "venta-otra";
  if (s.includes("pago")) return "venta-activa";
  if (s.includes("act") || s.includes("proce")) return "venta-activa";
  if (s.includes("pag") || s.includes("cerr")) return "venta-pagada";
  if (s.includes("can")) return "venta-cancelada";
  return "venta-otra";
}
window.getVentaEstadoClass = getVentaEstadoClass;

function getCuotaEstadoClass(estado) {
  if (!estado) return "";
  const s = estado.toLowerCase();
  if (s.includes("pag")) return "cuota-pagada";
  if (s.includes("mora")) return "cuota-otra";
  if (s.includes("venc")) return "cuota-parcial";
  if (s.includes("parc")) return "cuota-parcial";
  if (s.includes("pend")) return "cuota-pendiente";
  return "cuota-otra";
}
window.getCuotaEstadoClass = getCuotaEstadoClass;

/* ---------- DASHBOARD (PRO) ---------- */

let ventasChartInstanceLocal = null;

async function loadDashboard() {
  try {
    const ventas = await adminApi({ query: { ventas: 1 } });

    if (!Array.isArray(ventas)) {
      // si no hay datos, limpia widget
      const kpis = document.getElementById("dashboardKpis");
      if (kpis) kpis.innerHTML = "<p>No hay datos de ventas.</p>";
      return;
    }

    // ordenar cronolÃ³gicamente por fecha_venta (si existe)
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

      // label legible: fecha o Ã­ndice
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

    // GrÃ¡fico: si Chart no estÃ¡ cargado, ignora (evita crash)
    const canvas = document.getElementById("ventasChart");
    if (!canvas) return;

    // destruye instancia previa si existe
    if (ventasChartInstanceLocal && typeof ventasChartInstanceLocal.destroy === "function") {
      ventasChartInstanceLocal.destroy();
      ventasChartInstanceLocal = null;
    }

    // Si Chart.js no estÃ¡ definido, inserta mensaje y retorna
    if (typeof Chart === "undefined") {
      canvas.parentElement.innerHTML = "<p>Chart.js no cargado. AÃ±ade la librerÃ­a para ver el grÃ¡fico.</p>";
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
  if (window.__ADMIN_V2_ENABLED) return;
  // asegurar que los botones de nav llaman showSection con data-nav
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const sec = btn.getAttribute('data-nav');
      showSection(sec, btn);
    });
  });
cargarExtensiones();
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
  // (defer para permitir fetch de librerÃ­as externas)
  setTimeout(() => {
    if (document.getElementById("dashboardKpis")) {
      loadDashboard();
    }
  }, 200);
  loadUnidades();
  const ff = document.getElementById("filtroFase");
const fp = document.getElementById("filtroProyecto");
const fm = document.getElementById("filtroManzana");
const fe = document.getElementById("filtroEstado");
const bl = document.getElementById("buscarLote");

if(fp) fp.addEventListener("change", ()=>{
  actualizarFiltrosDependientes();
  aplicarFiltros();
});

if(ff) ff.addEventListener("change", ()=>{
  actualizarFiltrosDependientes();
  aplicarFiltros();
});

if(fm) fm.addEventListener("change", aplicarFiltros);
if(fe) fe.addEventListener("change", aplicarFiltros);
if(bl) bl.addEventListener("input", aplicarFiltros);
}
async function loadUnidades(){
  const unidades = await adminApi({ query: { unidades: 1 } });

  unidadesCache = unidades;

  llenarFiltros();
aplicarFiltros();

}
function renderUnidades(lista){

  const container = document.getElementById("unidadesContainer");

  container.innerHTML = "";
lista.sort((a,b)=>{
  if(a.manzana === b.manzana){
    return Number(a.lote) - Number(b.lote);
  }
  return a.manzana.localeCompare(b.manzana);
});
  lista.forEach(u => {

    container.innerHTML += `
    <div class="unidad-card estado-${u.estado.toLowerCase()}">

      <h3>Lote ${u.manzana}-${u.lote}</h3>

      <div class="unidad-info">Proyecto: ${u.proyecto}</div>

      Ãrea:
      <input type="number" id="area-${u.id}" value="${u.area || 0}">

      Precio:
      <input type="number" id="precio-${u.id}" value="${u.precio || 0}">

      Estado:
      <select id="estado-${u.id}">
        <option ${u.estado=="Disponible"?"selected":""}>Disponible</option>
        <option ${u.estado=="Reservado"?"selected":""}>Reservado</option>
        <option ${u.estado=="Vendido"?"selected":""}>Vendido</option>
      </select>

      <button onclick="guardarUnidad('${u.id}')">Guardar</button>

    </div>
    `;
  });

}
function llenarFiltros(){

  const
   proyectos = [...new Set(unidadesCache.map(u => u.proyecto))];
  const manzanas = [...new Set(unidadesCache.map(u => u.manzana))];
  const fases = [...new Set(unidadesCache.map(u => u.fase))];

  const filtroFase = document.getElementById("filtroFase");
  const filtroProyecto = document.getElementById("filtroProyecto");
  const filtroManzana = document.getElementById("filtroManzana");

  filtroFase.innerHTML = '<option value="">Todas las fases</option>';

fases.forEach(f=>{
  filtroFase.innerHTML += `<option value="${f}">Fase ${f}</option>`;
});
  filtroProyecto.innerHTML = '<option value="">Todos los proyectos</option>';
  proyectos.forEach(p=>{
    filtroProyecto.innerHTML += `<option value="${p}">${p}</option>`;
  });

  filtroManzana.innerHTML = '<option value="">Todas las manzanas</option>';
  manzanas.forEach(m=>{
    filtroManzana.innerHTML += `<option value="${m}">${m}</option>`;
  });
}
function aplicarFiltros(){

  const fase = document.getElementById("filtroFase").value;
  const proyecto = document.getElementById("filtroProyecto").value;
  const manzana = document.getElementById("filtroManzana").value;
  const estado = document.getElementById("filtroEstado").value;
  const buscar = document.getElementById("buscarLote").value.toLowerCase();

  let resultado = [...unidadesCache];

  if(proyecto){
    resultado = resultado.filter(u => u.proyecto === proyecto);
  }

  if(fase){
    resultado = resultado.filter(u => u.fase == fase);
  }

  if(manzana){
    resultado = resultado.filter(u => u.manzana === manzana);
  }

  if(estado){
    resultado = resultado.filter(u => u.estado === estado);
  }

  if(buscar){
    resultado = resultado.filter(u =>
      `${u.manzana}-${u.lote}`.toLowerCase().includes(buscar)
    );
  }

 const contador = document.getElementById("contadorUnidades");
if(contador){
  contador.innerText = `Mostrando ${resultado.length} unidades`;
}

  renderUnidades(resultado);

}
function actualizarFiltrosDependientes(){

  const proyecto = document.getElementById("filtroProyecto").value;
  const fase = document.getElementById("filtroFase")?.value;

  let lista = unidadesCache;

  if(proyecto){
    lista = lista.filter(u => u.proyecto === proyecto);
  }

  if(fase){
    lista = lista.filter(u => u.fase == fase);
  }

  const manzanas = [...new Set(lista.map(u => u.manzana))];

  const filtroManzana = document.getElementById("filtroManzana");

  filtroManzana.innerHTML = '<option value="">Todas las manzanas</option>';

  manzanas.forEach(m=>{
    filtroManzana.innerHTML += `<option value="${m}">${m}</option>`;
  });

}
async function guardarUnidad(id){

  const precio = document.getElementById(`precio-${id}`).value;
  const area = document.getElementById(`area-${id}`).value;
  const estado = document.getElementById(`estado-${id}`).value;

  const data = await adminApi({
    method:"PATCH",
    body:{
      action:"editar_unidad",
      unidad_id:id,
      precio,
      area,
      estado
    }
  });

  if(!data.success){
    alert("Error actualizando unidad");
    return;
  }

  alert("Unidad actualizada");
loadUnidades();
llenarFiltros();
aplicarFiltros();
renderUnidades(unidadesCache);
}
async function cargarExtensiones() {
const data = await adminApi({ query: { extensiones: 1 } });
const tbody = document.getElementById("extensionesBody");
if (!tbody) return;

AppCore.clearElement(tbody);

data
.filter(ext => ext.estado_extension === "Solicitud")
.forEach(ext => {

const tr = document.createElement("tr");

[
  ext.reserva_id,
  ext.unidad_codigo,
  ext.cliente,
  ext.agente,
  `S/ ${AppCore.safeNumber(ext.monto_adicional).toLocaleString()}`
].forEach((value) => {
  const td = document.createElement("td");
  td.textContent = String(value || "");
  tr.appendChild(td);
});

const voucherCell = document.createElement("td");
const voucherUrl = AppCore.sanitizeUrl(ext.voucher?.[0]?.url);
if (voucherUrl) {
  const link = document.createElement("a");
  link.href = voucherUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Ver";
  voucherCell.appendChild(link);
} else {
  voucherCell.textContent = "-";
}
tr.appendChild(voucherCell);

const actionsCell = document.createElement("td");
const approveButton = document.createElement("button");
approveButton.type = "button";
approveButton.textContent = "Aprobar";
approveButton.addEventListener("click", () => aprobarExtension(ext.id));

const rejectButton = document.createElement("button");
rejectButton.type = "button";
rejectButton.textContent = "Rechazar";
rejectButton.addEventListener("click", () => rechazarExtension(ext.id));

actionsCell.appendChild(approveButton);
actionsCell.appendChild(rejectButton);
tr.appendChild(actionsCell);

tbody.appendChild(tr);

});

}
cargarExtensiones();
async function aprobarExtension(id){

const res = await fetch('/.netlify/functions/airtable',{
method:'PATCH',
headers:{
'Content-Type':'application/json',
'Authorization':`Bearer ${token}`
},
body:JSON.stringify({
action:'aprobar_extension',
extension_id:id
})
});

const data = await res.json();

if(data.success){
alert("ExtensiÃ³n aprobada");
cargarExtensiones();
location.reload();
}else{
alert("Error aprobando");
}

}


async function rechazarExtension(id){

const res = await fetch('/.netlify/functions/airtable',{
method:'PATCH',
headers:{
'Content-Type':'application/json',
'Authorization':`Bearer ${token}`
},
body:JSON.stringify({
action:'rechazar_extension',
extension_id:id
})
});

const data = await res.json();

if(data.success){
alert("ExtensiÃ³n rechazada");
cargarExtensiones();
location.reload();
}else{
alert("Error rechazando");
}

}
// Exponer init y ejecutar cuando DOM estÃ© listo
window.initAdmin = initAdmin;
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAdmin);
} else {
  initAdmin();
}
