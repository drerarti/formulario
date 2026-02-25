const ENDPOINT = "/.netlify/functions/airtable";
let ventasChartInstance = null;
function animateValue(element, start, end, duration = 800) {
  let startTime = null;

  function animation(currentTime) {
    if (!startTime) startTime = currentTime;
    const progress = currentTime - startTime;
    const value = Math.min(
      start + (end - start) * (progress / duration),
      end
    );

    element.innerText = "S/ " + Math.floor(value).toLocaleString();

    if (progress < duration) {
      requestAnimationFrame(animation);
    }
  }

  requestAnimationFrame(animation);
}
function getEstadoClass(estado) {
  switch (estado) {
    case "Confirmada":
      return "estado-confirmada";
    case "Solicitud":
      return "estado-solicitud";
    case "Rechazada":
      return "estado-rechazada";
    case "Convertida":
      return "estado-convertida";
    default:
      return "";
  }
}
function getVentaEstadoClass(estado) {
  switch (estado) {
    case "Activa":
      return "venta-activa";
    case "Pagada":
      return "venta-pagada";
    case "Cancelada":
      return "venta-cancelada";
    default:
      return "";
  }
}
const reservasContainer = document.getElementById("reservasContainer");

// ===============================
// CARGAR RESERVAS
// ===============================
async function loadReservas() {

  try {

    const res = await fetch(ENDPOINT + "?admin=1");
    const data = await res.json();

    if (!res.ok || !Array.isArray(data)) {
      reservasContainer.innerHTML = "<p>Error cargando reservas</p>";
      return;
    }

    reservasContainer.innerHTML = "";

    reservasContainer.innerHTML += `
  <div class="reserva-card">
    
    <div class="reserva-header">
      <div class="reserva-cliente">
        ${r.cliente}
      </div>
      <div class="reserva-estado ${getEstadoClass(r.estado_reserva)}">
        ${r.estado_reserva.toUpperCase()}
      </div>
    </div>

    <div class="reserva-body">
      <div><strong>Unidad:</strong> ${r.unidad_codigo || r.unidad}</div>
      <div><strong>Agente:</strong> ${r.agente}</div>
      <div><strong>Reserva:</strong> S/ ${r.reserva_monto}</div>
      <div><strong>Precio Lista:</strong> S/ ${r.precio_lista}</div>
    </div>

    <div class="reserva-actions">
      ${
        r.estado_reserva === "Solicitud"
        ? `
          <button onclick="validar('${r.id}')">Validar</button>
          <button onclick="rechazar('${r.id}','${r.unidad_record_id}')">Rechazar</button>
        `
        : `
          <button onclick="mostrarNegociacion('${r.id}')">Negociar</button>
          <button class="btn-primary" onclick="convertirVenta('${r.id}', this)">Convertir</button>
        `
      }
    </div>

    <div id="neg-${r.id}" class="negociacion-container"></div>

  </div>
`;

  } catch (error) {
    reservasContainer.innerHTML = "<p>Error inesperado cargando reservas</p>";
  }
}

// ===============================
// VALIDAR
// ===============================
async function validar(id) {

  try {

    const res = await fetch(ENDPOINT, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "validar",
        reserva_id: id
      })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      alert(data.error || "Error validando reserva");
      return;
    }

    loadReservas();

  } catch (error) {
    alert("Error inesperado validando");
  }
}

// ===============================
// RECHAZAR
// ===============================
async function rechazar(id, unidadId) {

  try {

    const res = await fetch(ENDPOINT, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "rechazar",
        reserva_id: id,
        unidad_record_id: unidadId
      })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      alert(data.error || "Error rechazando reserva");
      return;
    }

    loadReservas();

  } catch (error) {
    alert("Error inesperado rechazando");
  }
}

