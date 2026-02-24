const ENDPOINT = "/.netlify/functions/airtable";

const form = document.getElementById("reservaForm");
const proyectoSelect = document.getElementById("proyecto");
const manzanaSelect = document.getElementById("manzana");
const unidadSelect = document.getElementById("unidad");
const priceBox = document.getElementById("priceBox");
const precioDisplay = document.getElementById("precioDisplay");
const alertBox = document.getElementById("alertBox");

let todasLasUnidades = [];

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
  const res = await fetch(ENDPOINT);
  const data = await res.json();
  todasLasUnidades = data;
  cargarProyectos();
}

function cargarProyectos() {
  proyectoSelect.innerHTML = '<option value="">Selecciona proyecto</option>';
  const proyectos = [...new Set(todasLasUnidades.map(u => u.proyecto).filter(Boolean))];

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

  const manzanas = [...new Set(filtradas.map(u => u.manzana).filter(Boolean))];

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
      u.manzana === manzanaSelect.value
  );

  filtradas.forEach(u => {
    const opt = document.createElement("option");
    opt.value = u.id;
    opt.dataset.precio = u.precio || 0;
    opt.textContent = u.unidad_id;
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

  try {

    const payload = {
      unidad_record_id: unidadSelect.value,
      cliente_actual: document.getElementById("cliente_actual").value,
      dni_cliente: document.getElementById("dni_cliente").value,
      telefono_cliente: document.getElementById("telefono_cliente").value,
      agente: document.getElementById("agente").value,
      monto_reserva: document.getElementById("monto_reserva").value || 0,
      descuento_solicitado: document.getElementById("descuento").value || 0,
      motivo_descuento: document.getElementById("motivo_descuento").value || ""
    };

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await res.json();

    if (result.success) {

      showAlert("Reserva creada correctamente.", "success");

      // AQUÍ puedes redirigir al Google Form
      console.log("ID Reserva:", result.reserva_id);

      form.reset();
      priceBox.classList.add("hidden");
      await loadData();

    } else {
      showAlert(result.error || "Error creando reserva.");
    }

  } catch (error) {
    showAlert("Error enviando reserva.");
    console.error(error);
  }
});

loadData();