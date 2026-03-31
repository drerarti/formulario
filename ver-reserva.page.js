const { AppCore } = window;
const session = AppCore.requireSession();

if (!session) {
  throw new Error("Session required");
}

const params = new URLSearchParams(window.location.search);
const reservaId = params.get("id") || "";

const loadingState = document.getElementById("loadingState");
const errorState = document.getElementById("errorState");
const errorMessage = document.getElementById("errorMessage");
const reservationSheet = document.getElementById("reservationSheet");

const toolbarHint = document.querySelector(".toolbar-hint");
const qrImage = document.getElementById("qrImage");
const qrCaption = document.getElementById("qrCaption");
const baseToolbarHint = toolbarHint ? toolbarHint.textContent.trim().replace(/\s+/g, " ") : "";

function formatDate(value, options = {}) {
  if (!value) return "No disponible";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: options.dateStyle || "long",
    timeStyle: options.timeStyle
  }).format(date);
}

function hasNumericValue(value) {
  return value !== undefined && value !== null && value !== "" && Number.isFinite(Number(value));
}

function formatMoney(value, currency = "PEN", fallback = "No disponible") {
  if (!hasNumericValue(value)) {
    return fallback;
  }

  return AppCore.formatCurrency(value, currency);
}

function setText(id, value, fallback = "No disponible") {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = value || fallback;
}

function setStatus(status) {
  const element = document.getElementById("sheetStatus");
  const note = document.getElementById("sheetStatusNote");
  const meta = AppCore.getReservationStatusMeta(status);

  if (element) {
    element.className = `status-pill tone-${meta.tone}`;
    element.textContent = meta.label;
  }

  if (note) {
    note.textContent = meta.description;
  }

  setText("estadoDetalle", meta.label, "Sin estado");
}

function buildNotes(detail, currency) {
  const notes = [];
  const timeline = buildTimelineCopy(detail);

  notes.push(`Estado actual: ${detail.estado}`);
  if (timeline.deadlineDate) {
    notes.push(`${timeline.label}: ${formatDate(timeline.deadlineDate)}`);
    notes.push(`Seguimiento: ${timeline.status}`);
  }

  if (detail.extension?.usada) {
    notes.push("Extensión comercial ya utilizada.");
  } else if (detail.extension?.pendiente) {
    notes.push(
      detail.extension.deposito_cumplido
        ? "Existe una solicitud de extensión pendiente con depósito registrado."
        : `Existe una solicitud de extensión pendiente. Falta validar el depósito mínimo de ${formatMoney(detail.extension.deposito_requerido || 2500, currency)}.`
    );
  }

  if (detail.observaciones) {
    notes.push(`Observaciones: ${detail.observaciones}`);
  }

  if (detail.motivo_descuento) {
    notes.push(`Motivo de descuento: ${detail.motivo_descuento}`);
  }

  if (AppCore.safeNumber(detail.financiero.descuento_solicitado) > 0) {
    notes.push(
      `Descuento solicitado: ${formatMoney(detail.financiero.descuento_solicitado, currency)}`
    );
  }

  if (AppCore.safeNumber(detail.financiero.sobreprecio) > 0) {
    notes.push(`Sobreprecio: ${formatMoney(detail.financiero.sobreprecio, currency)}`);
  }

  if (detail.boleta_emitida) {
    notes.push("Boleta emitida: Si");
  }

  return notes.join("\n\n") || "Sin observaciones registradas.";
}

function buildProjectMeta(detail) {
  return [
    detail.unidad.fase,
    detail.unidad.etapa,
    detail.unidad.manzana ? `Mz. ${detail.unidad.manzana}` : "",
    detail.unidad.lote ? `Lt. ${detail.unidad.lote}` : ""
  ].filter(Boolean).join(" / ");
}

function getDeadlineLabel(detail) {
  if (detail.deadline_type === "confirmacion") return "Confirmación";
  if (detail.deadline_type === "extension") return "Extensión";
  if (detail.deadline_type === "negociacion") return "Negociación";
  return "Vigencia";
}

function buildTimelineCopy(detail) {
  const label = getDeadlineLabel(detail);
  const deadlineDate = detail.fecha_vigencia_fin || detail.fecha_limite_confirmacion || "";
  const days = Number.isFinite(Number(detail.dias_restantes)) ? Number(detail.dias_restantes) : null;
  return {
    label,
    deadlineDate,
    summary: deadlineDate ? `${label}: ${formatDate(deadlineDate)}` : "Sin plazo activo",
    status: days === null
      ? "Sin seguimiento de plazo"
      : days < 0
        ? `${label} vencida hace ${Math.abs(days)} día(s)`
        : days === 0
          ? `${label} vence hoy`
          : `${days} día(s) restantes para ${label.toLowerCase()}`
  };
}