// ===============================
// NEGOCIACION
// ===============================
function mostrarNegociacion(id) {

  const cont = document.getElementById(`neg-${id}`);

  if (!cont) return;

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

  try {

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

    const res = await fetch(ENDPOINT, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const response = await res.json();

    if (!res.ok || !response.success) {
      alert(response.error || "Error guardando negociación");
      return;
    }

    loadReservas();

  } catch (error) {
    alert("Error inesperado guardando negociación");
  }
}

// ===============================
// CONVERTIR A VENTA
// ===============================
async function convertirVenta(reservaId, btn) {

  if (!confirm("¿Confirmar conversión a venta?")) return;

  try {

    if (btn) {
      btn.disabled = true;
      btn.innerText = "Procesando...";
    }

    const res = await fetch(ENDPOINT, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "convertir",
        reserva_id: reservaId
      })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      alert(data.error || "Error convirtiendo venta");
      if (btn) {
        btn.disabled = false;
        btn.innerText = "Convertir";
      }
      return;
    }

    alert("Venta creada correctamente");
    loadReservas();
    showSection('ventas', document.querySelector('[onclick*="ventas"]'));

  } catch (error) {
    alert("Error inesperado convirtiendo");
  }
}

// ===============================
// CARGAR VENTAS (CON KPIs)
// ===============================
async function loadVentas() {

  try {

    const res = await fetch(`${ENDPOINT}?ventas=1`);
    const ventas = await res.json();

    if (!res.ok || !Array.isArray(ventas)) {
      document.getElementById("ventasContainer").innerHTML = "<p>Error cargando ventas</p>";
      return;
    }

    const container = document.getElementById("ventasContainer");
    container.innerHTML = "";

    ventas.forEach(v => {

      container.innerHTML += `
        <div class="venta-card">

          <div class="venta-header">
            <div class="venta-cliente">${v.cliente}</div>
            <div class="venta-estado ${getVentaEstadoClass(v.estado_venta)}">
              ${v.estado_venta.toUpperCase()}
            </div>
          </div>

          <div class="venta-body">
            <div><strong>Unidad:</strong> ${v.unidad_codigo || v.unidad}</div>
            <div><strong>Agente:</strong> ${v.agente}</div>
            <div><strong>Tipo:</strong> ${v.tipo_venta}</div>
            <div><strong>Fecha:</strong> ${v.fecha_venta}</div>
          </div>

          <div class="venta-finanzas">
            <div class="finanza-item">
              <span>Precio</span>
              <strong>S/ ${v.precio_base}</strong>
            </div>
            <div class="finanza-item">
              <span>Cobrado</span>
              <strong class="positivo">
                S/ ${v.precio_base - v.saldo_restante}
              </strong>
            </div>
            <div class="finanza-item">
              <span>Pendiente</span>
              <strong class="pendiente">
                S/ ${v.saldo_restante}
              </strong>
            </div>
          </div>

          <div class="venta-actions">
            <button class="btn-primary" onclick="verVenta('${v.id}')">
              Gestionar
            </button>
          </div>

        </div>
      `;
    });

  } catch (error) {
    document.getElementById("ventasContainer").innerHTML = "<p>Error inesperado cargando ventas</p>";
  }
}

