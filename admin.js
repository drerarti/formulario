const ENDPOINT = "/.netlify/functions/airtable";

const reservasContainer = document.getElementById("reservasContainer");

// ===============================
// CARGAR RESERVAS
// ===============================
async function loadReservas() {

  const res = await fetch(ENDPOINT + "?admin=1");
  const data = await res.json();

  reservasContainer.innerHTML = "";

  data.forEach(r => {

    const div = document.createElement("div");
    div.className = "reserva-card";

    div.innerHTML = `
      <strong>${r.cliente}</strong><br>
      <strong>Unidad:</strong> ${r.unidad}<br>
      <strong>Agente:</strong> ${r.agente}<br>
      <strong>Reserva:</strong> S/ ${r.monto_reserva}<br>
      <strong>Precio Lista:</strong> S/ ${r.precio_lista}<br>
      <strong>Estado:</strong> ${r.estado}<br><br>

      ${r.estado === "Solicitud" ? `
        <button onclick="validar('${r.id}')">Validar</button>
        <button onclick="rechazar('${r.id}', '${r.unidad_record_id}')">Rechazar</button>
      ` : ""}

      ${r.estado === "Confirmada" ? `
        <button onclick="mostrarNegociacion('${r.id}')">Negociar</button>

        ${
          r.tipo_venta && r.precio_final > 0
            ? `<button onclick="convertirVenta('${r.id}')"
                style="margin-left:10px;background:#10b981;color:white;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;">
                Convertir
              </button>`
            : ""
        }
      ` : ""}

      <div id="neg-${r.id}" style="margin-top:15px;"></div>
    `;

    reservasContainer.appendChild(div);
  });
}

// ===============================
// VALIDAR
// ===============================
async function validar(id) {

  await fetch(ENDPOINT, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "validar",
      reserva_id: id
    })
  });

  loadReservas();
}

// ===============================
// RECHAZAR
// ===============================
async function rechazar(id, unidadId) {

  await fetch(ENDPOINT, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "rechazar",
      reserva_id: id,
      unidad_record_id: unidadId
    })
  });

  loadReservas();
}

// ===============================
// NEGOCIACION
// ===============================
function mostrarNegociacion(id) {

  const cont = document.getElementById(`neg-${id}`);

  cont.innerHTML = `
    <div style="border:1px solid #ccc;padding:15px;border-radius:10px;margin-top:10px;">
      <h4>Negociación</h4>

      <label>Precio Final</label>
      <input type="number" id="precio_final_${id}">

      <label>Tipo Venta</label>
      <select id="tipo_venta_${id}">
        <option value="">Seleccionar</option>
        <option value="contado">Contado</option>
        <option value="financiamiento">Financiamiento</option>
      </select>

      <label>Monto Inicial</label>
      <input type="number" id="monto_inicial_${id}">

      <label>N° Cuotas</label>
      <input type="number" id="numero_cuotas_${id}">

      <label>Fecha Inicio Pagos</label>
      <input type="date" id="fecha_inicio_${id}">

      <label>Observaciones</label>
      <textarea id="obs_${id}"></textarea>

      <button onclick="guardarNegociacion('${id}')">Guardar Negociación</button>
    </div>
  `;
}

async function guardarNegociacion(id) {

  const data = {
    action: "negociacion",
    reserva_id: id,
    precio_final: document.getElementById(`precio_final_${id}`).value,
    tipo_venta: document.getElementById(`tipo_venta_${id}`).value,
    monto_inicial: document.getElementById(`monto_inicial_${id}`).value,
    numero_cuotas: document.getElementById(`numero_cuotas_${id}`).value,
    fecha_inicio_pagos: document.getElementById(`fecha_inicio_${id}`).value,
    observaciones: document.getElementById(`obs_${id}`).value
  };

  await fetch(ENDPOINT, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  loadReservas();
}

// ===============================
// CONVERTIR A VENTA
// ===============================
async function convertirVenta(reservaId) {

  if (!confirm("¿Confirmar conversión a venta?")) return;

  const res = await fetch(ENDPOINT, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "convertir",
      reserva_id: reservaId
    })
  });

  const data = await res.json();

  if (data.success) {
    alert("Venta creada correctamente");
    loadReservas();
    showSection('ventas', document.querySelector('[onclick*="ventas"]'));
  } else {
    alert("Error: " + data.error);
  }
}

