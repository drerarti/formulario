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

const reservasContainer = document.getElementById("reservasContainer");

// ===============================
// CARGAR RESERVAS (VERSIÓN PRO)
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

    data.forEach(r => {

      const div = document.createElement("div");
      div.className = "reserva-card";

      div.innerHTML = `

        <div class="reserva-header-pro">
          <div class="reserva-cliente-pro">
            ${r.cliente}
          </div>
          <div class="reserva-estado-pro estado-${(r.estado || '').toLowerCase()}">
            ${r.estado}
          </div>
        </div>

        <div class="reserva-body-pro">
          <div class="reserva-item">
            <span>Unidad</span>
            <strong>${r.unidad}</strong>
          </div>

          <div class="reserva-item">
            <span>Agente</span>
            <strong>${r.agente}</strong>
          </div>

          <div class="reserva-item">
            <span>Reserva</span>
            <strong>S/ ${Number(r.monto_reserva || 0).toLocaleString()}</strong>
          </div>

          <div class="reserva-item">
            <span>Precio Lista</span>
            <strong>S/ ${Number(r.precio_lista || 0).toLocaleString()}</strong>
          </div>
        </div>

        <div class="reserva-actions-pro">

          ${r.estado === "Solicitud" ? `
            <button class="btn-outline" onclick="validar('${r.id}')">
              Validar
            </button>

            <button class="btn-danger" onclick="rechazar('${r.id}', '${r.unidad_record_id}')">
              Rechazar
            </button>
          ` : ""}

          ${r.estado === "Confirmada" ? `
            <button class="btn-outline" onclick="mostrarNegociacion('${r.id}')">
              Negociar
            </button>

            ${
              r.tipo_venta && Number(r.precio_final) > 0
                ? `<button class="btn-primary" onclick="convertirVenta('${r.id}', this)">
                    Convertir
                  </button>`
                : ""
            }
          ` : ""}

        </div>

        <div id="neg-${r.id}" class="negociacion-container-pro"></div>

      `;

      reservasContainer.appendChild(div);
    });

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
      <textarea id="obs_${id}"></textarea>

      <button class="btn-primary" onclick="guardarNegociacion('${id}')">
        Guardar Negociación
      </button>
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
// CARGAR VENTAS (VERSIÓN PRO)
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

    let totalVendido = 0;
    let totalPendiente = 0;
    let ventasActivas = 0;

    ventas.forEach(v => {
      totalVendido += v.precio_base;
      totalPendiente += v.saldo_restante;
      if (v.estado_venta === "Activa") ventasActivas++;
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
      div.className = "venta-card-pro";

      div.innerHTML = `
        <div class="venta-header-pro">
          <div class="venta-cliente-pro">${v.cliente}</div>
          <div class="venta-estado-pro estado-${(v.estado_venta || '').toLowerCase()}">
            ${v.estado_venta}
          </div>
        </div>

        <div class="venta-body-pro">
          <div><span>Unidad</span><strong>${v.unidad}</strong></div>
          <div><span>Agente</span><strong>${v.agente}</strong></div>
          <div><span>Tipo</span><strong>${v.tipo_venta}</strong></div>
          <div><span>Fecha</span><strong>${v.fecha_venta}</strong></div>
        </div>

        <div class="venta-finanzas-pro">
          <div>
            <span>Precio</span>
            <strong>S/ ${Number(v.precio_base || 0).toLocaleString()}</strong>
          </div>
          <div>
            <span>Cobrado</span>
            <strong class="positivo">
              S/ ${(v.precio_base - v.saldo_restante).toLocaleString()}
            </strong>
          </div>
          <div>
            <span>Pendiente</span>
            <strong class="pendiente">
              S/ ${Number(v.saldo_restante || 0).toLocaleString()}
            </strong>
          </div>
        </div>

        <div class="venta-actions-pro">
          <button class="btn-primary" onclick="verVenta('${v.id}')">
            Gestionar
          </button>
        </div>
      `;

      container.appendChild(div);
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
// VER DETALLE VENTA (MODAL PRO)
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

    const porcentajeCobrado =
      ((data.precio_base - data.saldo_restante) / data.precio_base) * 100;

    cont.innerHTML = `
      <div class="modal-header-pro">
        <h3>Detalle de Venta</h3>
        <div class="venta-estado-pro estado-${(data.estado_venta || '').toLowerCase()}">
          ${data.estado_venta}
        </div>
      </div>

      <div class="modal-body-pro">

        <div class="modal-section-pro">
          <div><strong>Cliente:</strong> ${data.cliente}</div>
          <div><strong>Unidad:</strong> ${data.unidad}</div>
          <div><strong>Agente:</strong> ${data.agente}</div>
        </div>

        <div class="modal-finanzas-pro">
          <div><span>Precio Base</span><strong>S/ ${data.precio_base}</strong></div>
          <div><span>Reserva</span><strong>S/ ${data.monto_reserva}</strong></div>
          <div><span>Monto Inicial</span><strong>S/ ${data.monto_inicial}</strong></div>
          <div><span>Saldo Restante</span><strong>S/ ${data.saldo_restante}</strong></div>
        </div>

        <div class="barra-progreso-pro">
          <div class="barra-interna-pro" style="width:${porcentajeCobrado}%"></div>
        </div>

        <div class="modal-section-pro">
          <div><strong>Tipo:</strong> ${data.tipo_venta}</div>
          <div><strong>Fecha:</strong> ${data.fecha_venta}</div>
        </div>

        <hr>

        <h4>Cuotas</h4>
        <div id="listaCuotas"></div>
        <br>
        <button class="btn-outline" onclick="mostrarFormularioCuota('${data.id}')">
          Agregar Cuota
        </button>
        <div id="formCuota" class="hidden"></div>

      </div>
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
  if (cont) cont.innerHTML = "";
}

// ===============================
// CARGAR CUOTAS (TIMELINE PRO)
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
      <div class="cuota-card-pro">
        <div class="cuota-header-pro">
          <strong>Cuota ${c.numero}</strong>
          <span class="estado-${(c.estado || '').toLowerCase()}">${c.estado}</span>
        </div>
        <div>Monto: S/ ${c.monto}</div>
        <div>Fecha: ${c.fecha}</div>
        <button class="btn-outline" onclick="mostrarPago('${ventaId}')">
          Registrar Pago
        </button>
      </div>
    `).join("");

  } catch (error) {
    const cont = document.getElementById("listaCuotas");
    if (cont) cont.innerHTML = "<em>Error inesperado cargando cuotas.</em>";
  }
}
// ===============================
// DASHBOARD PRO
// ===============================
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

    // Orden cronológico
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

    // Animaciones suaves
    animateValue(
      document.getElementById("kpiTotalVendido"),
      0,
      totalVendido
    );

    animateValue(
      document.getElementById("kpiTotalCobrado"),
      0,
      totalCobrado
    );

    animateValue(
      document.getElementById("kpiTotalPendiente"),
      0,
      totalPendiente
    );

    // ===============================
    // GRÁFICO PRO
    // ===============================
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
            backgroundColor: "rgba(16,185,129,0.08)",
            tension: 0.4,
            fill: true,
            borderWidth: 2,
            pointRadius: 4,
            pointBackgroundColor: "#10b981"
          },
          {
            label: "Cobrado",
            data: cobradoData,
            borderColor: "#3b82f6",
            backgroundColor: "rgba(59,130,246,0.08)",
            tension: 0.4,
            fill: true,
            borderWidth: 2,
            pointRadius: 4,
            pointBackgroundColor: "#3b82f6"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: "#e2e8f0",
              font: {
                size: 12
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              color: "rgba(255,255,255,0.05)"
            },
            ticks: {
              color: "#94a3b8"
            }
          },
          y: {
            grid: {
              color: "rgba(255,255,255,0.05)"
            },
            ticks: {
              color: "#94a3b8"
            }
          }
        }
      }
    });

  } catch (error) {
    console.error("Error cargando dashboard", error);
  }
}