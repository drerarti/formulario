const { AppCore } = window;
const session = AppCore.requireSession();

if (!session) {
  throw new Error("Session required");
}

if (session.decoded.rol === "admin") {
  window.location.href = "/admin.html";
}

const mainContent = document.getElementById("viewContainer");
const heroTitle = document.getElementById("heroTitle");
const heroSubtitle = document.getElementById("heroSubtitle");
const agentNameEl = document.getElementById("agentName");
const loader = document.getElementById("globalLoader");
const kpiReservas = document.getElementById("kpiReservas");
const kpiVentas = document.getElementById("kpiVentas");
const kpiComisionProyectada = document.getElementById("kpiComisionProyectada");
const kpiComisionDisponible = document.getElementById("kpiComisionDisponible");
const badgeReservas = document.getElementById("badgeReservas");
const kpiCards = Array.from(document.querySelectorAll(".kpi-card"));

const state = {
  currentView: "inicio",
  unidadesById: new Map(),
  unidadesByCode: new Map()
};

const ICONS = {
  plus:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9"/></svg>',
  map:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18 3.8 20.2a.6.6 0 0 1-.8-.56V6.4a.6.6 0 0 1 .37-.55L9 3.5l6 2 5.2-2.2a.6.6 0 0 1 .8.56v13.24a.6.6 0 0 1-.37.55L15 20.5l-6-2Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.7"/><path d="M9 3.5v14.5M15 5.5v15" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.7"/></svg>',
  reserve:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h7.5L20 9.5V20H7z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.7"/><path d="M14.5 4V9.5H20M9.5 13h8M9.5 16.5h5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>',
  wallet:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H19a1 1 0 0 1 1 1v3.5M4 8.5v8A2.5 2.5 0 0 0 6.5 19H19a1 1 0 0 0 1-1v-7.5H6.5A2.5 2.5 0 0 1 4 8.5Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.7"/><circle cx="16.5" cy="14.5" r="1" fill="currentColor"/></svg>',
  home:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V20h-5.2v-5.5H9.2V20H4z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.8"/></svg>',
  document:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h7.5L20 9v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 6 20V5A1.5 1.5 0 0 1 7.5 3.5Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.7"/><path d="M14.5 3.5V9H20M9.2 13.2h5.8M9.2 16.7h5.8" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>',
  chart:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19.5V5m0 14.5h14" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"/><path d="m8.5 16 3-4 3 2 3.5-5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>',
  print:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9V4h10v5M7 18h10v2H7zm-1 0H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-1" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.7"/><circle cx="17.5" cy="12.5" r=".8" fill="currentColor"/></svg>'
};

agentNameEl.textContent = session.decoded.nombre || "Agente";
heroTitle.textContent = `Hola, ${(session.decoded.nombre || "Agente").split(" ")[0]}`;

function createIcon(name, className = "ui-icon") {
  const icon = document.createElement("span");
  icon.className = className;
  icon.innerHTML = ICONS[name] || ICONS.document;
  return icon;
}

function formatShortDate(value) {
  if (!value) return "Fecha no disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium"
  }).format(date);
}

function goToReservaDetail(reservaId) {
  window.location.href = `/ver-reserva.html?id=${encodeURIComponent(reservaId)}`;
}

function showLoader() {
  loader.classList.remove("hidden");
}

function hideLoader() {
  loader.classList.add("hidden");
}

function cacheUnidades(unidades) {
  state.unidadesById.clear();
  state.unidadesByCode.clear();

  unidades.forEach((unidad) => {
    state.unidadesById.set(unidad.id, unidad);
    state.unidadesByCode.set(unidad.codigo, unidad);
  });
}

async function ensureUnidades(options = {}) {
  const unidades = await AppCore.getUnidades(options);
  if (!state.unidadesById.size || options.force) {
    cacheUnidades(unidades);
  }
  return unidades;
}

function getUnidadData(value) {
  return state.unidadesById.get(value) || state.unidadesByCode.get(value) || null;
}

function createSectionCard(title, text, className = "") {
  const card = document.createElement("div");
  card.className = `section-card ${className}`.trim();

  const heading = document.createElement("h2");
  heading.textContent = title;
  card.appendChild(heading);

  if (text) {
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    card.appendChild(paragraph);
  }

  return card;
}

