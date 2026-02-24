const PASSWORD = "admin123"; // 🔐 cambia esto luego

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
      Unidad: ${r.unidad}<br>
      Monto: S/ ${r.monto}<br><br>
      <button onclick="validar('${r.id}')">Validar</button>
      <button onclick="rechazar('${r.id}', '${r.unidad_record_id}')">Rechazar</button>
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