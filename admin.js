const PASSWORD = "admin123";

const ENDPOINT = "/.netlify/functions/airtable";

const loginBtn = document.getElementById("loginBtn");
const loginBox = document.getElementById("loginBox");
const adminPanel = document.getElementById("adminPanel");
const reservasContainer = document.getElementById("reservasContainer");

loginBtn.addEventListener("click", () => {
  const input = document.getElementById("adminPassword").value;

  if (input === PASSWORD) {
    loginBox.classList.add("hidden");
    adminPanel.classList.remove("hidden");
    loadReservas();
  } else {
    alert("Contraseña incorrecta");
  }
});

async function loadReservas() {

  const res = await fetch(ENDPOINT + "?admin=1");
  const data = await res.json();

  reservasContainer.innerHTML = "";

  data.forEach(r => {

    const div = document.createElement("div");
    div.style.border = "1px solid #ddd";
    div.style.padding = "15px";
    div.style.marginBottom = "10px";
    div.style.borderRadius = "10px";

    div.innerHTML = `
      <strong>${r.cliente}</strong><br>
      <strong>Unidad:</strong> ${r.unidad}<br>
      <strong>Reserva:</strong> S/ ${r.monto_reserva}<br>
      <strong>Precio Lista:</strong> S/ ${r.precio_lista}<br>
      <strong>Estado:</strong> ${r.estado}<br><br>

      ${r.estado === "Solicitud" ? `
        <button onclick="validar('${r.id}')">Validar</button>
        <button onclick="rechazar('${r.id}', '${r.unidad_record_id}')">Rechazar</button>
      ` : ""}

      ${r.estado === "Confirmada" ? `
        <button onclick="mostrarNegociacion('${r.id}')">Negociar</button>
      ` : ""}

      <div id="neg-${r.id}" style="margin-top:15px;"></div>
    `;

    reservasContainer.appendChild(div);
  });
}

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