function createActionButton({ className = "", icon, title, subtitle, onClick }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `action-card ${className}`.trim();
  button.addEventListener("click", onClick);

  const iconBlock = document.createElement("div");
  iconBlock.className = "action-icon";
  iconBlock.appendChild(createIcon(icon, "action-icon-svg"));

  const titleBlock = document.createElement("div");
  titleBlock.className = "action-title";
  titleBlock.textContent = title;

  const subtitleBlock = document.createElement("div");
  subtitleBlock.className = "action-sub";
  subtitleBlock.textContent = subtitle;

  button.appendChild(iconBlock);
  button.appendChild(titleBlock);
  button.appendChild(subtitleBlock);

  return button;
}

function createFieldRow(label, value, className = "") {
  const row = document.createElement("div");
  if (className) {
    row.className = className;
  }
  row.textContent = `${label}: ${value}`;
  return row;
}

function createStatusBadge(status) {
  const meta = AppCore.getReservationStatusMeta(status);
  const badge = document.createElement("span");
  badge.className = `status-pill tone-${meta.tone}`;
  badge.textContent = meta.label;
  badge.title = meta.description;
  return badge;
}

function createExtensionBadge(text, className) {
  const badge = document.createElement("div");
  badge.className = `estado-extension ${className}`;
  badge.textContent = text;
  return badge;
}

function createSkeletonLine(widthClass = "") {
  const line = document.createElement("span");
  line.className = `skeleton-line ${widthClass}`.trim();
  return line;
}

function createSkeletonCard(lines = ["w-70", "w-100", "w-85", "w-55"]) {
  const card = document.createElement("div");
  card.className = "section-card skeleton-card";

  lines.forEach((widthClass) => {
    card.appendChild(createSkeletonLine(widthClass));
  });

  return card;
}

function renderViewSkeleton(viewName) {
  const fragment = document.createDocumentFragment();
  fragment.appendChild(createSkeletonCard(["w-35", "w-80"]));

  const count = viewName === "inicio" ? 4 : 3;
  for (let index = 0; index < count; index += 1) {
    fragment.appendChild(createSkeletonCard());
  }

  return fragment;
}

function getExtensionTimestamp(extension) {
  const raw = extension?.created_at || extension?.createdTime || "";
  const stamp = new Date(raw).getTime();
  return Number.isFinite(stamp) ? stamp : 0;
}

function getCurrentExtensionByReservation(extensiones = []) {
  const grouped = new Map();
  const normalizeStatus = (value) => String(value || "").trim().toLowerCase();

  (Array.isArray(extensiones) ? extensiones : []).forEach((extension) => {
    const reservaKey = extension?.reserva_record_id || extension?.reserva_id || "";
    if (!reservaKey) return;
    if (!grouped.has(reservaKey)) {
      grouped.set(reservaKey, []);
    }
    grouped.get(reservaKey).push(extension);
  });

  const selection = new Map();

  grouped.forEach((items, reservaKey) => {
    const sorted = [...items].sort((left, right) => getExtensionTimestamp(right) - getExtensionTimestamp(left));
    const approved = sorted.find((item) => normalizeStatus(item.estado_extension) === "aprobada");
    const pending = sorted.find((item) => normalizeStatus(item.estado_extension) === "solicitud");
    selection.set(reservaKey, approved || pending || sorted[0] || null);
  });

  return selection;
}