// ===============================
// CARGAR VENTAS (CON KPIs)
// ===============================
async function loadVentas() {

  const res = await fetch(`${ENDPOINT}?ventas=1`);
  const ventas = await res.json();

  const container = document.getElementById("ventasContainer");
  container.innerHTML = "";

  let totalVendido = 0;
  let totalPendiente = 0;
  let ventasActivas = 0;

  ventas.forEach(v => {
    totalVendido += v.precio_base;
    totalPendiente += v.saldo_restante;

    if (v.estado_venta === "Activa") {
      ventasActivas++;
    }
  });

  const totalCobrado = totalVendido - totalPendiente;

  container.innerHTML = `
    <div class="kpis-grid">
      <div class="kpi-card">
        <h3>Total Vendido</h3>
        <p>S/ ${totalVendido.toLocaleString()}</p>
      </div>
      <div class="kpi-card">
        <h3>Total Cobrado</h3>
        <p>S/ ${totalCobrado.toLocaleString()}</p>
      </div>
      <div class="kpi-card">
        <h3>Total Pendiente</h3>
        <p>S/ ${totalPendiente.toLocaleString()}</p>
      </div>
      <div class="kpi-card">
        <h3>Ventas Activas</h3>
        <p>${ventasActivas}</p>
      </div>
    </div>
    <hr style="margin:30px 0;">
  `;

  ventas.forEach(v => {

    const div = document.createElement("div");
    div.className = "venta-card";

    div.innerHTML = `
      <strong>${v.cliente}</strong><br>
      <strong>Unidad:</strong> ${v.unidad}<br>
      <strong>Agente:</strong> ${v.agente}<br>
      <strong>Precio:</strong> S/ ${v.precio_base}<br>
      <strong>Reserva:</strong> S/ ${v.monto_reserva}<br>
      <strong>Tipo:</strong> ${v.tipo_venta}<br>
      <strong>Fecha:</strong> ${v.fecha_venta}<br>
      <strong>Estado:</strong> ${v.estado_venta}<br><br>
      <button onclick="verVenta('${v.id}')">Gestionar</button>
    `;

    container.appendChild(div);
  });
}

// ===============================
// CAMBIO DE SECCION
// ===============================
function showSection(sectionId, btn) {

  document.querySelectorAll('.section').forEach(sec => {
    sec.classList.add('hidden');
  });

  document.getElementById(sectionId).classList.remove('hidden');

  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.remove('active');
  });

  if (btn) btn.classList.add('active');

  if (sectionId === "reservas") loadReservas();
  if (sectionId === "ventas") loadVentas();
}
// ===============================
// VER DETALLE VENTA (MODAL)
// ===============================
async function verVenta(id) {

  const res = await fetch(`${ENDPOINT}?venta_id=${id}`);
  const data = await res.json();

  const cont = document.getElementById("modalVentaContenido");

  cont.innerHTML = `
    <h3>Detalle de Venta</h3>
    <hr><br>

    <strong>Cliente:</strong> ${data.cliente}<br>
    <strong>Unidad:</strong> ${data.unidad}<br>
    <strong>Agente:</strong> ${data.agente}<br><br>

    <strong>Precio Base:</strong> S/ ${data.precio_base}<br>
    <strong>Reserva:</strong> S/ ${data.monto_reserva}<br>
    <strong>Monto Inicial:</strong> S/ ${data.monto_inicial}<br>
    <strong>Saldo Restante:</strong> S/ ${data.saldo_restante}<br><br>

    <strong>Tipo:</strong> ${data.tipo_venta}<br>
    <strong>Fecha:</strong> ${data.fecha_venta}<br>
    <strong>Estado:</strong> ${data.estado_venta}<br>
  `;

  document.getElementById("ventaModal").classList.remove("hidden");
}

function cerrarModal() {
  document.getElementById("ventaModal").classList.add("hidden");
}