function buildAjusteComercial(detail, currency) {
  const descuento = AppCore.safeNumber(detail.financiero.descuento_solicitado);
  const sobreprecio = AppCore.safeNumber(detail.financiero.sobreprecio);

  if (descuento > 0 && sobreprecio > 0) {
    return {
      title: "Ajuste mixto",
      detail:
        `Descuento ${formatMoney(descuento, currency)} y sobreprecio ` +
        `${formatMoney(sobreprecio, currency)}`
    };
  }

  if (descuento > 0) {
    return {
      title: "Descuento aplicado",
      detail: `Descuento solicitado por ${formatMoney(descuento, currency)}`
    };
  }

  if (sobreprecio > 0) {
    return {
      title: "Sobreprecio aplicado",
      detail: `Sobreprecio registrado por ${formatMoney(sobreprecio, currency)}`
    };
  }

  return {
    title: "Sin ajuste",
    detail: "No se registran descuentos ni sobreprecios."
  };
}

function updateToolbarHint(message, timeout = 2600) {
  if (!toolbarHint) return;

  toolbarHint.textContent = message;

  if (timeout > 0) {
    window.clearTimeout(updateToolbarHint.timerId);
    updateToolbarHint.timerId = window.setTimeout(() => {
      toolbarHint.textContent = baseToolbarHint;
    }, timeout);
  }
}

function showError(message) {
  loadingState.classList.add("hidden");
  reservationSheet.classList.add("hidden");
  errorState.classList.remove("hidden");
  errorMessage.textContent = message;
}

function showSheet() {
  loadingState.classList.add("hidden");
  errorState.classList.add("hidden");
  reservationSheet.classList.remove("hidden");
}

function renderQr(url, code) {
  if (!qrImage || !qrCaption) return;

  qrImage.hidden = false;
  qrImage.loading = "lazy";
  qrImage.referrerPolicy = "no-referrer";
  qrImage.src = AppCore.buildQrUrl(url, 220);
  qrImage.alt = `Codigo QR de la reserva ${code}`;

  qrCaption.textContent = "Escanea para abrir esta ficha dentro del entorno autenticado.";
  qrImage.onerror = () => {
    qrImage.hidden = true;
    qrCaption.textContent =
      "No pudimos generar el QR en este momento. Usa el codigo comercial para ubicar la reserva.";
  };
}