function buildReservaCard(reserva, extension) {
  const unidadData = getUnidadData(reserva.unidad);
  const unidadCodigo = unidadData ? unidadData.codigo : reserva.unidad || "";
  const precioLista = unidadData ? unidadData.precio : reserva.precio_lista || 0;
  const ubicacion = [
    unidadData?.proyecto,
    unidadData?.fase,
    unidadData?.manzana ? `Mz. ${unidadData.manzana}` : "",
    unidadData?.lote ? `Lt. ${unidadData.lote}` : ""
  ].filter(Boolean).join(" / ");
  const deadlineDate = reserva.fecha_vigencia_fin || reserva.fecha_limite_confirmacion || "";
  const deadlineLabel = reserva.deadline_type === "confirmacion"
    ? "Confirmación"
    : reserva.deadline_type === "extension"
      ? "Extensión"
      : reserva.deadline_type === "negociacion"
        ? "Negociación"
        : "Vigencia";
  const deadlineText = deadlineDate ? `${deadlineLabel}: ${formatShortDate(deadlineDate)}` : "Sin plazo activo";
  const daysRemaining = Number.isFinite(Number(reserva.dias_restantes)) ? Number(reserva.dias_restantes) : null;

  const card = document.createElement("div");
  card.className = "reserva-card";

  const header = document.createElement("div");
  header.className = "reserva-header";

  const heading = document.createElement("div");
  heading.className = "reserva-heading";

  const eyebrow = document.createElement("div");
  eyebrow.className = "reserva-eyebrow";
  eyebrow.textContent = unidadCodigo || "Reserva";

  const strong = document.createElement("strong");
  strong.textContent = reserva.cliente || "Cliente no disponible";

  heading.appendChild(eyebrow);
  heading.appendChild(strong);
  header.appendChild(heading);
  header.appendChild(createStatusBadge(reserva.estado));

  const body = document.createElement("div");
  body.className = "reserva-body";

  if (ubicacion) {
    const summary = document.createElement("div");
    summary.className = "reserva-summary";
    summary.textContent = ubicacion;
    body.appendChild(summary);
  }

  body.appendChild(createFieldRow("Unidad", unidadCodigo || "No disponible", "field-row"));
  if (ubicacion) {
    body.appendChild(createFieldRow("Ubicación", ubicacion, "field-row"));
  }
  body.appendChild(createFieldRow("Fecha", formatShortDate(reserva.fecha_inicio), "field-row"));
  body.appendChild(createFieldRow("Monto", AppCore.formatCurrency(reserva.monto), "field-row"));
  body.appendChild(createFieldRow("Precio Lista", AppCore.formatCurrency(precioLista), "field-row"));
  body.appendChild(createFieldRow("Plazo", deadlineText, "field-row"));
  if (daysRemaining !== null) {
    body.appendChild(createFieldRow(
      "Seguimiento",
      daysRemaining < 0
        ? `Vencida hace ${Math.abs(daysRemaining)} día(s)`
        : daysRemaining === 0
          ? "Vence hoy"
          : `${daysRemaining} día(s) restantes`,
      "field-row"
    ));
  }
  body.appendChild(
    createFieldRow(
      "Descuento",
      `S/ ${AppCore.safeNumber(reserva.descuento_solicitado).toLocaleString()}`,
      "field-row"
    )
  );
  body.appendChild(
    createFieldRow(
      "Sobreprecio",
      `S/ ${AppCore.safeNumber(reserva.sobreprecio).toLocaleString()}`,
      "field-row"
    )
  );

  if (reserva.motivo_descuento) {
    const motivo = document.createElement("div");
    motivo.className = "motivo";
    motivo.textContent = `Motivo: ${reserva.motivo_descuento}`;
    body.appendChild(motivo);
  }

  card.appendChild(header);
  card.appendChild(body);

  const actions = document.createElement("div");
  actions.className = "card-actions-row";

  const viewButton = document.createElement("button");
  viewButton.type = "button";
  viewButton.className = "card-action-btn primary";
  viewButton.appendChild(createIcon("document", "card-action-icon"));
  const viewLabel = document.createElement("span");
  viewLabel.textContent = "Ver reserva";
  viewButton.appendChild(viewLabel);
  viewButton.addEventListener("click", () => goToReservaDetail(reserva.id));
  actions.appendChild(viewButton);

  if (reserva.puede_extender && !extension) {
    const extensionBox = document.createElement("div");
    extensionBox.className = "extension-box";

    const link = document.createElement("a");
    link.className = "btn-extender";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.href =
      "https://docs.google.com/forms/d/e/1FAIpQLSdeT3daEJYT_NPJLi7_fpXlQ-tr5LmD7gA8Wo31FJXsPYgYYg/viewform" +
      `?entry.572852460=${encodeURIComponent(reserva.id)}` +
      `&entry.362255831=${encodeURIComponent(unidadCodigo)}` +
      `&entry.847575580=${encodeURIComponent(reserva.deposito_extension_requerido || 2500)}`;
    link.textContent = "Solicitar extensión";

    extensionBox.appendChild(link);
    actions.appendChild(extensionBox);
  }

  card.appendChild(actions);

  if (extension) {
    if (extension.estado_extension === "Solicitud") {
      card.appendChild(createExtensionBadge(
        extension.deposito_cumplido
          ? "Extensión pendiente con depósito validado"
          : "Extensión pendiente de depósito válido",
        "pendiente"
      ));
    } else if (extension.estado_extension === "Aprobada") {
      card.appendChild(createExtensionBadge("Extensión aprobada", "aprobada"));
    } else if (extension.estado_extension === "Rechazada") {
      card.appendChild(createExtensionBadge("Extensión rechazada", "rechazada"));
    }
  } else if (reserva.extension_usada) {
    card.appendChild(createExtensionBadge("Extensión ya utilizada", "aprobada"));
  }

  return card;
}
function buildVentaCard(venta) {
  const financiado = Math.max(
    0,
    AppCore.safeNumber(venta.precio_base) - AppCore.safeNumber(venta.monto_reserva) - AppCore.safeNumber(venta.monto_inicial)
  );
  const totalPagado = AppCore.safeNumber(venta.total_pagado);
  const avance = financiado > 0 ? Math.min(100, Math.round((totalPagado / financiado) * 100)) : 0;
  const card = document.createElement("div");
  card.className = "reserva-card";

  const header = document.createElement("div");
  header.className = "reserva-header";

  const heading = document.createElement("div");
  heading.className = "reserva-heading";

  const eyebrow = document.createElement("div");
  eyebrow.className = "reserva-eyebrow";
  eyebrow.textContent = venta.unidad || "Venta";

  const strong = document.createElement("strong");
  strong.textContent = venta.cliente || "Cliente no disponible";
  heading.appendChild(eyebrow);
  heading.appendChild(strong);
  header.appendChild(heading);
  header.appendChild(createStatusBadge(venta.estado));

  const body = document.createElement("div");
  body.className = "reserva-body";
  body.appendChild(createFieldRow("Unidad", venta.unidad || "No disponible", "field-row"));
  body.appendChild(createFieldRow("Precio", AppCore.formatCurrency(venta.precio_base), "field-row"));
  body.appendChild(createFieldRow("Saldo", AppCore.formatCurrency(venta.saldo_restante), "field-row"));
  body.appendChild(createFieldRow("Cobrado", AppCore.formatCurrency(totalPagado), "field-row"));
  if (venta.proxima_cuota) {
    body.appendChild(createFieldRow("Proxima cuota", formatShortDate(venta.proxima_cuota), "field-row"));
  }
  if (avance > 0) {
    body.appendChild(createFieldRow("Avance", `${avance}%`, "field-row"));
  }

  card.appendChild(header);
  card.appendChild(body);

  return card;
}

