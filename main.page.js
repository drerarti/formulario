const { AppCore } = window;
const session = AppCore.requireSession();

if (!session) {
  throw new Error("Session required");
}

const { decoded } = session;
const params = new URLSearchParams(window.location.search);

const form = document.getElementById("reservaForm");
const proyectoSelect = document.getElementById("proyecto");
const manzanaSelect = document.getElementById("manzana");
const unidadSelect = document.getElementById("unidad");
const priceBox = document.getElementById("priceBox");
const precioDisplay = document.getElementById("precioDisplay");
const alertBox = document.getElementById("alertBox");
const infoAgente = document.getElementById("infoAgente");

const state = {
  unidades: [],
  autoSelectedCode: params.get("unidad_id") || ""
};

function showAlert(message, type = "error") {
  AppCore.clearElement(alertBox);
  alertBox.textContent = message;
  alertBox.className = `alert ${type}`;
  alertBox.classList.remove("hidden");
}

function hideAlert() {
  AppCore.clearElement(alertBox);
  alertBox.className = "alert hidden";
}

function getSelectedUnidad() {
  return state.unidades.find((unidad) => unidad.id === unidadSelect.value) || null;
}

function getFilteredManzanas() {
  return [...new Set(
    state.unidades
      .filter((unidad) => unidad.proyecto === proyectoSelect.value)
      .map((unidad) => unidad.manzana)
      .filter(Boolean)
  )];
}

function getFilteredUnidades() {
  return state.unidades.filter((unidad) =>
    unidad.proyecto === proyectoSelect.value &&
    unidad.manzana === manzanaSelect.value &&
    unidad.estado === "Disponible"
  );
}

function populateProjects() {
  proyectoSelect.innerHTML = '<option value="">Selecciona proyecto</option>';

  const proyectos = [...new Set(
    state.unidades.map((unidad) => unidad.proyecto).filter(Boolean)
  )];

  proyectos.forEach((proyecto) => {
    const option = document.createElement("option");
    option.value = proyecto;
    option.textContent = proyecto;
    proyectoSelect.appendChild(option);
  });
}

function populateManzanas(selectedManzana = "") {
  const manzanas = getFilteredManzanas();
  manzanaSelect.disabled = !proyectoSelect.value;
  manzanaSelect.innerHTML = '<option value="">Selecciona manzana</option>';

  manzanas.forEach((manzana) => {
    const option = document.createElement("option");
    option.value = manzana;
    option.textContent = manzana;
    manzanaSelect.appendChild(option);
  });

  if (selectedManzana && manzanas.includes(selectedManzana)) {
    manzanaSelect.value = selectedManzana;
  }
}

function populateUnidades(selectedUnidadId = "") {
  const unidades = getFilteredUnidades();
  unidadSelect.disabled = !manzanaSelect.value;
  unidadSelect.innerHTML = '<option value="">Selecciona unidad</option>';

  unidades.forEach((unidad) => {
    const option = document.createElement("option");
    option.value = unidad.id;
    option.dataset.precio = String(unidad.precio || 0);
    option.textContent = unidad.codigo;
    unidadSelect.appendChild(option);
  });

  if (selectedUnidadId && unidades.some((unidad) => unidad.id === selectedUnidadId)) {
    unidadSelect.value = selectedUnidadId;
  }

  syncPriceBox();
}

function syncPriceBox() {
  const selectedOption = unidadSelect.options[unidadSelect.selectedIndex];

  if (!selectedOption || !selectedOption.value) {
    priceBox.classList.add("hidden");
    precioDisplay.textContent = "";
    return;
  }

  precioDisplay.textContent = AppCore.formatCurrency(
    AppCore.safeNumber(selectedOption.dataset.precio)
  );
  priceBox.classList.remove("hidden");
}

function hydrateSelectionFromUrl() {
  if (!state.autoSelectedCode) {
    return;
  }

  const selectedUnidad = state.unidades.find((unidad) => unidad.codigo === state.autoSelectedCode);
  if (!selectedUnidad) {
    return;
  }

  proyectoSelect.value = selectedUnidad.proyecto || "";
  populateManzanas(selectedUnidad.manzana || "");
  populateUnidades(selectedUnidad.id);
  state.autoSelectedCode = "";
}

function renderAgentInfo() {
  AppCore.clearElement(infoAgente);
  infoAgente.appendChild(document.createTextNode("Agente: "));

  const strong = document.createElement("strong");
  strong.textContent = decoded.nombre || "Agente";
  infoAgente.appendChild(strong);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "toolbar-btn";
  button.textContent = "Cerrar sesion";
  button.addEventListener("click", () => AppCore.logout());
  infoAgente.appendChild(document.createTextNode(" "));
  infoAgente.appendChild(button);
}