function renderDetail(detail) {
  const currency = detail.financiero.moneda || detail.unidad.moneda || "PEN";
  const precioFinal = AppCore.safeNumber(detail.financiero.precio_final) > 0
    ? detail.financiero.precio_final
    : detail.unidad.precio_lista;
  const saldoPendiente = hasNumericValue(detail.financiero.saldo_pendiente)
    ? detail.financiero.saldo_pendiente
    : Math.max(0, AppCore.safeNumber(precioFinal) -
        AppCore.safeNumber(detail.financiero.monto_reserva) -
        AppCore.safeNumber(detail.financiero.monto_inicial));
  const projectMeta = buildProjectMeta(detail);
  const detailUrl = AppCore.buildAbsoluteUrl(`/ver-reserva.html?id=${encodeURIComponent(detail.id)}`);
  const ajuste = buildAjusteComercial(detail, currency);
  const commercialCode = detail.codigo_comercial || detail.id;
  const statusMeta = AppCore.getReservationStatusMeta(detail.estado);
  const timeline = buildTimelineCopy(detail);

  document.title = `${commercialCode} | Ayllu`;

  setText("sheetCode", commercialCode);
  setText(
    "sheetSubtitle",
    detail.cliente.nombre
      ? `Resumen comercial de la reserva asignada a ${detail.cliente.nombre}.`
      : "Documento comercial listo para impresion o guardado como PDF."
  );
  setText("projectChip", detail.unidad.proyecto || "Proyecto no disponible");
  setText("projectMeta", projectMeta || "Sin ubicacion comercial detallada");

  setText("fechaCreacion", formatDate(detail.fecha_creacion, { dateStyle: "full" }));
  setText(
    "fechaInicio",
    detail.fecha_inicio
      ? `Inicio: ${formatDate(detail.fecha_inicio)}`
      : "Sin fecha de inicio registrada"
  );
  setText("fechaVigencia", timeline.summary);
  setText(
    "fechaValidacion",
    detail.fecha_validacion
      ? `Validada el ${formatDate(detail.fecha_validacion)}`
      : timeline.status
  );

  setStatus(detail.estado);
  setText("agenteNombre", detail.agente.nombre);
  setText("agenteCodigo", "Asesor comercial asignado");
  setText("clienteNombre", detail.cliente.nombre);
  setText(
    "clienteDocumento",
    detail.cliente.dni ? `Documento ${detail.cliente.dni}` : "Documento no disponible"
  );

  setText("unidadCodigo", detail.unidad.codigo || detail.unidad.record_id || "No disponible");
  setText("unidadResumen", projectMeta || "Sin referencia comercial");
  setText("tipoOperacionTop", detail.financiero.tipo_operacion || "Reserva");
  setText("monedaOperacionTop", `Moneda ${currency}`);

  setText("clienteNombreDetalle", detail.cliente.nombre);
  setText("clienteDni", detail.cliente.dni);
  setText("clienteTelefono", detail.cliente.telefono || "No registrado");

  setText("agenteNombreDetalle", detail.agente.nombre);
  setText("agenteCodigoDetalle", "Atencion comercial privada");
  setText("estadoDetalle", statusMeta.label);
  setText(
    "estadoFechaDetalle",
    detail.fecha_validacion ? formatDate(detail.fecha_validacion) : timeline.status
  );

  setText("unidadCodigoDetalle", detail.unidad.codigo || detail.unidad.record_id || "No disponible");
  setText("unidadProyecto", detail.unidad.proyecto || "No disponible");
  setText(
    "unidadFase",
    [detail.unidad.fase, detail.unidad.etapa].filter(Boolean).join(" / ") || "No disponible"
  );
  setText(
    "unidadManzana",
    [
      detail.unidad.manzana ? `Mz. ${detail.unidad.manzana}` : "",
      detail.unidad.lote ? `Lt. ${detail.unidad.lote}` : ""
    ].filter(Boolean).join(" / ") || "No disponible"
  );
  setText("unidadArea", detail.unidad.area ? `${detail.unidad.area} m2` : "No disponible");
  setText("unidadPrecio", formatMoney(detail.unidad.precio_lista, currency));
  setText("unidadMoneda", currency);
  setText("unidadVigencia", timeline.summary);

  setText("precioFinal", formatMoney(precioFinal, currency));
  setText("precioFinalCard", formatMoney(precioFinal, currency));
  setText("montoReserva", formatMoney(detail.financiero.monto_reserva, currency, "No aplica"));
  setText(
    "montoInicial",
    AppCore.safeNumber(detail.financiero.monto_inicial) > 0
      ? formatMoney(detail.financiero.monto_inicial, currency)
      : "No aplica"
  );
  setText(
    "saldoPendiente",
    formatMoney(saldoPendiente, currency, "No disponible")
  );
  setText(
    "saldoPendienteCard",
    formatMoney(saldoPendiente, currency, "No disponible")
  );
  setText("monedaOperacion", currency);
  setText("tipoOperacion", detail.financiero.tipo_operacion || "Reserva");
  setText("ajusteComercial", ajuste.title);
  setText("ajusteDetalle", ajuste.detail);

  setText("notesBox", buildNotes(detail, currency));
  setText(
    "footerSummary",
    `${commercialCode} | ${statusMeta.label}. Documento generado desde el panel privado del agente.`
  );

  renderQr(detailUrl, commercialCode);
  showSheet();
}

async function loadReservaDetalle() {
  if (!reservaId) {
    showError("No recibimos un identificador de reserva valido.");
    return;
  }

  try {
    const detail = await AppCore.apiRequest({
      query: { reserva_detalle: reservaId },
      auth: true
    });

    renderDetail(detail);
  } catch (error) {
    showError(AppCore.getErrorMessage(error, "No se pudo cargar la reserva."));
  }
}

function goBack() {
  if (window.history.length > 1) {
    window.history.back();
    return;
  }

  window.location.href = "/dashboard-agente.html";
}

function openPrintDialog(mode) {
  if (mode === "pdf") {
    updateToolbarHint(
      'En el dialogo del navegador, elige "Guardar como PDF" para descargar esta ficha.',
      2800
    );
    window.setTimeout(() => window.print(), 90);
    return;
  }

  updateToolbarHint(baseToolbarHint, 900);
  window.print();
}

document.getElementById("btnBack").addEventListener("click", goBack);
document.getElementById("btnErrorBack").addEventListener("click", goBack);
document.getElementById("btnPrint").addEventListener("click", () => openPrintDialog("print"));
document.getElementById("btnPdf").addEventListener("click", () => openPrintDialog("pdf"));

loadReservaDetalle();