async function renderInicio() {
  const fragment = document.createDocumentFragment();
  fragment.appendChild(
    createSectionCard("Centro Operativo", "Accesos rapidos a tus herramientas principales.")
  );

  const actions = document.createElement("div");
  actions.className = "quick-actions";
  actions.appendChild(
    createActionButton({
      className: "primary",
      icon: "plus",
      title: "Nueva Reserva",
      subtitle: "Registrar cliente y unidad",
      onClick: () => {
        window.location.href = "/index.html";
      }
    })
  );
  actions.appendChild(
    createActionButton({
      icon: "map",
      title: "Ver Plano",
      subtitle: "Explorar disponibilidad",
      onClick: () => {
        window.location.href = "/plano-test.html?proyecto=ALP&fase=F2";
      }
    })
  );
  actions.appendChild(
    createActionButton({
      icon: "reserve",
      title: "Mis Reservas",
      subtitle: "Seguimiento activo",
      onClick: () => setView("reservas")
    })
  );
  actions.appendChild(
    createActionButton({
      icon: "wallet",
      title: "Comisiones",
      subtitle: "Estado financiero",
      onClick: () => setView("comisiones")
    })
  );

  fragment.appendChild(actions);
  return fragment;
}

async function renderReservas() {
  const [reservas, extensiones, unidades] = await Promise.all([
    AppCore.apiRequest({
      query: { mis_reservas: 1 },
      auth: true
    }),
    AppCore.apiRequest({
      query: { extensiones: 1 },
      auth: true
    }),
    ensureUnidades()
  ]);

  cacheUnidades(unidades);
  const activeExtensions = getCurrentExtensionByReservation(extensiones);

  const fragment = document.createDocumentFragment();
  fragment.appendChild(createSectionCard("Mis Reservas"));

  if (!Array.isArray(reservas) || !reservas.length) {
    fragment.appendChild(
      createSectionCard("Mis Reservas", "No tienes reservas registradas.")
    );
    return fragment;
  }

  reservas.forEach((reserva) => {
    const extension = activeExtensions.get(reserva.id) || null;

    fragment.appendChild(buildReservaCard(reserva, extension || null));
  });

  return fragment;
}

