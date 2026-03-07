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

let agenteNombre = "Desconocido";

try {
  const decoded = parseJwt(token);
  agenteNombre = decoded.nombre;
} catch (err) {
  localStorage.removeItem("auth_token");
  window.location.href = "/login-agente.html";
}
const ENDPOINT = "/.netlify/functions/airtable";

const form = document.getElementById("reservaForm");
const proyectoSelect = document.getElementById("proyecto");
const manzanaSelect = document.getElementById("manzana");
const unidadSelect = document.getElementById("unidad");
const priceBox = document.getElementById("priceBox");
const precioDisplay = document.getElementById("precioDisplay");
const alertBox = document.getElementById("alertBox");

let todasLasUnidades = [];

// ===============================
// UTILIDADES
// ===============================

function showAlert(message, type = "error") {
  alertBox.textContent = message;
  alertBox.className = `alert ${type}`;
  alertBox.classList.remove("hidden");
}

function hideAlert() {
  alertBox.classList.add("hidden");
}

function formatCurrency(value) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN"
  }).format(value || 0);
}

// ===============================
// CARGAR UNIDADES
// ===============================

async function loadData() {
  try {
    const res = await fetch(`${ENDPOINT}?unidades=1`);
    const data = await res.json();

    if (!res.ok || !Array.isArray(data)) {
      showAlert("Error cargando unidades.");
      return;
    }

    todasLasUnidades = data;
    cargarProyectos();
    // ===============================
// AUTOCARGA DESDE PLANO
// ===============================

const params = new URLSearchParams(window.location.search);
const unidadFromURL = params.get("unidad_id");

if (unidadFromURL) {

  const unidadObj = todasLasUnidades.find(
  u => u.codigo === unidadFromURL
);

if (unidadObj) {

  proyectoSelect.value = unidadObj.proyecto;
  proyectoSelect.dispatchEvent(new Event("change"));

  setTimeout(() => {

    manzanaSelect.value = unidadObj.manzana;
    manzanaSelect.dispatchEvent(new Event("change"));

    setTimeout(() => {

      const option = [...unidadSelect.options].find(
        opt => opt.textContent === unidadObj.codigo
      );

      if (option) {
        unidadSelect.value = option.value;
        unidadSelect.dispatchEvent(new Event("change"));
      }

    }, 200);

  }, 200);

}

}
  } catch (error) {
    showAlert("Error conectando con el servidor.");
  }
}
function cargarProyectos() {
  proyectoSelect.innerHTML = '<option value="">Selecciona proyecto</option>';

  const proyectos = [...new Set(
    todasLasUnidades.map(u => u.proyecto).filter(Boolean)
  )];

  proyectos.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = p;
    proyectoSelect.appendChild(opt);
  });
}

proyectoSelect.addEventListener("change", () => {
  manzanaSelect.disabled = false;
  unidadSelect.disabled = true;
  priceBox.classList.add("hidden");

  manzanaSelect.innerHTML = '<option value="">Selecciona manzana</option>';

  const filtradas = todasLasUnidades.filter(
    u => u.proyecto === proyectoSelect.value
  );

  const manzanas = [...new Set(
    filtradas.map(u => u.manzana).filter(Boolean)
  )];

  manzanas.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    manzanaSelect.appendChild(opt);
  });
});

manzanaSelect.addEventListener("change", () => {
  unidadSelect.disabled = false;
  priceBox.classList.add("hidden");

  unidadSelect.innerHTML = '<option value="">Selecciona unidad</option>';

  const filtradas = todasLasUnidades.filter(
  u =>
    u.proyecto === proyectoSelect.value &&
    u.manzana === manzanaSelect.value &&
    u.estado === "Disponible"
);

  filtradas.forEach(u => {

    const opt = document.createElement("option");

    opt.value = u.id;
    opt.dataset.precio = u.precio || 0;
    opt.textContent = u.codigo;
    
    unidadSelect.appendChild(opt);
  });
});

unidadSelect.addEventListener("change", () => {
  const selected = unidadSelect.options[unidadSelect.selectedIndex];
  if (!selected.value) {
    priceBox.classList.add("hidden");
    return;
  }

  const precio = parseFloat(selected.dataset.precio || 0);
  precioDisplay.textContent = formatCurrency(precio);
  priceBox.classList.remove("hidden");
});

// ===============================
// ENVÍO FORMULARIO
// ===============================

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideAlert();

  if (!unidadSelect.value) {
    showAlert("Selecciona una unidad.");
    return;
  }

  try {

    const payload = {
      action: "crear_reserva",  // 🔴 CORRECCIÓN CRÍTICA
      unidad_record_id: unidadSelect.value,
      cliente_actual: document.getElementById("cliente_actual").value.trim(),
      dni_cliente: document.getElementById("dni_cliente").value.trim(),
      telefono_cliente: document.getElementById("telefono_cliente").value.trim(),
      monto_reserva: Number(document.getElementById("monto_reserva").value || 0),
      descuento_solicitado: Number(document.getElementById("descuento").value || 0),
      motivo_descuento: document.getElementById("motivo_descuento").value.trim()
    };

    const token = localStorage.getItem("auth_token");
const res = await fetch(ENDPOINT, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`
  },
  body: JSON.stringify(payload)
});

    const result = await res.json();

    if (!res.ok || !result.success) {
      showAlert(result.error || "Error creando reserva.");
      return;
    }

    const reservaId = result.reserva_id;

    alertBox.className = "alert success";
    alertBox.classList.remove("hidden");

    alertBox.innerHTML = `
      <strong>Reserva creada correctamente</strong><br><br>
      Código de reserva:<br>
      <div style="font-size:18px;font-weight:bold;margin:10px 0;">
        ${reservaId}
      </div>
      <button id="copyBtn" class="btn-secondary">Copiar código</button>

      <a href="https://docs.google.com/forms/d/e/1FAIpQLScvACxsdkB-cIoU5w7Zn1L6MWpDsKISX7FELL01mF74Dih44A/viewform"
         target="_blank"
         class="btn-success">
         Subir documentos
      </a>
    `;

    document.getElementById("copyBtn").addEventListener("click", async () => {
      await navigator.clipboard.writeText(reservaId);
      document.getElementById("copyBtn").textContent = "Copiado ✓";
    });

    form.reset();
    priceBox.classList.add("hidden");
    await loadData();

  } catch (error) {
    showAlert("Error enviando reserva.");
  }
});

loadData();
document.getElementById("infoAgente").innerHTML = `
  Agente: <strong>${agenteNombre}</strong>
  <button onclick="logout()" style="margin-left:10px;">Cerrar sesión</button>
`;

function logout() {
  localStorage.removeItem("auth_token");
  window.location.href = "/login-agente.html";
}