// ===============================
// CAMBIO DE SECCION
// ===============================
function showSection(sectionId, btn) {

  document.querySelectorAll('.section').forEach(sec => {
    sec.classList.add('hidden');
  });

  const section = document.getElementById(sectionId);
  if (section) section.classList.remove('hidden');

  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.remove('active');
  });

  if (btn) btn.classList.add('active');

  if (sectionId === "reservas") loadReservas();
  if (sectionId === "ventas") loadVentas();
  if (sectionId === "dashboard") loadDashboard();
}
// ===============================
// VER DETALLE VENTA (MODAL)
// ===============================
async function verVenta(id) {

  try {

    const res = await fetch(`${ENDPOINT}?venta_id=${id}`);
    const data = await res.json();

    if (!res.ok || !data.id) {
      alert(data.error || "Error cargando venta");
      return;
    }

    const cont = document.getElementById("modalVentaContenido");
    if (!cont) return;

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
      <br><hr><br>

      <h4>Cuotas</h4>
      <div id="listaCuotas"></div>
      <br>
      <button onclick="mostrarFormularioCuota('${data.id}')">Agregar Cuota</button>
      <div id="formCuota" class="hidden"></div>
    `;

    document.getElementById("ventaModal").classList.remove("hidden");

    await cargarCuotas(id);

  } catch (error) {
    alert("Error inesperado cargando detalle");
  }
}

function cerrarModal() {
  const modal = document.getElementById("ventaModal");
  const cont = document.getElementById("modalVentaContenido");

  if (modal) modal.classList.add("hidden");
  if (cont) cont.innerHTML = ""; // limpieza real
}

// ===============================
// CARGAR CUOTAS
// ===============================
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

    if (!cuotas.length) {
      cont.innerHTML = "<em>No hay cuotas registradas.</em>";
      return;
    }

    cont.innerHTML = cuotas.map(c => `
      <div style="margin-bottom:10px; padding:8px; border:1px solid #1e293b; border-radius:8px;">
        <strong>Cuota ${c.numero}</strong><br>
        Monto: S/ ${c.monto}<br>
        Fecha: ${c.fecha}<br>
        Estado: ${c.estado}<br><br>
        <button onclick="mostrarPago('${ventaId}')">Registrar Pago</button>
      </div>
    `).join("");

  } catch (error) {
    const cont = document.getElementById("listaCuotas");
    if (cont) cont.innerHTML = "<em>Error inesperado cargando cuotas.</em>";
  }
}

// ===============================
// MOSTRAR FORMULARIO CUOTA
// ===============================
function mostrarFormularioCuota(ventaId) {

  const form = document.getElementById("formCuota");
  if (!form) return;

  form.innerHTML = `
    <br>
    <input type="number" id="numCuota" placeholder="Número cuota"><br><br>
    <input type="number" id="montoCuota" placeholder="Monto"><br><br>
    <input type="date" id="fechaCuota"><br><br>
    <button onclick="crearCuota('${ventaId}')">Guardar Cuota</button>
  `;

  form.classList.remove("hidden");
}

// ===============================
// CREAR CUOTA
// ===============================
async function crearCuota(ventaId) {

  try {

    const numero = document.getElementById("numCuota")?.value;
    const monto = document.getElementById("montoCuota")?.value;
    const fecha = document.getElementById("fechaCuota")?.value;

    if (!numero || !monto || !fecha) {
      alert("Completa todos los campos");
      return;
    }

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "crear_cuota",
        venta_id: ventaId,
        numero,
        monto,
        fecha
      })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      alert(data.error || "Error creando cuota");
      return;
    }

    document.getElementById("numCuota").value = "";
    document.getElementById("montoCuota").value = "";
    document.getElementById("fechaCuota").value = "";

    document.getElementById("formCuota").classList.add("hidden");

    await cargarCuotas(ventaId);

  } catch (error) {
    alert("Error inesperado creando cuota");
  }
}

// ===============================
// MOSTRAR FORMULARIO PAGO
// ===============================
function mostrarPago(ventaId) {

  const cont = document.getElementById("formCuota");
  if (!cont) return;

  cont.innerHTML = `
    <br>
    <input type="number" id="montoPago" placeholder="Monto"><br><br>
    <select id="metodoPago">
      <option value="Efectivo">Efectivo</option>
      <option value="Transferencia">Transferencia</option>
      <option value="Yape">Yape</option>
      <option value="Otro">Otro</option>
    </select><br><br>
    <input type="date" id="fechaPago"><br><br>
    <button onclick="registrarPago('${ventaId}')">Guardar Pago</button>
  `;

  cont.classList.remove("hidden");
}

// ===============================
// REGISTRAR PAGO
// ===============================
async function registrarPago(ventaId) {

  try {

    const monto = document.getElementById("montoPago")?.value;
    const metodo = document.getElementById("metodoPago")?.value;
    const fecha = document.getElementById("fechaPago")?.value;

    if (!monto || Number(monto) <= 0) {
      alert("Monto inválido");
      return;
    }

    if (!fecha) {
      alert("Selecciona fecha de pago");
      return;
    }

    const res = await fetch(ENDPOINT, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "registrar_pago",
        venta_id: ventaId,
        monto,
        metodo,
        fecha_pago: fecha
      })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      alert(data.error || "Error registrando pago");
      return;
    }

    cerrarModal();
    await verVenta(ventaId);

  } catch (error) {
    alert("Error inesperado registrando pago");
  }
}
async function loadDashboard() {
  try {

    const res = await fetch(`${ENDPOINT}?ventas=1`);
    const ventas = await res.json();

    if (!res.ok || !Array.isArray(ventas)) return;

    let totalVendido = 0;
    let totalPendiente = 0;
    let ventasActivas = 0;
    let ventasPagadas = 0;

    const labels = [];
    const ventasData = [];
    const cobradoData = [];
ventas.sort((a, b) =>
  new Date(a.fecha_venta || 0) - new Date(b.fecha_venta || 0)
);

let acumuladoVentas = 0;
let acumuladoCobrado = 0;

ventas.forEach(v => {

  totalVendido += v.precio_base;
  totalPendiente += v.saldo_restante;

  if (v.estado_venta === "Activa") ventasActivas++;
  if (v.estado_venta === "Pagada") ventasPagadas++;

  acumuladoVentas += v.precio_base;
  acumuladoCobrado += (v.precio_base - v.saldo_restante);

  labels.push(v.fecha_venta);
  ventasData.push(acumuladoVentas);
  cobradoData.push(acumuladoCobrado);
});

    const totalCobrado = totalVendido - totalPendiente;

    const kpis = document.getElementById("dashboardKpis");

    kpis.innerHTML = `
      <div class="kpi-card-pro">
        <div class="kpi-title">Total Vendido</div>
        <div class="kpi-value" id="kpiTotalVendido">S/ ${totalVendido.toLocaleString()}</div>
      </div>
      <div class="kpi-card-pro">
        <div class="kpi-title">Total Cobrado</div>
        <div class="kpi-value" id="kpiTotalCobrado">S/ ${totalCobrado.toLocaleString()}</div>
      </div>
      <div class="kpi-card-pro">
        <div class="kpi-title">Total Pendiente</div>
        <div class="kpi-value" id="kpiTotalPendiente">S/ ${totalPendiente.toLocaleString()}</div>
      </div>
      <div class="kpi-card-pro">
        <div class="kpi-title">Ventas Activas</div>
        <div class="kpi-value" id="kpiTotalActivas">${ventasActivas}</div>
      </div>
      <div class="kpi-card-pro">
        <div class="kpi-title">Ventas Pagadas</div>
        <div class="kpi-value" id="kpiTotalPagadas">${ventasPagadas}</div>
      </div>
    `;
animateValue(document.getElementById("kpiTotalVendido"), 0, totalVendido);
animateValue(document.getElementById("kpiTotalCobrado"), 0, totalCobrado);
animateValue(document.getElementById("kpiTotalPendiente"), 0, totalPendiente);
    const ctx = document.getElementById("ventasChart").getContext("2d");

    if (ventasChartInstance) {
  ventasChartInstance.destroy();
}

ventasChartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Ventas",
            data: ventasData,
            borderColor: "#10b981",
            backgroundColor: "rgba(16,185,129,0.1)",
            tension: 0.4,
            fill: true
          },
          {
            label: "Cobrado",
            data: cobradoData,
            borderColor: "#3b82f6",
            backgroundColor: "rgba(59,130,246,0.1)",
            tension: 0.4,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            labels: {
              color: "#e2e8f0"
            }
          }
        },
        scales: {
          x: {
            ticks: { color: "#94a3b8" }
          },
          y: {
            ticks: { color: "#94a3b8" }
          }
        }
      }
    });

  } catch (error) {
    console.error("Error cargando dashboard", error);
  }
}