function buildGoogleFormUrl(reservaId, codigoUnidad) {
  const url = new URL(
    "https://docs.google.com/forms/d/e/1FAIpQLScvACxsdkB-cIoU5w7Zn1L6MWpDsKISX7FELL01mF74Dih44A/viewform"
  );
  url.searchParams.set("entry.734153405", reservaId);
  url.searchParams.set("entry.1840987523", codigoUnidad);
  return url.toString();
}

function renderSuccessState(reservaId, codigoUnidad) {
  AppCore.clearElement(alertBox);
  alertBox.className = "alert success";
  alertBox.classList.remove("hidden");

  const title = document.createElement("strong");
  title.textContent = "Reserva creada correctamente";

  const codeLabel = document.createElement("div");
  codeLabel.className = "alert-meta";
  codeLabel.textContent = "Codigo de reserva";

  const codeValue = document.createElement("div");
  codeValue.className = "alert-code";
  codeValue.textContent = reservaId;

  const actions = document.createElement("div");
  actions.className = "alert-actions";

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "btn-secondary";
  copyButton.textContent = "Copiar codigo";
  copyButton.addEventListener("click", async () => {
    await navigator.clipboard.writeText(reservaId);
    copyButton.textContent = "Copiado";
  });

  const uploadLink = document.createElement("a");
  uploadLink.className = "btn-success";
  uploadLink.target = "_blank";
  uploadLink.rel = "noopener noreferrer";
  uploadLink.href = buildGoogleFormUrl(reservaId, codigoUnidad);
  uploadLink.textContent = "Subir documentos";

  actions.appendChild(copyButton);
  actions.appendChild(uploadLink);

  alertBox.appendChild(title);
  alertBox.appendChild(codeLabel);
  alertBox.appendChild(codeValue);
  alertBox.appendChild(actions);
}

function validatePayload(payload) {
  if (!payload.cliente_actual || payload.cliente_actual.length < 3) {
    return "Ingresa el nombre del cliente.";
  }

  if (!payload.dni_cliente || payload.dni_cliente.length < 6 || payload.dni_cliente.length > 20) {
    return "Ingresa un documento valido.";
  }

  if (!payload.telefono_cliente || payload.telefono_cliente.length < 6 || payload.telefono_cliente.length > 20) {
    return "Ingresa un telefono valido.";
  }

  if (payload.monto_reserva <= 0) {
    return "El monto de reserva debe ser mayor a cero.";
  }

  if (payload.descuento_solicitado < 0 || payload.sobreprecio < 0) {
    return "Los montos no pueden ser negativos.";
  }

  return "";
}

async function loadData(options = {}) {
  try {
    state.unidades = await AppCore.getUnidades(options);
    populateProjects();
    hydrateSelectionFromUrl();
  } catch (error) {
    showAlert(AppCore.getErrorMessage(error, "Error cargando unidades."));
  }
}

proyectoSelect.addEventListener("change", () => {
  populateManzanas();
  populateUnidades();
});

manzanaSelect.addEventListener("change", () => {
  populateUnidades();
});

unidadSelect.addEventListener("change", syncPriceBox);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideAlert();

  const selectedUnidad = getSelectedUnidad();
  if (!selectedUnidad) {
    showAlert("Selecciona una unidad.");
    return;
  }

  const payload = {
    action: "crear_reserva",
    unidad_record_id: selectedUnidad.id,
    cliente_actual: document.getElementById("cliente_actual").value.trim(),
    dni_cliente: document.getElementById("dni_cliente").value.trim(),
    telefono_cliente: document.getElementById("telefono_cliente").value.trim(),
    monto_reserva: AppCore.safeNumber(document.getElementById("monto_reserva").value),
    descuento_solicitado: AppCore.safeNumber(document.getElementById("descuento").value),
    sobreprecio: AppCore.safeNumber(document.getElementById("sobreprecio").value),
    motivo_descuento: document.getElementById("motivo_descuento").value.trim()
  };

  const validationError = validatePayload(payload);
  if (validationError) {
    showAlert(validationError);
    return;
  }

  try {
    const result = await AppCore.apiRequest({
      method: "POST",
      body: payload,
      auth: true
    });

    if (!result.success || !result.reserva_id) {
      showAlert(result.error || "No se pudo crear la reserva.");
      return;
    }

    renderSuccessState(result.reserva_id, selectedUnidad.codigo);
    form.reset();
    priceBox.classList.add("hidden");
    AppCore.invalidateUnidadesCache();
    await loadData({ force: true });
  } catch (error) {
    showAlert(AppCore.getErrorMessage(error, "Error enviando la reserva."));
  }
});

renderAgentInfo();
loadData();
