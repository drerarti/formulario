// ===============================
// CONFIGURACIÓN
// ===============================

const BASE_ENDPOINT = "https://hook.us2.make.com/zaa725n4fjwmvtrqnknwwbdunbbu5yrr";
const RESERVA_ENDPOINT = "https://hook.us2.make.com/zaa725n4fjwmvtrqnknwwbdunbbu5yrr";

// ===============================
// ELEMENTOS DOM
// ===============================

const form = document.getElementById("reservaForm");
const proyectoSelect = document.getElementById("proyecto");
const manzanaSelect = document.getElementById("manzana");
const unidadSelect = document.getElementById("unidad");
const priceBox = document.getElementById("priceBox");
const precioDisplay = document.getElementById("precioDisplay");
const alertBox = document.getElementById("alertBox");

const contactInput = document.getElementById("contact_id");
const opportunityInput = document.getElementById("opportunity_id");

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
// OBTENER PARAMS DE URL (GHL)
// ===============================

const urlParams = new URLSearchParams(window.location.search);
contactInput.value = urlParams.get("contact") || "";
opportunityInput.value = urlParams.get("opportunity") || "";

// ===============================
// CARGAR PROYECTOS
// ===============================

async function loadProjects() {
  try {
    const res = await fetch(BASE_ENDPOINT);
    const data = await res.json();

    proyectoSelect.innerHTML = '<option value="">Selecciona proyecto</option>';

    const proyectosUnicos = [...new Set(data.map(p => p.proyecto))];

    proyectosUnicos.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = p;
      proyectoSelect.appendChild(opt);
    });

  } catch (error) {
    showAlert("Error cargando proyectos. Verifica conexión con Make.");
    console.error("Error loadProjects:", error);
  }
}

// ===============================
// CAMBIO DE PROYECTO
// ===============================

proyectoSelect.addEventListener("change", async () => {

  manzanaSelect.disabled = false;
  unidadSelect.disabled = true;
  priceBox.classList.add("hidden");

  manzanaSelect.innerHTML = '<option value="">Cargando...</option>';

  try {
    const res = await fetch(`${BASE_ENDPOINT}?project=${proyectoSelect.value}`);
    const data = await res.json();

    manzanaSelect.innerHTML = '<option value="">Selecciona manzana</option>';

    const manzanasUnicas = [...new Set(data.map(m => m.Manzana))];

    manzanasUnicas.forEach(m => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      manzanaSelect.appendChild(opt);
    });

  } catch (error) {
    showAlert("Error cargando manzanas.");
    console.error("Error proyecto change:", error);
  }

});

// ===============================
// CAMBIO DE MANZANA
// ===============================

manzanaSelect.addEventListener("change", async () => {

  unidadSelect.disabled = false;
  priceBox.classList.add("hidden");

  unidadSelect.innerHTML = '<option value="">Cargando...</option>';

  try {
    const res = await fetch(
      `${BASE_ENDPOINT}?project=${proyectoSelect.value}&manzana=${manzanaSelect.value}`
    );

    const data = await res.json();

    unidadSelect.innerHTML = '<option value="">Selecciona unidad</option>';

    data.forEach(u => {
      const opt = document.createElement("option");
      opt.value = u.id;
      opt.dataset.precio = u.precio || 0;
      opt.textContent = `${u.codigo}`;
      unidadSelect.appendChild(opt);
    });

  } catch (error) {
    showAlert("Error cargando unidades.");
    console.error("Error manzana change:", error);
  }

});

// ===============================
// CAMBIO DE UNIDAD
// ===============================

unidadSelect.addEventListener("change", () => {

  const selectedOption = unidadSelect.options[unidadSelect.selectedIndex];

  if (!selectedOption.value) {
    priceBox.classList.add("hidden");
    return;
  }

  const precio = parseFloat(selectedOption.dataset.precio || 0);
  precioDisplay.textContent = formatCurrency(precio);
  priceBox.classList.remove("hidden");

});

// ===============================
// ENVÍO DE FORMULARIO
// ===============================

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideAlert();

  if (!contactInput.value || !opportunityInput.value) {
    showAlert("Faltan parámetros de GoHighLevel.");
    return;
  }

  const formData = new FormData(form);

  const payload = {
    contact_id: contactInput.value,
    opportunity_id: opportunityInput.value,
    unidad_record_id: unidadSelect.value,
    proyecto: proyectoSelect.value,
    manzana: manzanaSelect.value,
    tipo_venta: document.getElementById("tipo_venta").value,
    descuento_solicitado: document.getElementById("descuento").value || 0
  };

  formData.append("payload", JSON.stringify(payload));

  try {
    const res = await fetch(RESERVA_ENDPOINT, {
      method: "POST",
      body: formData
    });

    const result = await res.json();

    if (result.ok) {
      showAlert("Reserva creada correctamente.", "success");
      form.reset();
      priceBox.classList.add("hidden");
    } else {
      showAlert(result.message || "Error creando reserva.");
    }

  } catch (error) {
    showAlert("Error enviando la reserva.");
    console.error("Submit error:", error);
  }

});

// ===============================
// INICIALIZAR
// ===============================

loadProjects();