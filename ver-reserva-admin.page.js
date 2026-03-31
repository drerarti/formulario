const { AppCore } = window;
const session = AppCore.requireSession({
  role: "admin",
  forbiddenRedirect: "/dashboard-agente.html"
});

if (!session) {
  throw new Error("Admin session required");
}

const params = new URLSearchParams(window.location.search);
const reservaId = params.get("id") || "";

const loadingState = document.getElementById("loadingState");
const errorState = document.getElementById("errorState");
const errorMessage = document.getElementById("errorMessage");
const reservationSheet = document.getElementById("reservationSheet");

function safeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value, options = {}) {
  const date = safeDate(value);
  if (!date) return "No disponible";

  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: options.dateStyle || "long",
    timeStyle: options.timeStyle
  }).format(date);
}

function hasNumericValue(value) {
  return value !== undefined && value !== null && value !== "" && Number.isFinite(Number(value));
}

function formatMoney(value, currency = "PEN", fallback = "No disponible") {
  return hasNumericValue(value) ? AppCore.formatCurrency(value, currency) : fallback;
}

function setText(id, value, fallback = "No disponible") {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = value || fallback;
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

function buildAjuste(detail, currency) {
  const descuento = AppCore.safeNumber(detail.financiero.descuento_solicitado);
  const sobreprecio = AppCore.safeNumber(detail.financiero.sobreprecio);

  if (descuento > 0 && sobreprecio > 0) {
    return {
      title: "Ajuste mixto",
      detail: `Descuento ${formatMoney(descuento, currency)} y sobreprecio ${formatMoney(sobreprecio, currency)}`
    };
  }

  if (descuento > 0) {
    return {
      title: "Descuento aplicado",
      detail: `Solicitud de descuento por ${formatMoney(descuento, currency)}`
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

function buildNotes(detail, currency) {
  const parts = [];
  const timeline = buildTimelineCopy(detail);

  parts.push(`Estado actual: ${detail.estado}`);
  if (timeline.deadlineDate) {
    parts.push(`${timeline.label}: ${formatDate(timeline.deadlineDate)}`);
    parts.push(`Seguimiento: ${timeline.status}`);
  }

  if (detail.extension?.usada) {
    parts.push("La reserva ya utilizó su extensión única.");
  } else if (detail.extension?.pendiente) {
    parts.push(
      detail.extension.deposito_cumplido
        ? "Existe una solicitud de extensión pendiente con depósito confirmado."
        : `Existe una solicitud de extensión pendiente. Falta validar el depósito mínimo de ${formatMoney(detail.extension.deposito_requerido || 2500, currency)}.`
    );
  }

  if (detail.observaciones) {
    parts.push(`Observaciones:\n${detail.observaciones}`);
  }

  if (detail.motivo_descuento) {
    parts.push(`Motivo de descuento:\n${detail.motivo_descuento}`);
  }

  if (AppCore.safeNumber(detail.financiero.descuento_solicitado) > 0) {
    parts.push(`Descuento solicitado: ${formatMoney(detail.financiero.descuento_solicitado, currency)}`);
  }

  if (AppCore.safeNumber(detail.financiero.sobreprecio) > 0) {
    parts.push(`Sobreprecio: ${formatMoney(detail.financiero.sobreprecio, currency)}`);
  }

  parts.push(detail.boleta_emitida ? "Boleta emitida: Si" : "Boleta emitida: No");

  return parts.join("\n\n");
}

function setStatus(status) {
  const meta = AppCore.getReservationStatusMeta(status);
  const badge = document.getElementById("sheetStatus");
  const note = document.getElementById("sheetStatusNote");

  if (badge) {
    badge.className = `status-pill tone-${meta.tone}`;
    badge.textContent = meta.label;
  }

  if (note) {
    note.textContent = meta.description;
  }

  return meta;
}

function renderDetail(detail) {
  const currency = detail.financiero.moneda || detail.unidad.moneda || "PEN";
  const precioFinal = AppCore.safeNumber(detail.financiero.precio_final) > 0
    ? detail.financiero.precio_final
    : detail.unidad.precio_lista;
  const saldoPendiente = hasNumericValue(detail.financiero.saldo_pendiente)
    ? detail.financiero.saldo_pendiente
    : Math.max(
        0,
        AppCore.safeNumber(precioFinal) -
          AppCore.safeNumber(detail.financiero.monto_reserva) -
          AppCore.safeNumber(detail.financiero.monto_inicial)
      );
  const commercialCode = detail.codigo_comercial || detail.id;
  const projectMeta = buildProjectMeta(detail);
  const ajuste = buildAjuste(detail, currency);
  const statusMeta = setStatus(detail.estado);
  const timeline = buildTimelineCopy(detail);

  document.title = `${commercialCode} | Admin | Ayllu`;

  setText("sheetCode", commercialCode);
  setText(
    "sheetSubtitle",
    detail.cliente.nombre
      ? `Reserva de ${detail.cliente.nombre} lista para seguimiento, validacion o conversion.`
      : "Resumen integral para validacion, conversion y seguimiento administrativo."
  );
  setText("projectChip", detail.unidad.proyecto || "Proyecto no disponible");
  setText("projectMeta", projectMeta || "Sin contexto comercial adicional");

  setText("fechaCreacion", formatDate(detail.fecha_creacion, { dateStyle: "full" }));
  setText(
    "fechaInicio",
    detail.fecha_inicio ? `Inicio: ${formatDate(detail.fecha_inicio)}` : "Sin fecha de inicio registrada"
  );
  setText(
    "fechaValidacion",
    detail.fecha_validacion ? `Validada el ${formatDate(detail.fecha_validacion)}` : timeline.status
  );
  setText("fechaVigencia", timeline.summary);

  setText("internalReservaId", detail.id);
  setText("internalUnidadId", detail.unidad.record_id || "No disponible");
  setText("boletaEstado", detail.boleta_emitida ? "Emitida" : "Pendiente");

  setText("clienteNombre", detail.cliente.nombre);
  setText("clienteDocumento", detail.cliente.dni ? `Documento ${detail.cliente.dni}` : "Documento no disponible");
  setText("agenteNombre", detail.agente.nombre);
  setText("agenteCanal", "Gestion comercial activa");
  setText("unidadCodigo", detail.unidad.codigo || detail.unidad.record_id || "No disponible");
  setText("unidadResumen", projectMeta || "Sin referencia del proyecto");
  setText("tipoOperacionTop", detail.financiero.tipo_operacion || "Reserva");
  setText("monedaOperacionTop", `Moneda ${currency}`);

  setText("clienteNombreDetalle", detail.cliente.nombre);
  setText("clienteDni", detail.cliente.dni);
  setText("clienteTelefono", detail.cliente.telefono || "No registrado");
  setText("agenteNombreDetalle", detail.agente.nombre);
  setText("estadoDetalle", statusMeta.label);
  setText(
    "estadoFechaDetalle",
    detail.fecha_validacion ? formatDate(detail.fecha_validacion) : timeline.status
  );
  setText("unidadProyecto", detail.unidad.proyecto || "No disponible");
  setText("unidadProyectoDetalle", detail.unidad.proyecto || "No disponible");
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
  setText("unidadCodigoDetalle", detail.unidad.codigo || detail.unidad.record_id || "No disponible");
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
  setText("saldoPendiente", formatMoney(saldoPendiente, currency));
  setText("saldoPendienteCard", formatMoney(saldoPendiente, currency));
  setText("monedaOperacion", currency);
  setText("tipoOperacion", detail.financiero.tipo_operacion || "Reserva");
  setText("ajusteComercial", ajuste.title);
  setText("ajusteDetalle", ajuste.detail);

  setText("notesBox", buildNotes(detail, currency), "Sin observaciones registradas.");
  setText("codigoComercialDetalle", commercialCode);
  setText("fechaCreacionDetalle", formatDate(detail.fecha_creacion));
  setText("fechaInicioDetalle", detail.fecha_inicio ? formatDate(detail.fecha_inicio) : "No disponible");
  setText("fechaVigenciaDetalle", timeline.deadlineDate ? formatDate(timeline.deadlineDate) : "No disponible");
  setText(
    "footerSummary",
    `${commercialCode} | ${statusMeta.label}. Documento privado de gestion administrativa.`
  );

  const commercialLink = document.getElementById("btnCommercialView");
  if (commercialLink) {
    commercialLink.href = `/ver-reserva.html?id=${encodeURIComponent(detail.id)}`;
  }

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

    if (!detail || !detail.id) {
      showError("La reserva solicitada no existe o no esta disponible.");
      return;
    }

    renderDetail(detail);
  } catch (error) {
    if (error.status === 404) {
      showError("La reserva no existe o no corresponde al entorno administrativo.");
      return;
    }

    if (error.status === 401) {
      showError("Tu sesion expiro. Ingresa nuevamente para continuar.");
      return;
    }

    showError(AppCore.getErrorMessage(error, "No se pudo cargar la reserva."));
  }
}

document.getElementById("btnBack")?.addEventListener("click", () => {
  window.location.href = "/admin.html";
});

document.getElementById("btnErrorBack")?.addEventListener("click", () => {
  window.location.href = "/admin.html";
});

document.getElementById("btnPrint")?.addEventListener("click", () => {
  window.print();
});

loadReservaDetalle();