async function renderVentas() {
  const ventas = await AppCore.apiRequest({
    query: { mis_ventas: 1 },
    auth: true
  });

  const fragment = document.createDocumentFragment();
  fragment.appendChild(createSectionCard("Mis Ventas"));

  if (!Array.isArray(ventas) || !ventas.length) {
    fragment.appendChild(
      createSectionCard("Mis Ventas", "No tienes ventas registradas.")
    );
    return fragment;
  }

  ventas.forEach((venta) => {
    fragment.appendChild(buildVentaCard(venta));
  });

  return fragment;
}

async function renderComisiones() {
  return createSectionCard(
    "Comisiones",
    "Las comisiones se habilitaran cuando la venta este completamente pagada."
  );
}

const views = {
  inicio: renderInicio,
  reservas: renderReservas,
  ventas: renderVentas,
  comisiones: renderComisiones
};

function getSubtitle(viewName) {
  return {
    inicio: "Resumen general de tu actividad comercial",
    reservas: "Seguimiento de tus reservas activas",
    ventas: "Estado financiero de tus ventas",
    comisiones: "Detalle y disponibilidad de comisiones"
  }[viewName] || "";
}

function hydrateNavigationIcons() {
  document.querySelectorAll(".nav-btn[data-icon]").forEach((button) => {
    const iconHost = button.querySelector(".nav-icon");
    if (!iconHost) return;

    AppCore.clearElement(iconHost);
    iconHost.appendChild(createIcon(button.dataset.icon, "nav-icon-svg"));
  });
}

async function setView(viewName) {
  state.currentView = viewName;

  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });

  heroSubtitle.textContent = getSubtitle(viewName);
  AppCore.clearElement(mainContent);
  mainContent.appendChild(renderViewSkeleton(viewName));
  showLoader();

  try {
    const content = await views[viewName]();
    AppCore.clearElement(mainContent);
    if (content) {
      mainContent.appendChild(content);
    }
  } catch (error) {
    AppCore.clearElement(mainContent);
    mainContent.appendChild(
      createSectionCard("Error", AppCore.getErrorMessage(error, "No se pudo cargar la vista."))
    );
  } finally {
    hideLoader();
  }
}

async function loadKpis() {
  kpiCards.forEach((card) => card.classList.add("is-loading"));

  try {
    const data = await AppCore.apiRequest({
      query: { kpis_agente: 1 },
      auth: true
    });

    kpiReservas.textContent = String(AppCore.safeNumber(data.reservas));
    if (badgeReservas) {
      badgeReservas.textContent = String(AppCore.safeNumber(data.reservas));
      badgeReservas.classList.toggle("hidden", AppCore.safeNumber(data.reservas) <= 0);
    }
    kpiVentas.textContent = String(AppCore.safeNumber(data.ventas));
    kpiComisionProyectada.textContent = AppCore.formatCurrency(data.comision_proyectada);
    kpiComisionDisponible.textContent = AppCore.formatCurrency(data.comision_disponible);
  } catch (error) {
    console.error("Error cargando KPIs", error);
    kpiComisionDisponible.textContent = AppCore.formatCurrency(0);
  } finally {
    kpiCards.forEach((card) => card.classList.remove("is-loading"));
  }
}

document.querySelectorAll(".nav-btn").forEach((button) => {
  button.addEventListener("click", () => {
    setView(button.dataset.view);
  });
});

hydrateNavigationIcons();
loadKpis();
setView("inicio");
