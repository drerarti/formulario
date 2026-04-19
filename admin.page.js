(function () {
  window.__ADMIN_V2_ENABLED = true;
  const { AppCore } = window;
  const session = AppCore.requireSession({
    role: "admin",
    forbiddenRedirect: "/dashboard-agente.html"
  });

  if (!session) return;

  const PAGE_SIZE = 8;
  const UNITS_RETRY_COOLDOWN_MS = 15000;
  const deepLinkParams = new URLSearchParams(window.location.search);
  const state = {
    currentSection: document.querySelector(".nav-btn.active[data-nav]")?.dataset.nav || "dashboard",
    isMobile: window.matchMedia("(max-width: 840px)").matches,
    loading: false,
    reservationsRaw: [],
    reservations: [],
    salesRaw: [],
    sales: [],
    extensionsRaw: [],
    extensions: [],
    units: [],
    unitsById: new Map(),
    unitsByCode: new Map(),
    unitsLoaded: false,
    unitsError: null,
    unitsPromise: null,
    unitsRetryAt: 0,
    reservationsPage: 1,
    salesPage: 1,
    chart: null,
    deepLinkHandled: false
  };
  const saleQuotaContextCache = new Map();

  const refs = {
    headerTitle: document.querySelector(".admin-header .title"),
    subtitle: document.getElementById("adminSubtitle"),
    refreshButton: document.getElementById("btnRefreshAdmin"),
    dashboardKpis: document.getElementById("dashboardKpis"),
    dashboardHighlights: document.getElementById("dashboardHighlights"),
    dashboardStamp: document.getElementById("dashboardStamp"),
    reservasContainer: document.getElementById("reservasContainer"),
    reservasMeta: document.getElementById("reservasMeta"),
    reservasPagination: document.getElementById("reservasPagination"),
    reservasSummaryChip: document.getElementById("reservasSummaryChip"),
    ventasContainer: document.getElementById("ventasContainer"),
    ventasMeta: document.getElementById("ventasMeta"),
    ventasPagination: document.getElementById("ventasPagination"),
    ventasSummaryChip: document.getElementById("ventasSummaryChip"),
    extSummaryChip: document.getElementById("extensionesSummaryChip"),
    extPendingCount: document.getElementById("extPendingCount"),
    extApprovedCount: document.getElementById("extApprovedCount"),
    extRejectedCount: document.getElementById("extRejectedCount"),
    extPendientes: document.getElementById("extensionesPendientes"),
    extAprobadas: document.getElementById("extensionesAprobadas"),
    extRechazadas: document.getElementById("extensionesRechazadas"),
    unitsContainer: document.getElementById("unidadesContainer"),
    unitsCounter: document.getElementById("contadorUnidades"),
    chartCanvas: document.getElementById("ventasChart"),
    reservaSearch: document.getElementById("reservaSearch"),
    reservaEstadoFilter: document.getElementById("reservaEstadoFilter"),
    reservaProyectoFilter: document.getElementById("reservaProyectoFilter"),
    reservaAgenteFilter: document.getElementById("reservaAgenteFilter"),
    reservaSort: document.getElementById("reservaSort"),
    reservaDateFrom: document.getElementById("reservaDateFrom"),
    reservaDateTo: document.getElementById("reservaDateTo"),
    ventaSearch: document.getElementById("ventaSearch"),
    ventaEstadoFilter: document.getElementById("ventaEstadoFilter"),
    ventaSort: document.getElementById("ventaSort"),
    filtroProyecto: document.getElementById("filtroProyecto"),
    filtroFase: document.getElementById("filtroFase"),
    filtroManzana: document.getElementById("filtroManzana"),
    filtroEstado: document.getElementById("filtroEstado"),
    buscarLote: document.getElementById("buscarLote")
  };

  const legacyActions = {
    verVenta: window.verVenta,
    crearCuota: window.crearCuota,
    registrarPago: window.registrarPago,
    mostrarNegociacion: window.mostrarNegociacion
  };

  function adminRequest(options = {}) {
    return AppCore.apiRequest({ auth: true, ...options });
  }

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function safeDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(value, style = "medium") {
    const date = safeDate(value);
    if (!date) return "No disponible";
    return new Intl.DateTimeFormat("es-PE", { dateStyle: style }).format(date);
  }

  function formatDateTime(value) {
    const date = safeDate(value);
    if (!date) return "No disponible";
    return new Intl.DateTimeFormat("es-PE", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  }

  function formatMoney(value, currency = "PEN") {
    return AppCore.formatCurrency(AppCore.safeNumber(value), currency);
  }

  function clearAndAppend(container, children) {
    if (!container) return;
    AppCore.clearElement(container);
    AppCore.appendChildren(container, children);
  }

  function consumeDeepLink() {
    if (state.deepLinkHandled) return;
    const view = normalize(deepLinkParams.get("view"));
    const id = deepLinkParams.get("id");
    if (!view || !id) return;

    state.deepLinkHandled = true;

    if (view === "venta") {
      activateSection("ventas");
      window.setTimeout(() => {
        if (typeof window.verVenta === "function") {
          window.verVenta(id);
        }
      }, 120);
    }
  }

  function createStatusPill(label, tone) {
    return AppCore.createElement("span", {
      className: `status-pill-admin tone-${tone}`.trim(),
      text: label || "Sin estado"
    });
  }

  function createMetaPill(label, value, tone = "neutral") {
    return AppCore.createElement("div", { className: `meta-pill tone-${tone}` }, [
      AppCore.createElement("span", { className: "meta-pill-label", text: label }),
      AppCore.createElement("strong", { text: value })
    ]);
  }

  function getExtensionStatusMeta(status) {
    const normalized = normalize(status);
    if (normalized === "solicitud") return { label: "Pendiente", tone: "pending" };
    if (normalized === "aprobada") return { label: "Aprobada", tone: "confirmed" };
    if (normalized === "rechazada") return { label: "Rechazada", tone: "rejected" };
    return { label: status || "Sin estado", tone: "neutral" };
  }

  function renderEmpty(container, title, text) {
    clearAndAppend(container, AppCore.createElement("div", { className: "empty-state-admin" }, [
      AppCore.createElement("h3", { text: title }),
      AppCore.createElement("p", { text })
    ]));
  }

  function renderSkeleton(container, count = 3) {
    if (!container) return;
    AppCore.clearElement(container);
    for (let index = 0; index < count; index += 1) {
      container.appendChild(AppCore.createElement("div", { className: "skeleton-card-admin" }, [
        AppCore.createElement("span", { className: "skeleton-line w-40" }),
        AppCore.createElement("span", { className: "skeleton-line w-85" }),
        AppCore.createElement("span", { className: "skeleton-line w-100" }),
        AppCore.createElement("span", { className: "skeleton-line w-70" })
      ]));
    }
  }

  function setButtonLoading(button, isLoading) {
    if (!button) return;
    button.disabled = isLoading;
    button.classList.toggle("is-loading", isLoading);
    if (isLoading) {
      button.dataset.originalText = button.textContent;
      button.textContent = "Actualizando...";
    } else if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
    }
  }

  function showAdminAlert(message) {
    window.alert(typeof AppCore.repairTextEncoding === "function" ? AppCore.repairTextEncoding(message) : message);
  }

  function sectionNeedsUnits(sectionId = state.currentSection) {
    return ["reservas", "ventas", "unidades"].includes(sectionId);
  }

  function setUnitsError(error) {
    state.unitsError = error || null;
  }

  function getUnitsErrorMessage() {
    return AppCore.getErrorMessage(state.unitsError, "No se pudieron cargar las unidades.");
  }

  function setDashboardStamp(message) {
    if (refs.dashboardStamp) {
      refs.dashboardStamp.textContent = typeof AppCore.repairTextEncoding === "function" ? AppCore.repairTextEncoding(message) : message;
    }
  }

  function setUnitsWarning(message) {
    if (!message) return;
    setDashboardStamp(message);
  }

  function getUnitsRetryRemainingMs() {
    return Math.max(0, state.unitsRetryAt - Date.now());
  }

  function applyStaticCopy() {
    if (refs.reservaSearch) refs.reservaSearch.placeholder = "Buscar por cliente, agente, unidad o código";
    if (refs.ventaSearch) refs.ventaSearch.placeholder = "Buscar por cliente, agente o unidad";
    if (refs.buscarLote) refs.buscarLote.placeholder = "Buscar lote (ej: MA-06)";
    setDashboardStamp("Sincronizando datos");

    if (refs.reservaSort) {
      const labels = [
        "Más recientes",
        "Más antiguas",
        "Mayor monto",
        "Menor monto",
        "Cliente A-Z"
      ];
      Array.from(refs.reservaSort.options).forEach((option, index) => {
        if (labels[index]) option.textContent = labels[index];
      });
    }

    if (refs.ventaSort) {
      const labels = [
        "Más recientes",
        "Mayor ticket",
        "Menor ticket",
        "Mayor saldo",
        "Cliente A-Z"
      ];
      Array.from(refs.ventaSort.options).forEach((option, index) => {
        if (labels[index]) option.textContent = labels[index];
      });
    }
  }

  async function syncData(options = {}) {
    const settings = {
      reservations: false,
      sales: false,
      extensions: false,
      units: false,
      filters: false,
      ...options
    };

    const tasks = [];
    if (settings.units) tasks.push(() => fetchUnits({ force: true, optional: true }));
    if (settings.reservations) tasks.push(() => fetchReservations());
    if (settings.sales) {
      invalidateSaleQuotaContext();
      tasks.push(() => fetchSales());
    }
    if (settings.extensions) tasks.push(() => fetchExtensions());

    if (tasks.length) {
      if (state.isMobile) {
        for (const task of tasks) {
          await task();
        }
      } else {
        await Promise.all(tasks.map((task) => task()));
      }
    }

    if (settings.filters) {
      populateFilters();
    }

    renderDashboard();
    renderReservations();
    renderSales();
    renderExtensions();
    renderUnits();
  }

  async function runAction(body, fallbackMessage) {
    try {
      const response = await adminRequest({
        method: "PATCH",
        body
      });

      if (response && response.success === false) {
        throw new Error(response.error || fallbackMessage);
      }

      return response;
    } catch (error) {
      throw new Error(AppCore.getErrorMessage(error, fallbackMessage));
    }
  }

  function buildUnitMaps(units) {
    state.units = Array.isArray(units) ? units : [];
    state.unitsById = new Map();
    state.unitsByCode = new Map();
    state.unitsLoaded = Array.isArray(units);
    state.units.forEach((unit) => {
      state.unitsById.set(unit.id, unit);
      if (unit.codigo) state.unitsByCode.set(unit.codigo, unit);
    });
  }

  function resolveUnit(reference) {
    return state.unitsById.get(reference) || state.unitsByCode.get(reference) || null;
  }

  function getDaysUntil(value) {
    const date = safeDate(value);
    if (!date) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    return Math.round((date.getTime() - today.getTime()) / 86400000);
  }

  function getReservationStatus(item) {
    const meta = AppCore.getReservationStatusMeta(item.estado);
    const fallbackDate = item.fecha_vigencia_fin || item.fecha_limite_confirmacion || "";
    const rawDays = Number.isFinite(Number(item.dias_restantes))
      ? Number(item.dias_restantes)
      : getDaysUntil(fallbackDate);
    const deadlineType = normalize(item.deadline_type);
    const deadlineLabel = deadlineType === "confirmacion"
      ? "Confirmación"
      : deadlineType === "extension"
        ? "Extensión"
        : deadlineType === "negociacion"
          ? "Negociación"
          : "Vigencia";

    return {
      ...meta,
      deadlineType,
      deadlineLabel,
      deadlineDate: fallbackDate,
      daysUntilExpiry: rawDays,
      isExpiringSoon: rawDays !== null && rawDays >= 0 && rawDays <= 3,
      isExpired: rawDays !== null && rawDays < 0
    };
  }

  function getSaleStatusMeta(status) {
    const normalized = normalize(status);
    if (normalized.includes("cerr") || normalized.includes("pag")) return { label: "Cerrada", tone: "premium" };
    if (normalized.includes("mora")) return { label: "Morosa", tone: "rejected" };
    if (normalized.includes("venc")) return { label: "Vencida", tone: "pending" };
    if (normalized.includes("pago")) return { label: "Con pagos", tone: "active" };
    if (normalized.includes("proce") || normalized.includes("act")) return { label: "En proceso", tone: "active" };
    if (normalized.includes("pend")) return { label: "Pendiente", tone: "pending" };
    if (normalized.includes("cancel")) return { label: "Cancelada", tone: "rejected" };
    if (normalized.includes("bloq")) return { label: "Bloqueada", tone: "neutral" };
    return { label: status || "Sin estado", tone: "neutral" };
  }

  function enrichReservations(data = state.reservationsRaw) {
    state.reservations = (Array.isArray(data) ? data : []).map((item) => {
      const unit = resolveUnit(item.unidad_record_id || item.unidad);
      return {
        ...item,
        unit,
        commercialCode: item.codigo_comercial || item.id,
        unitCode: unit?.codigo || item.unidad || "Sin unidad",
        projectLine: [unit?.proyecto, unit?.fase].filter(Boolean).join(" / "),
        lotLine: [unit?.manzana ? `Mz. ${unit.manzana}` : "", unit?.lote ? `Lt. ${unit.lote}` : ""].filter(Boolean).join(" / "),
        referenceDate: item.fecha_inicio || item.fecha_creacion || "",
        deadlineDate: item.fecha_vigencia_fin || item.fecha_limite_confirmacion || "",
        priceReference: AppCore.safeNumber(item.precio_final) > 0 ? item.precio_final : item.precio_lista,
        statusMeta: getReservationStatus(item)
      };
    });
  }

  function enrichSales(data = state.salesRaw) {
    state.sales = (Array.isArray(data) ? data : []).map((item) => {
      const unit = resolveUnit(item.unidad);
      const totalPaid = AppCore.safeNumber(item.total_pagado) > 0
        ? AppCore.safeNumber(item.total_pagado)
        : Math.max(0, AppCore.safeNumber(item.precio_base) - AppCore.safeNumber(item.saldo_restante));
      return {
        ...item,
        unit,
        unitCode: unit?.codigo || item.unidad || "Sin unidad",
        projectLine: [unit?.proyecto, unit?.fase].filter(Boolean).join(" / "),
        totalPaid,
        progress: AppCore.safeNumber(item.precio_base) > 0
          ? Math.min(100, Math.round((totalPaid / AppCore.safeNumber(item.precio_base)) * 100))
          : 0,
        statusMeta: getSaleStatusMeta(item.estado_venta)
      };
    });
  }

  function enrichExtensions(data = state.extensionsRaw) {
    state.extensions = (Array.isArray(data) ? data : []).map((item) => ({
      ...item,
      voucherUrl: AppCore.sanitizeUrl(item.voucher?.[0]?.url || ""),
      puedeAprobar: Boolean(item.puede_aprobar),
      depositoCumplido: Boolean(item.deposito_cumplido)
    }));
  }

  function populateSelect(select, placeholder, values) {
    if (!select) return;
    AppCore.clearElement(select);
    select.appendChild(AppCore.createElement("option", {
      attrs: { value: "" },
      text: placeholder
    }));
    values.forEach((value) => {
      select.appendChild(AppCore.createElement("option", {
        attrs: { value },
        text: value
      }));
    });
  }

  function populateFilters() {
    populateSelect(refs.reservaEstadoFilter, "Todos los estados", [...new Set(state.reservations.map((item) => item.estado).filter(Boolean))]);
    populateSelect(refs.reservaProyectoFilter, "Todos los proyectos", [...new Set(state.reservations.map((item) => item.unit?.proyecto).filter(Boolean))]);
    populateSelect(refs.reservaAgenteFilter, "Todos los agentes", [...new Set(state.reservations.map((item) => item.agente).filter(Boolean))]);
    populateSelect(refs.ventaEstadoFilter, "Todos los estados", [...new Set(state.sales.map((item) => item.estado_venta).filter(Boolean))]);
    populateSelect(refs.filtroProyecto, "Todos los proyectos", [...new Set(state.units.map((item) => item.proyecto).filter(Boolean))]);
    populateSelect(refs.filtroFase, "Todas las fases", [...new Set(state.units.map((item) => item.fase).filter(Boolean))]);
    populateSelect(refs.filtroManzana, "Todas las manzanas", [...new Set(state.units.map((item) => item.manzana).filter(Boolean))]);
  }

  function paginate(items, page) {
    const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    const safePage = Math.min(Math.max(1, page), totalPages);
    return {
      page: safePage,
      totalPages,
      items: items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
    };
  }

  function goToReservationsPage(page) {
    state.reservationsPage = Math.max(1, AppCore.safeNumber(page, 1));
    renderReservations();
  }

  function goToSalesPage(page) {
    state.salesPage = Math.max(1, AppCore.safeNumber(page, 1));
    renderSales();
  }

  function buildPagination(container, page, totalPages, onPageChange) {
    if (!container) return;
    AppCore.clearElement(container);
    if (totalPages <= 1) return;

    const prev = AppCore.createElement("button", {
      className: "pagination-btn",
      text: "Anterior",
      attrs: { type: "button", disabled: page <= 1 },
      events: {
        click: (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (page > 1) onPageChange(page - 1);
        }
      }
    });
    const next = AppCore.createElement("button", {
      className: "pagination-btn",
      text: "Siguiente",
      attrs: { type: "button", disabled: page >= totalPages },
      events: {
        click: (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (page < totalPages) onPageChange(page + 1);
        }
      }
    });

    AppCore.appendChildren(container, [
      prev,
      AppCore.createElement("span", { className: "pagination-label", text: `Página ${page} de ${totalPages}` }),
      next
    ]);
  }
  function getFilteredReservations() {
    const search = normalize(refs.reservaSearch?.value);
    const status = normalize(refs.reservaEstadoFilter?.value);
    const project = normalize(refs.reservaProyectoFilter?.value);
    const agent = normalize(refs.reservaAgenteFilter?.value);
    const fromDate = refs.reservaDateFrom?.value || "";
    const toDate = refs.reservaDateTo?.value || "";

    const filtered = state.reservations.filter((item) => {
      const blob = [item.cliente, item.agente, item.unitCode, item.commercialCode, item.projectLine, item.lotLine].join(" ").toLowerCase();
      const refDate = safeDate(item.referenceDate);
      if (search && !blob.includes(search)) return false;
      if (status && normalize(item.estado) !== status) return false;
      if (project && normalize(item.unit?.proyecto) !== project) return false;
      if (agent && normalize(item.agente) !== agent) return false;
      if (fromDate && refDate && refDate < safeDate(fromDate)) return false;
      if (toDate && refDate && refDate > safeDate(toDate)) return false;
      return true;
    });

    const sort = refs.reservaSort?.value || "recent";
    filtered.sort((left, right) => {
      if (sort === "oldest") return (safeDate(left.referenceDate)?.getTime() || 0) - (safeDate(right.referenceDate)?.getTime() || 0);
      if (sort === "amount_desc") return AppCore.safeNumber(right.monto_reserva) - AppCore.safeNumber(left.monto_reserva);
      if (sort === "amount_asc") return AppCore.safeNumber(left.monto_reserva) - AppCore.safeNumber(right.monto_reserva);
      if (sort === "client_asc") return String(left.cliente || "").localeCompare(String(right.cliente || ""));
      return (safeDate(right.referenceDate)?.getTime() || 0) - (safeDate(left.referenceDate)?.getTime() || 0);
    });

    return filtered;
  }

  function getFilteredSales() {
    const search = normalize(refs.ventaSearch?.value);
    const status = normalize(refs.ventaEstadoFilter?.value);
    const filtered = state.sales.filter((item) => {
      const blob = [item.cliente, item.agente, item.unitCode, item.projectLine].join(" ").toLowerCase();
      if (search && !blob.includes(search)) return false;
      if (status && normalize(item.estado_venta) !== status) return false;
      return true;
    });

    const sort = refs.ventaSort?.value || "recent";
    filtered.sort((left, right) => {
      if (sort === "amount_desc") return AppCore.safeNumber(right.precio_base) - AppCore.safeNumber(left.precio_base);
      if (sort === "amount_asc") return AppCore.safeNumber(left.precio_base) - AppCore.safeNumber(right.precio_base);
      if (sort === "balance_desc") return AppCore.safeNumber(right.saldo_restante) - AppCore.safeNumber(left.saldo_restante);
      if (sort === "client_asc") return String(left.cliente || "").localeCompare(String(right.cliente || ""));
      return (safeDate(right.fecha_venta)?.getTime() || 0) - (safeDate(left.fecha_venta)?.getTime() || 0);
    });

    return filtered;
  }

  function getFilteredUnits() {
    const project = normalize(refs.filtroProyecto?.value);
    const phase = normalize(refs.filtroFase?.value);
    const block = normalize(refs.filtroManzana?.value);
    const status = normalize(refs.filtroEstado?.value);
    const search = normalize(refs.buscarLote?.value);

    return state.units.filter((item) => {
      const blob = `${item.codigo} ${item.manzana}-${item.lote}`.toLowerCase();
      if (project && normalize(item.proyecto) !== project) return false;
      if (phase && normalize(item.fase) !== phase) return false;
      if (block && normalize(item.manzana) !== block) return false;
      if (status && normalize(item.estado) !== status) return false;
      if (search && !blob.includes(search)) return false;
      return true;
    });
  }

  function getReservationById(id) {
    return state.reservations.find((item) => item.id === id) || null;
  }

  function normalizeSaleTypeValue(value) {
    const normalized = normalize(value);
    if (normalized.includes("financ")) return "financiamiento";
    if (normalized.includes("cont")) return "contado";
    return "";
  }

  function isFinancingSaleType(value) {
    return normalize(value).includes("financ");
  }

  function getTodayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function isIsoDateInput(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
  }

  function buildInlineField(label, control) {
    return AppCore.createElement("div", { className: "neg-field-pro" }, [
      AppCore.createElement("label", { text: label }),
      control
    ]);
  }

  function getSaleInlineForm() {
    return document.getElementById("formCuota");
  }

  function closeSaleInlineForm() {
    const form = getSaleInlineForm();
    if (!form) return;
    form.dataset.open = "0";
    form.classList.add("hidden");
    AppCore.clearElement(form);
  }

  function renderSaleInlineForm(config) {
    const form = getSaleInlineForm();
    if (!form) return;

    form.dataset.open = "1";
    form.classList.remove("hidden");
    AppCore.clearElement(form);

    const bodySections = Array.isArray(config.sections) ? config.sections : [];
    const actions = Array.isArray(config.actions) ? config.actions : [];
    const title = config.title || "";
    const description = config.description || "";

    const card = AppCore.createElement("div", { className: "negociacion-card-pro cuota-form-card" }, [
      AppCore.createElement("div", { className: "neg-card-head" }, [
        AppCore.createElement("div", {}, [
          AppCore.createElement("h4", { text: title }),
          AppCore.createElement("p", { className: "form-note-pro", text: description })
        ])
      ]),
      ...bodySections,
      AppCore.createElement("div", { className: "form-actions-pro" }, actions)
    ]);

    form.appendChild(card);
  }

  function invalidateSaleQuotaContext(ventaId = "") {
    if (ventaId) {
      saleQuotaContextCache.delete(String(ventaId));
      return;
    }
    saleQuotaContextCache.clear();
  }

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function parseIsoDateParts(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (
      Number.isNaN(date.getTime()) ||
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }
    return date;
  }

  function formatIsoDateParts(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function addMonthsKeepingDay(baseDate, monthsToAdd) {
    const target = new Date(baseDate.getTime());
    const day = target.getDate();
    target.setDate(1);
    target.setMonth(target.getMonth() + monthsToAdd);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(day, lastDay));
    return target;
  }

  function addQuotaFrequency(dateIso, frequency, offset) {
    const baseDate = parseIsoDateParts(dateIso);
    if (!baseDate) return "";
    if (frequency === "quincenal") {
      const nextDate = new Date(baseDate.getTime());
      nextDate.setDate(nextDate.getDate() + (offset * 15));
      return formatIsoDateParts(nextDate);
    }
    return formatIsoDateParts(addMonthsKeepingDay(baseDate, offset));
  }

  function getSuggestedQuotaStartDate(quotas = []) {
    const latestDate = quotas
      .map((quota) => quota.fecha_vencimiento || quota.fecha || "")
      .filter(Boolean)
      .sort()
      .pop();
    return latestDate || getTodayIso();
  }

  async function loadSaleQuotaContext(ventaId, { force = false } = {}) {
    const key = String(ventaId || "");
    if (!key) {
      throw new Error("Venta invalida.");
    }

    if (!force && saleQuotaContextCache.has(key)) {
      return saleQuotaContextCache.get(key);
    }

    const [detail, quotasRaw] = await Promise.all([
      adminRequest({ query: { venta_id: key } }),
      adminRequest({ query: { cuotas_venta: key } })
    ]);

    const quotas = Array.isArray(quotasRaw) ? quotasRaw.slice() : [];
    quotas.sort((left, right) => AppCore.safeNumber(left.numero_cuota || left.numero) - AppCore.safeNumber(right.numero_cuota || right.numero));

    const quotaNumbers = quotas
      .map((quota) => AppCore.safeNumber(quota.numero_cuota || quota.numero))
      .filter((value) => Number.isInteger(value) && value > 0);
    const highestNumber = quotaNumbers.length ? Math.max(...quotaNumbers) : 0;

    const context = {
      ventaId: key,
      detail,
      quotas,
      totalFinanciado: AppCore.safeNumber(detail?.saldo_financiado),
      totalProgramado: AppCore.safeNumber(detail?.total_programado_cuotas),
      saldoPendienteProgramar: AppCore.safeNumber(detail?.saldo_pendiente_programar),
      totalPagado: AppCore.safeNumber(detail?.total_pagado),
      saldoPendientePago: AppCore.safeNumber(detail?.saldo_pendiente_pago ?? detail?.saldo_restante),
      nextQuotaNumber: AppCore.safeNumber(detail?.siguiente_numero_cuota) > 0
        ? AppCore.safeNumber(detail?.siguiente_numero_cuota)
        : highestNumber + 1,
      suggestedFirstDate: getSuggestedQuotaStartDate(quotas),
      highestQuotaNumber: highestNumber,
      quotaNumbers: new Set(quotaNumbers)
    };

    saleQuotaContextCache.set(key, context);
    return context;
  }

  function buildQuotaSummaryStrip(context) {
    return AppCore.createElement("div", { className: "neg-summary-pro quota-summary-strip" }, [
      AppCore.createElement("div", { className: "neg-summary-pill" }, [
        AppCore.createElement("span", { text: "Saldo financiado" }),
        AppCore.createElement("strong", { text: formatMoney(context.totalFinanciado) })
      ]),
      AppCore.createElement("div", { className: "neg-summary-pill" }, [
        AppCore.createElement("span", { text: "Total programado" }),
        AppCore.createElement("strong", { text: formatMoney(context.totalProgramado) })
      ]),
      AppCore.createElement("div", { className: "neg-summary-pill" }, [
        AppCore.createElement("span", { text: "Pendiente por programar" }),
        AppCore.createElement("strong", { text: formatMoney(context.saldoPendienteProgramar) })
      ])
    ]);
  }

  function buildQuotaModeSwitch(ventaId, activeMode) {
    const wrapper = AppCore.createElement("div", { className: "quota-mode-switch" });
    [
      { id: "manual", label: "Manual" },
        { id: "automatico", label: "Distribución automática" }
    ].forEach((mode) => {
      const button = AppCore.createElement("button", {
        className: activeMode === mode.id ? "btn-primary" : "btn-outline",
        text: mode.label,
        attrs: { type: "button" },
        events: { click: () => window.mostrarFormularioCuota && window.mostrarFormularioCuota(ventaId, mode.id) }
      });
      wrapper.appendChild(button);
    });
    return wrapper;
  }

  function buildQuotaDrafts(context, count, firstDate, frequency) {
    if (!Number.isInteger(count) || count <= 0) {
      throw new Error("Cantidad de cuotas invalida.");
    }

    if (!isIsoDateInput(firstDate) || !parseIsoDateParts(firstDate)) {
      throw new Error("Falta la fecha de primera cuota.");
    }

    const remaining = AppCore.safeNumber(context.saldoPendienteProgramar);
    if (remaining <= 0) {
      throw new Error("No existe saldo pendiente por programar.");
    }

    const totalCents = Math.round(remaining * 100);
    const baseCents = Math.floor(totalCents / count);
    const drafts = [];

    for (let index = 0; index < count; index += 1) {
      const amountCents = index === count - 1
        ? totalCents - (baseCents * (count - 1))
        : baseCents;
      drafts.push({
        numero_cuota: context.nextQuotaNumber + index,
        monto_programado: amountCents / 100,
        fecha_vencimiento: addQuotaFrequency(firstDate, frequency, index)
      });
    }

    return drafts;
  }

  function renderAutoQuotaPreview(context) {
    const preview = document.getElementById("autoQuotaPreview");
    if (!preview) return;

    const count = AppCore.safeNumber(document.getElementById("autoQuotaCount")?.value);
    const firstDate = document.getElementById("autoQuotaFirstDate")?.value || "";
    const frequency = document.getElementById("autoQuotaFrequency")?.value || "mensual";

    AppCore.clearElement(preview);
    preview.className = "quota-preview-shell";

    try {
      const drafts = buildQuotaDrafts(context, count, firstDate, frequency);
      const previewList = AppCore.createElement("div", { className: "quota-preview-list" }, drafts.slice(0, 6).map((draft) =>
        AppCore.createElement("div", { className: "quota-preview-row" }, [
          AppCore.createElement("strong", { text: `Cuota ${draft.numero_cuota}` }),
          AppCore.createElement("span", { text: `${formatMoney(draft.monto_programado)} - ${formatDate(draft.fecha_vencimiento, "medium")}` })
        ])
      ));

      const footer = drafts.length > 6
        ? AppCore.createElement("div", { className: "form-note-pro", text: `Se previsualizan 6 de ${drafts.length} cuotas.` })
        : null;

      AppCore.appendChildren(preview, [
        AppCore.createElement("div", { className: "form-note-pro" }, [
          AppCore.createElement("strong", { text: `${drafts.length} cuotas` }),
          ` por ${formatMoney(context.saldoPendienteProgramar)}. La última cuota absorberá cualquier diferencia de redondeo.`
        ]),
        previewList,
        footer
      ].filter(Boolean));
    } catch (error) {
      preview.textContent = error.message || "Completa los datos para ver la previsualización.";
      preview.className = "quota-preview-shell inline-alert tone-warning";
    }
  }

  function closeNegotiationShell(id) {
    const shell = document.getElementById(`neg-${id}`);
    if (!shell) return;
    shell.dataset.open = "0";
    AppCore.clearElement(shell);
  }

  function syncNegotiationFormState(id) {
    const typeSelect = document.getElementById(`tipo_venta_${id}`);
    const cuotasInput = document.getElementById(`numero_cuotas_${id}`);
    const fechaInput = document.getElementById(`fecha_inicio_${id}`);
    const helper = document.getElementById(`neg_help_${id}`);
    const isFinancing = isFinancingSaleType(typeSelect?.value || "");

    if (cuotasInput) {
      cuotasInput.disabled = !isFinancing;
      cuotasInput.required = isFinancing;
      if (!isFinancing) cuotasInput.value = "0";
    }

    if (fechaInput) {
      fechaInput.disabled = !isFinancing;
      if (!isFinancing) {
        fechaInput.value = "";
      } else if (!fechaInput.value) {
        fechaInput.value = getTodayIso();
      }
    }

    if (helper) {
      helper.textContent = isFinancing
        ? "Para financiamiento debes indicar cuotas y, de ser posible, una fecha de inicio de pagos."
        : "En contado solo se guardan precio final, monto inicial y observaciones.";
    }
  }

  function showNegotiationForm(id) {
    const item = getReservationById(id);
    const shell = document.getElementById(`neg-${id}`);
    if (!item || !shell) return;

    if (shell.dataset.open === "1") {
      closeNegotiationShell(id);
      return;
    }

    const priceValue = AppCore.safeNumber(item.precio_final) > 0
      ? AppCore.safeNumber(item.precio_final)
      : AppCore.safeNumber(item.priceReference);
    const typeValue = normalizeSaleTypeValue(item.tipo_venta);
    const initialValue = AppCore.safeNumber(item.monto_inicial);
    const cuotasValue = AppCore.safeNumber(item.numero_cuotas);
    const saldoEstimado = Math.max(0, priceValue - AppCore.safeNumber(item.monto_reserva) - initialValue);

    AppCore.clearElement(shell);
    shell.dataset.open = "1";

    const typeSelect = AppCore.createElement("select", { attrs: { id: `tipo_venta_${id}` } });
    [
      { value: "", label: "Seleccionar" },
      { value: "contado", label: "Contado" },
      { value: "financiamiento", label: "Financiamiento" }
    ].forEach((option) => {
      typeSelect.appendChild(AppCore.createElement("option", {
        text: option.label,
        attrs: {
          value: option.value,
          selected: option.value === typeValue ? "selected" : null
        }
      }));
    });
    typeSelect.addEventListener("change", () => syncNegotiationFormState(id));

    const summaryCards = AppCore.createElement("div", { className: "neg-summary-pro" }, [
      AppCore.createElement("div", { className: "neg-summary-pill" }, [
        AppCore.createElement("span", { text: "Reserva" }),
        AppCore.createElement("strong", { text: formatMoney(item.monto_reserva) })
      ]),
      AppCore.createElement("div", { className: "neg-summary-pill" }, [
        AppCore.createElement("span", { text: "Precio de referencia" }),
        AppCore.createElement("strong", { text: formatMoney(priceValue) })
      ]),
      AppCore.createElement("div", { className: "neg-summary-pill" }, [
        AppCore.createElement("span", { text: "Saldo estimado" }),
        AppCore.createElement("strong", { text: formatMoney(saldoEstimado) })
      ])
    ]);

    const card = AppCore.createElement("div", { className: "negociacion-card-pro" }, [
      AppCore.createElement("div", { className: "neg-card-head" }, [
        AppCore.createElement("div", {}, [
        AppCore.createElement("h4", { text: "Negociación comercial" }),
          AppCore.createElement("p", {
            className: "form-note-pro",
            text: "El formulario se precarga con el precio vigente para evitar envios incompletos al backend."
          })
        ]),
        createStatusPill(item.statusMeta.label, item.statusMeta.tone)
      ]),
      summaryCards,
      AppCore.createElement("div", { className: "neg-grid-pro" }, [
        buildInlineField("Precio final", AppCore.createElement("input", {
          attrs: {
            id: `precio_final_${id}`,
            type: "number",
            min: "0",
            step: "0.01",
            value: priceValue > 0 ? String(priceValue) : ""
          }
        })),
        buildInlineField("Tipo de venta", typeSelect),
        buildInlineField("Monto inicial", AppCore.createElement("input", {
          attrs: {
            id: `monto_inicial_${id}`,
            type: "number",
            min: "0",
            step: "0.01",
            value: initialValue > 0 ? String(initialValue) : "0"
          }
        })),
        buildInlineField("Numero de cuotas", AppCore.createElement("input", {
          attrs: {
            id: `numero_cuotas_${id}`,
            type: "number",
            min: "0",
            step: "1",
            value: cuotasValue > 0 ? String(cuotasValue) : "0"
          }
        })),
        buildInlineField("Inicio de pagos", AppCore.createElement("input", {
          attrs: {
            id: `fecha_inicio_${id}`,
            type: "date",
            value: item.fecha_inicio_pagos || (typeValue === "financiamiento" ? getTodayIso() : "")
          }
        })),
        buildInlineField("Observaciones", AppCore.createElement("textarea", {
          attrs: {
            id: `obs_${id}`,
            rows: "3",
          placeholder: "Notas internas de la negociación"
          },
          text: item.observaciones || ""
        }))
      ]),
      AppCore.createElement("div", {
        className: "form-note-pro",
        attrs: { id: `neg_help_${id}` }
      }),
      AppCore.createElement("div", { className: "form-actions-pro" }, [
        AppCore.createElement("button", {
          className: "btn-primary",
          text: "Guardar negociación",
          attrs: { type: "button" },
          events: { click: () => window.guardarNegociacion && window.guardarNegociacion(id) }
        }),
        AppCore.createElement("button", {
          className: "btn-outline",
          text: "Cancelar",
          attrs: { type: "button" },
          events: { click: () => closeNegotiationShell(id) }
        })
      ])
    ]);

    shell.appendChild(card);
    syncNegotiationFormState(id);
  }

  function isClosedReservationState(item) {
    const status = normalize(item.estado);
    return item.statusMeta.isExpired
      || status.includes("rech")
      || status.includes("cancel")
      || status.includes("convert");
  }

  function canOpenNegotiationForReservation(item) {
    const status = normalize(item.estado);
    if (item.puede_validar) return false;
    if (isClosedReservationState(item)) return false;
    return Boolean(item.puede_negociar)
      || status.includes("confirm")
      || status.includes("reserv")
      || status.includes("negoci")
      || Boolean(item.tipo_venta)
      || Boolean(item.puede_convertir);
  }

  function canOpenVoucherForReservation(item) {
    const status = normalize(item.estado);
    return Boolean(item.boleta_url)
      || Boolean(item.boleta_emitida)
      || status.includes("confirm")
      || status.includes("reserv")
      || status.includes("negoci");
  }

  function openReservationVoucher(item) {
    if (item.boleta_url) {
      window.open(item.boleta_url, "_blank", "noopener,noreferrer");
      return;
    }
    window.location.href = `/preview-boleta.html?id=${encodeURIComponent(item.id)}`;
  }

  function buildReservationActions(item) {
    const actions = AppCore.createElement("div", { className: "collection-actions-row" });
    actions.appendChild(AppCore.createElement("a", {
      className: "btn-outline",
      text: "Ver ficha",
      attrs: { href: `/ver-reserva-admin.html?id=${encodeURIComponent(item.id)}` }
    }));

    if (item.puede_validar) {
      actions.appendChild(AppCore.createElement("button", {
        className: "btn-primary",
        text: "Confirmar",
        attrs: { type: "button" },
        events: { click: () => window.validar && window.validar(item.id) }
      }));
    }

    if (item.puede_rechazar) {
      actions.appendChild(AppCore.createElement("button", {
        className: "btn-danger",
        text: "Rechazar",
        attrs: { type: "button" },
        events: { click: () => window.rechazar && window.rechazar(item.id, item.unit?.recordId) }
      }));
    }

    if (canOpenNegotiationForReservation(item)) {
      actions.appendChild(AppCore.createElement("button", {
        className: "btn-outline",
        text: "Negociar",
        attrs: { type: "button" },
        events: { click: () => window.mostrarNegociacion && window.mostrarNegociacion(item.id) }
      }));
    }

    if (canOpenVoucherForReservation(item)) {
      actions.appendChild(AppCore.createElement("button", {
        className: item.boleta_emitida ? "btn-outline" : "btn-boleta",
        text: "Boleta",
        attrs: { type: "button" },
        events: { click: () => openReservationVoucher(item) }
      }));
    }

    if (item.puede_convertir && AppCore.safeNumber(item.priceReference) > 0) {
      const convertButton = AppCore.createElement("button", {
        className: "btn-primary",
        text: "Convertir a venta",
        attrs: { type: "button" }
      });
      convertButton.addEventListener("click", () => window.convertirVenta && window.convertirVenta(item.id, convertButton));
      actions.appendChild(convertButton);
    }

    return actions;
  }

  function createReservationCard(item) {
    const deadlineText = item.statusMeta.deadlineDate
      ? `${item.statusMeta.deadlineLabel}: ${formatDate(item.statusMeta.deadlineDate)}`
      : "Sin plazo activo";
    const extensionSummary = item.extension_usada
      ? "Extensión ya utilizada"
      : item.extension_pendiente
        ? "Extensión pendiente"
        : "Sin extensión";

    const card = AppCore.createElement("article", { className: "reservation-card-admin" }, [
      AppCore.createElement("div", { className: "collection-card-head" }, [
        AppCore.createElement("div", { className: "collection-card-title-wrap" }, [
          AppCore.createElement("div", { className: "collection-card-code", text: item.commercialCode }),
          AppCore.createElement("h3", { className: "collection-card-title", text: item.cliente || "Cliente no disponible" }),
          AppCore.createElement("p", { className: "collection-card-sub", text: [item.unitCode, item.projectLine, item.lotLine].filter(Boolean).join(" · ") || "Sin referencia de unidad" })
        ]),
        createStatusPill(item.statusMeta.label, item.statusMeta.tone)
      ]),
      AppCore.createElement("div", { className: "collection-stats-grid" }, [
        createMetaPill("Agente", item.agente || "No disponible"),
        createMetaPill("Reserva", formatMoney(item.monto_reserva)),
        createMetaPill("Precio ref.", formatMoney(item.priceReference)),
        createMetaPill("Fecha", formatDate(item.referenceDate)),
        createMetaPill(item.statusMeta.deadlineLabel, item.statusMeta.deadlineDate ? formatDate(item.statusMeta.deadlineDate) : "Sin plazo", item.statusMeta.isExpiringSoon ? "pending" : item.statusMeta.isExpired ? "rejected" : "neutral"),
        createMetaPill("Extensión", extensionSummary, item.extension_usada ? "premium" : item.extension_pendiente ? "pending" : "neutral")
      ])
    ]);

    if (item.observaciones || item.statusMeta.isExpiringSoon || item.statusMeta.isExpired || item.extension_pendiente || item.extension_usada) {
      const alertText = item.statusMeta.isExpired
        ? `${item.statusMeta.deadlineLabel} vencida hace ${Math.max(1, AppCore.safeNumber(item.dias_vencidos))} día(s).`
        : item.statusMeta.isExpiringSoon
          ? item.statusMeta.daysUntilExpiry === 0
            ? `${item.statusMeta.deadlineLabel} vence hoy.`
            : `${item.statusMeta.deadlineLabel} vence en ${item.statusMeta.daysUntilExpiry} día(s).`
          : item.extension_pendiente
            ? `Hay una solicitud de extensión pendiente${item.deposito_extension_cumplido ? " con depósito validado" : " sin depósito suficiente"}.`
            : item.extension_usada
              ? "La reserva ya consumió su única extensión comercial."
              : item.observaciones;
      card.appendChild(AppCore.createElement("div", {
        className: `inline-alert tone-${item.statusMeta.isExpired ? "rejected" : item.statusMeta.isExpiringSoon || item.extension_pendiente ? "pending" : item.extension_usada ? "premium" : "neutral"}`
      }, [
        AppCore.createElement("strong", { text: item.statusMeta.isExpired ? "Vencida" : item.statusMeta.isExpiringSoon ? "Por vencer" : item.extension_pendiente ? "Extensión" : item.extension_usada ? "Control de plazo" : "Observación" }),
        AppCore.createElement("span", { text: alertText || deadlineText })
      ]));
    }

    card.appendChild(buildReservationActions(item));
    card.appendChild(AppCore.createElement("div", { className: "inline-form-shell", attrs: { id: `neg-${item.id}` } }));
    return card;
  }

  function createSaleCard(item) {
    const card = AppCore.createElement("article", { className: "sale-card-admin" }, [
      AppCore.createElement("div", { className: "collection-card-head" }, [
        AppCore.createElement("div", { className: "collection-card-title-wrap" }, [
          AppCore.createElement("div", { className: "collection-card-code", text: item.unitCode }),
          AppCore.createElement("h3", { className: "collection-card-title", text: item.cliente || "Cliente no disponible" }),
          AppCore.createElement("p", { className: "collection-card-sub", text: [item.agente, item.projectLine].filter(Boolean).join(" · ") || "Sin referencia adicional" })
        ]),
        createStatusPill(item.statusMeta.label, item.statusMeta.tone)
      ]),
      AppCore.createElement("div", { className: "collection-stats-grid" }, [
        createMetaPill("Precio base", formatMoney(item.precio_base)),
        createMetaPill("Cobrado", formatMoney(item.totalPaid), item.progress >= 100 ? "confirmed" : "active"),
        createMetaPill("Saldo", formatMoney(item.saldo_restante), item.saldo_restante > 0 ? "pending" : "confirmed"),
        createMetaPill("Tipo", item.tipo_venta || "No definido"),
        createMetaPill("Fecha", formatDate(item.fecha_venta)),
        createMetaPill("Próxima cuota", item.proxima_cuota ? formatDate(item.proxima_cuota) : "Sin cronograma", item.cuotas_morosas > 0 ? "rejected" : item.cuotas_vencidas > 0 ? "pending" : "neutral")
      ]),
      AppCore.createElement("div", { className: "progress-track" }, [
        AppCore.createElement("div", { className: "progress-fill", attrs: { style: `width:${item.progress}%;` } })
      ]),
      AppCore.createElement("div", { className: "progress-caption", text: `${item.progress}% cobrado` }),
      AppCore.createElement("div", { className: "collection-actions-row" }, [
        AppCore.createElement("button", { className: "btn-primary", text: "Gestionar venta", attrs: { type: "button" }, events: { click: () => window.verVenta && window.verVenta(item.id) } })
      ])
    ]);

    if (item.cuotas_morosas > 0 || item.cuotas_vencidas > 0) {
      card.appendChild(AppCore.createElement("div", {
        className: `inline-alert tone-${item.cuotas_morosas > 0 ? "rejected" : "pending"}`
      }, [
        AppCore.createElement("strong", { text: item.cuotas_morosas > 0 ? "Mora detectada" : "Cuotas vencidas" }),
        AppCore.createElement("span", {
          text: item.cuotas_morosas > 0
            ? `${item.cuotas_morosas} cuota(s) en mora requieren atención inmediata.`
            : `${item.cuotas_vencidas} cuota(s) vencidas requieren seguimiento.`
        })
      ]));
    }

    return card;
  }

  function createExtensionCard(item, pending) {
    const statusMeta = getExtensionStatusMeta(item.estado_extension);
    const card = AppCore.createElement("article", { className: "extension-ticket" }, [
      AppCore.createElement("div", { className: "extension-ticket-head" }, [
        AppCore.createElement("div", {}, [
          AppCore.createElement("strong", { text: item.cliente || "Cliente no disponible" }),
          AppCore.createElement("div", { className: "extension-ticket-sub", text: [item.unidad_codigo, item.agente].filter(Boolean).join(" · ") || "Sin referencia" })
        ]),
        createStatusPill(statusMeta.label, statusMeta.tone)
      ]),
      AppCore.createElement("div", { className: "collection-stats-grid compact" }, [
        createMetaPill("Reserva", item.reserva_id || item.reserva_record_id || "-", "neutral"),
        createMetaPill("Monto", formatMoney(item.monto_adicional), item.depositoCumplido ? "premium" : "pending"),
        createMetaPill("Estado reserva", item.estado_reserva || "Sin estado", normalize(item.estado_reserva).includes("venc") ? "rejected" : "neutral"),
        createMetaPill("Vigencia", item.fecha_limite_reserva ? formatDate(item.fecha_limite_reserva) : "Sin vigencia", "neutral")
      ])
    ]);

    if (item.comentarios) {
      card.appendChild(AppCore.createElement("p", { className: "extension-ticket-note", text: item.comentarios }));
    }

    if (!item.depositoCumplido || item.extension_usada) {
      card.appendChild(AppCore.createElement("div", {
        className: `inline-alert tone-${item.extension_usada ? "premium" : "pending"}`
      }, [
        AppCore.createElement("strong", { text: item.extension_usada ? "Extensión usada" : "Depósito pendiente" }),
        AppCore.createElement("span", {
          text: item.extension_usada
            ? "La reserva ya utilizó su única extensión comercial."
            : `Se requiere confirmar el depósito mínimo de ${formatMoney(item.deposito_requerido || 2500)} para aprobar.`
        })
      ]));
    }

    const actions = AppCore.createElement("div", { className: "collection-actions-row" });
    if (item.voucherUrl) {
      actions.appendChild(AppCore.createElement("a", {
        className: "btn-outline",
        text: "Ver sustento",
        attrs: { href: item.voucherUrl, target: "_blank", rel: "noopener noreferrer" }
      }));
    }
    if (pending) {
      actions.appendChild(AppCore.createElement("button", {
        className: "btn-primary",
        text: "Aprobar",
        attrs: { type: "button" },
        events: { click: () => window.aprobarExtension && window.aprobarExtension(item.id) }
      }));
      actions.appendChild(AppCore.createElement("button", {
        className: "btn-danger",
        text: "Rechazar",
        attrs: { type: "button" },
        events: { click: () => window.rechazarExtension && window.rechazarExtension(item.id) }
      }));
    }
    if (actions.childNodes.length) {
      card.appendChild(actions);
    }
    return card;
  }
  function createUnitCard(item) {
    const card = AppCore.createElement("article", { className: `unidad-card estado-${normalize(item.estado)}` }, [
      AppCore.createElement("h3", { text: item.codigo || `${item.manzana}-${item.lote}` }),
      AppCore.createElement("div", { className: "unidad-info", text: [item.proyecto, item.fase ? `Fase ${item.fase}` : "", item.manzana ? `Mz. ${item.manzana}` : "", item.lote ? `Lt. ${item.lote}` : ""].filter(Boolean).join(" · ") })
    ]);

    card.appendChild(AppCore.createElement("label", { className: "unit-field-label", text: "Área" }));
    card.appendChild(AppCore.createElement("input", { attrs: { id: `area-${item.id}`, type: "number", value: AppCore.safeNumber(item.area) } }));
    card.appendChild(AppCore.createElement("label", { className: "unit-field-label", text: "Precio" }));
    card.appendChild(AppCore.createElement("input", { attrs: { id: `precio-${item.id}`, type: "number", value: AppCore.safeNumber(item.precio) } }));
    card.appendChild(AppCore.createElement("label", { className: "unit-field-label", text: "Estado" }));
    card.appendChild(buildStateSelect(item));
    card.appendChild(AppCore.createElement("button", { className: "btn-primary", text: "Guardar", attrs: { type: "button" }, events: { click: () => updateUnit(item.id) } }));
    return card;
  }
  function renderSalesChart() {
    if (!refs.chartCanvas || typeof window.Chart === "undefined") return;
    const context = typeof refs.chartCanvas.getContext === "function"
      ? refs.chartCanvas.getContext("2d")
      : null;
    if (!context) return;

    const sales = [...state.sales].sort((a, b) => (safeDate(a.fecha_venta)?.getTime() || 0) - (safeDate(b.fecha_venta)?.getTime() || 0));
    let sold = 0;
    let paid = 0;
    const labels = [];
    const soldData = [];
    const paidData = [];

    sales.forEach((sale, index) => {
      sold += AppCore.safeNumber(sale.precio_base);
      paid += AppCore.safeNumber(sale.totalPaid);
      labels.push(sale.fecha_venta ? formatDate(sale.fecha_venta, "short") : `Venta ${index + 1}`);
      soldData.push(sold);
      paidData.push(paid);
    });

    if (state.chart && typeof state.chart.destroy === "function") {
      state.chart.destroy();
    }

    state.chart = new window.Chart(context, {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "Monto vendido", data: soldData, borderColor: "#c6a85a", backgroundColor: "rgba(198,168,90,0.12)", fill: true, tension: 0.35, pointRadius: 3 },
          { label: "Monto cobrado", data: paidData, borderColor: "#34d399", backgroundColor: "rgba(52,211,153,0.1)", fill: true, tension: 0.35, pointRadius: 3 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: "#cbd5e1" } } },
        scales: {
          x: { grid: { color: "rgba(255,255,255,0.03)" }, ticks: { color: "#94a3b8" } },
          y: { grid: { color: "rgba(255,255,255,0.03)" }, ticks: { color: "#94a3b8", callback: (value) => `S/ ${Number(value).toLocaleString()}` } }
        }
      }
    });
  }

  function renderDashboard() {
    if (!refs.dashboardKpis || !refs.dashboardHighlights) return;
    const totalSold = state.sales.reduce((sum, item) => sum + AppCore.safeNumber(item.precio_base), 0);
    const totalPending = state.sales.reduce((sum, item) => sum + AppCore.safeNumber(item.saldo_restante), 0);
    const activeSales = state.sales.filter((item) => !["cerrada", "cancelada", "bloqueada"].includes(normalize(item.estado_venta))).length;
    const closedSales = state.sales.filter((item) => normalize(item.estado_venta).includes("cerr")).length;
    const delinquentSales = state.sales.filter((item) => normalize(item.estado_venta).includes("mora")).length;
    const activeReservations = state.reservations.filter((item) => ["confirmada", "negociacion"].includes(normalize(item.etapa))).length;
    const pendingReservations = state.reservations.filter((item) => normalize(item.etapa) === "pendiente_confirmacion").length;
    const expiringReservations = state.reservations.filter((item) => item.statusMeta.isExpiringSoon).length;
    const pendingExtensions = state.extensions.filter((item) => normalize(item.estado_extension) === "solicitud").length;

    clearAndAppend(refs.dashboardKpis, [
      { title: "Reservas activas", value: activeReservations, note: `${pendingReservations} pendientes de confirmación`, tone: "active" },
      { title: "Reservas por vencer", value: expiringReservations, note: "Vigencia dentro de 3 días", tone: expiringReservations > 0 ? "pending" : "neutral" },
      { title: "Ventas activas", value: activeSales, note: `${closedSales} cerradas`, tone: "confirmed" },
      { title: "Monto vendido", value: formatMoney(totalSold), note: `${state.sales.length} operaciones`, tone: "premium" },
      { title: "Saldo pendiente", value: formatMoney(totalPending), note: "Por cobrar", tone: totalPending > 0 ? "pending" : "confirmed" },
      { title: "Ventas morosas", value: delinquentSales, note: "Seguimiento urgente", tone: delinquentSales > 0 ? "rejected" : "neutral" },
      { title: "Extensiones pendientes", value: pendingExtensions, note: "Solicitudes por responder", tone: pendingExtensions > 0 ? "pending" : "neutral" }
    ].map((item) => AppCore.createElement("div", { className: `kpi-card-admin tone-${item.tone}` }, [
      AppCore.createElement("div", { className: "kpi-card-label", text: item.title }),
      AppCore.createElement("div", { className: "kpi-card-value", text: String(item.value) }),
      AppCore.createElement("div", { className: "kpi-card-note", text: item.note })
    ])));

    clearAndAppend(refs.dashboardHighlights, [
      AppCore.createElement("div", { className: "insight-card" }, [
        AppCore.createElement("div", { className: "insight-title", text: "Foco del día" }),
        AppCore.createElement("strong", { text: expiringReservations > 0 ? "Reservas por vencer" : "Operación estable" }),
        AppCore.createElement("p", { text: expiringReservations > 0 ? `${expiringReservations} reservas requieren seguimiento inmediato.` : "No hay alertas críticas de vigencia." })
      ]),
      AppCore.createElement("div", { className: "insight-card" }, [
        AppCore.createElement("div", { className: "insight-title", text: "Cobro proyectado" }),
        AppCore.createElement("strong", { text: formatMoney(totalPending) }),
        AppCore.createElement("p", { text: "Saldo acumulado de ventas todavía activas." })
      ]),
      AppCore.createElement("div", { className: "insight-card" }, [
        AppCore.createElement("div", { className: "insight-title", text: "Pendientes operativos" }),
        AppCore.createElement("strong", { text: String(pendingReservations + pendingExtensions) }),
        AppCore.createElement("p", { text: "Reservas y extensiones pendientes de gestión." })
      ])
    ]);

    setDashboardStamp(`Actualizado ${formatDateTime(new Date().toISOString())}`);
    try {
      renderSalesChart();
    } catch (error) {
      console.error("admin.page renderSalesChart", error);
    }
  }
  function renderReservations() {
    const filtered = getFilteredReservations();
    const paginated = paginate(filtered, state.reservationsPage);
    state.reservationsPage = paginated.page;
    if (refs.reservasSummaryChip) refs.reservasSummaryChip.textContent = `${filtered.length} resultados`;
    clearAndAppend(refs.reservasMeta, [
      createMetaPill("Mostrando", `${paginated.items.length} de ${filtered.length}`),
      createMetaPill("Pendientes", String(filtered.filter((item) => normalize(item.etapa) === "pendiente_confirmacion").length), "pending"),
      createMetaPill("Por vencer", String(filtered.filter((item) => item.statusMeta.isExpiringSoon).length), "pending")
    ]);
    if (!paginated.items.length) {
      AppCore.clearElement(refs.reservasPagination);
      return renderEmpty(refs.reservasContainer, "Sin reservas", "No hay reservas para este filtro.");
    }
    clearAndAppend(refs.reservasContainer, paginated.items.map(createReservationCard));
    buildPagination(refs.reservasPagination, paginated.page, paginated.totalPages, (page) => goToReservationsPage(page));
  }

  function renderSales() {
    const filtered = getFilteredSales();
    const paginated = paginate(filtered, state.salesPage);
    state.salesPage = paginated.page;
    if (refs.ventasSummaryChip) refs.ventasSummaryChip.textContent = `${filtered.length} ventas`;
    clearAndAppend(refs.ventasMeta, [
      createMetaPill("Mostrando", `${paginated.items.length} de ${filtered.length}`),
      createMetaPill("Activas", String(filtered.filter((item) => !["cerrada", "cancelada", "bloqueada"].includes(normalize(item.estado_venta))).length), "active"),
      createMetaPill("Morosas", String(filtered.filter((item) => normalize(item.estado_venta).includes("mora")).length), "rejected"),
      createMetaPill("Pendiente total", formatMoney(filtered.reduce((sum, item) => sum + AppCore.safeNumber(item.saldo_restante), 0)), "pending")
    ]);
    if (!paginated.items.length) {
      AppCore.clearElement(refs.ventasPagination);
      return renderEmpty(refs.ventasContainer, "Sin ventas", "No hay ventas para este filtro.");
    }
    clearAndAppend(refs.ventasContainer, paginated.items.map(createSaleCard));
    buildPagination(refs.ventasPagination, paginated.page, paginated.totalPages, (page) => goToSalesPage(page));
  }

  function renderExtensions() {
    const pending = state.extensions.filter((item) => normalize(item.estado_extension) === "solicitud");
    const approved = state.extensions.filter((item) => normalize(item.estado_extension) === "aprobada");
    const rejected = state.extensions.filter((item) => normalize(item.estado_extension) === "rechazada");
    if (refs.extSummaryChip) refs.extSummaryChip.textContent = `${state.extensions.length} solicitudes`;
    if (refs.extPendingCount) refs.extPendingCount.textContent = String(pending.length);
    if (refs.extApprovedCount) refs.extApprovedCount.textContent = String(approved.length);
    if (refs.extRejectedCount) refs.extRejectedCount.textContent = String(rejected.length);
    pending.length ? clearAndAppend(refs.extPendientes, pending.map((item) => createExtensionCard(item, true))) : renderEmpty(refs.extPendientes, "Sin pendientes", "No hay solicitudes esperando respuesta.");
    approved.length ? clearAndAppend(refs.extAprobadas, approved.map((item) => createExtensionCard(item, false))) : renderEmpty(refs.extAprobadas, "Sin aprobadas", "Aún no hay solicitudes aprobadas.");
    rejected.length ? clearAndAppend(refs.extRechazadas, rejected.map((item) => createExtensionCard(item, false))) : renderEmpty(refs.extRechazadas, "Sin rechazadas", "Aún no hay solicitudes rechazadas.");
  }
  function renderUnits(items = getFilteredUnits()) {
    if (state.unitsError && !state.unitsLoaded) {
      return renderEmpty(refs.unitsContainer, "Carga limitada", getUnitsErrorMessage());
    }
    if (refs.unitsCounter) refs.unitsCounter.textContent = `Mostrando ${items.length} unidades`;
    if (!items.length) return renderEmpty(refs.unitsContainer, "Sin unidades", "No hay unidades para este filtro.");
    clearAndAppend(refs.unitsContainer, items.map(createUnitCard));
  }

  async function fetchReservations() {
    state.reservationsRaw = await adminRequest({ query: { admin: 1 } });
    enrichReservations(state.reservationsRaw);
  }

  async function fetchSales() {
    state.salesRaw = await adminRequest({ query: { ventas: 1 } });
    enrichSales(state.salesRaw);
  }

  async function fetchExtensions() {
    state.extensionsRaw = await adminRequest({ query: { extensiones: 1 } });
    enrichExtensions(state.extensionsRaw);
  }

  async function fetchUnits(options = {}) {
    const { force = false, optional = false } = options;

    if (state.unitsLoaded && !force) {
      return state.units;
    }

    if (state.unitsPromise) {
      return state.unitsPromise;
    }

    if (!force && state.unitsError && getUnitsRetryRemainingMs() > 0) {
      if (!optional) {
        throw state.unitsError;
      }
      return state.units;
    }

    const request = AppCore.getUnidades({ force })
      .then((units) => {
        setUnitsError(null);
        state.unitsRetryAt = 0;
        buildUnitMaps(units);
        state.unitsLoaded = true;
        enrichReservations();
        enrichSales();
        return state.units;
      })
      .catch((error) => {
        setUnitsError(error);
        state.unitsRetryAt = Date.now() + UNITS_RETRY_COOLDOWN_MS;
        setUnitsWarning("Inventario temporalmente limitado. Reintenta en unos segundos.");
        if (force) {
          AppCore.invalidateUnidadesCache();
        }
        if (!optional) {
          throw error;
        }
        return state.units;
      })
      .finally(() => {
        state.unitsPromise = null;
      });

    state.unitsPromise = request;
    return request;
  }

  async function ensureUnitsForSection(sectionId, options = {}) {
    if (!sectionNeedsUnits(sectionId)) {
      return;
    }

    if (state.unitsLoaded && !options.force) {
      return;
    }

    if (sectionId === "unidades") {
      renderSkeleton(refs.unitsContainer, 3);
    }

    if (!options.force && state.unitsError && getUnitsRetryRemainingMs() > 0) {
      if (sectionId === state.currentSection) {
        if (sectionId === "reservas") renderReservations();
        if (sectionId === "ventas") renderSales();
        if (sectionId === "unidades") renderUnits();
      }
      return;
    }

    await fetchUnits({
      force: Boolean(options.force),
      optional: Boolean(options.optional)
    });

    if (sectionId === state.currentSection) {
      if (options.filters !== false) {
        populateFilters();
      }
      if (sectionId === "reservas") renderReservations();
      if (sectionId === "ventas") renderSales();
      if (sectionId === "unidades") renderUnits();
    }
  }

  async function refreshAll(options = {}) {
    const { forceUnits = false } = options;
    if (state.loading) return;
    state.loading = true;
    setButtonLoading(refs.refreshButton, true);
    renderSkeleton(refs.dashboardKpis, 4);
    renderSkeleton(refs.reservasContainer, 3);
    renderSkeleton(refs.ventasContainer, 3);
    renderSkeleton(refs.dashboardHighlights, 3);
    try {
      if (state.isMobile) {
        await fetchReservations();
        await fetchSales();
        await fetchExtensions();
      } else {
        await Promise.all([fetchReservations(), fetchSales(), fetchExtensions()]);
      }
      if (sectionNeedsUnits(state.currentSection) || forceUnits) {
        await fetchUnits({ force: forceUnits, optional: true });
      }
      populateFilters();
      renderDashboard();
      renderReservations();
      renderSales();
      renderExtensions();
      renderUnits();
    } catch (error) {
      console.error("admin.page refreshAll", error);
      renderEmpty(refs.dashboardHighlights, "Error cargando datos", AppCore.getErrorMessage(error, "No se pudo actualizar la información."));
    } finally {
      state.loading = false;
      setButtonLoading(refs.refreshButton, false);
    }
  }

  async function activateSection(sectionId, button) {
    state.currentSection = sectionId;
    document.querySelectorAll(".section").forEach((section) => section.classList.toggle("hidden", section.id !== sectionId));
    document.querySelectorAll(".nav-btn[data-nav]").forEach((navButton) => navButton.classList.toggle("active", navButton === button || navButton.dataset.nav === sectionId));
    if (refs.subtitle) refs.subtitle.textContent = ({
      dashboard: "Operación comercial, control y seguimiento.",
      reservas: "Reservas activas, negociación y conversión.",
      ventas: "Seguimiento de cobros, cuotas y saldo.",
      extensiones: "Revisión y respuesta de solicitudes complementarias.",
      unidades: "Inventario editable y disponibilidad."
    })[sectionId] || "Operación comercial, control y seguimiento.";
    if (sectionId === "dashboard") renderDashboard();
    if (sectionId === "reservas") renderReservations();
    if (sectionId === "ventas") renderSales();
    if (sectionId === "extensiones") renderExtensions();
    if (sectionId === "unidades") renderUnits();

    if (sectionNeedsUnits(sectionId)) {
      await ensureUnitsForSection(sectionId, { optional: true });
    }
  }

  async function approveExtension(id, approved) {
    try {
      await adminRequest({ method: "PATCH", body: { action: approved ? "aprobar_extension" : "rechazar_extension", extension_id: id } });
      await syncData({ extensions: true, reservations: true, filters: true });
    } catch (error) {
      alert(AppCore.getErrorMessage(error, "No se pudo actualizar la extensión."));
    }
  }

  function bindEvents() {
    document.querySelectorAll(".nav-btn[data-nav]").forEach((button) => button.addEventListener("click", () => {
      activateSection(button.dataset.nav, button);
    }));
    refs.refreshButton?.addEventListener("click", () => refreshAll({
      forceUnits: sectionNeedsUnits(state.currentSection)
    }));
    [refs.reservaSearch, refs.reservaEstadoFilter, refs.reservaProyectoFilter, refs.reservaAgenteFilter, refs.reservaSort, refs.reservaDateFrom, refs.reservaDateTo].forEach((element) => element?.addEventListener(element.type === "search" ? "input" : "change", () => { state.reservationsPage = 1; renderReservations(); }));
    [refs.ventaSearch, refs.ventaEstadoFilter, refs.ventaSort].forEach((element) => element?.addEventListener(element.type === "search" ? "input" : "change", () => { state.salesPage = 1; renderSales(); }));
    [refs.filtroProyecto, refs.filtroFase, refs.filtroManzana, refs.filtroEstado].forEach((element) => element?.addEventListener("change", () => renderUnits()));
    refs.buscarLote?.addEventListener("input", () => renderUnits());
  }

  async function handleValidate(id) {
    await runAction({ action: "validar", reserva_id: id }, "No se pudo validar la reserva.");
    await syncData({ reservations: true, sales: true, units: state.unitsLoaded, filters: true });
  }

  async function handleReject(id, unidadRecordId) {
    await runAction({
      action: "rechazar",
      reserva_id: id,
      unidad_record_id: unidadRecordId
    }, "No se pudo rechazar la reserva.");
    await syncData({ reservations: true, units: state.unitsLoaded, filters: true });
  }

  async function handleSaveNegotiation(id) {
    const tipoVenta = document.getElementById(`tipo_venta_${id}`)?.value || "";
    const precioFinal = AppCore.safeNumber(document.getElementById(`precio_final_${id}`)?.value);
    const montoInicial = AppCore.safeNumber(document.getElementById(`monto_inicial_${id}`)?.value);
    const numeroCuotas = AppCore.safeNumber(document.getElementById(`numero_cuotas_${id}`)?.value);
    const fechaInicioPagos = document.getElementById(`fecha_inicio_${id}`)?.value || "";
    const observaciones = document.getElementById(`obs_${id}`)?.value || "";
    const isFinancing = isFinancingSaleType(tipoVenta);

    if (!tipoVenta) {
      throw new Error("Selecciona el tipo de venta antes de guardar la negociación.");
    }

    if (precioFinal <= 0) {
      throw new Error("Ingresa un precio final válido para la negociación.");
    }

    if (isFinancing && numeroCuotas <= 0) {
      throw new Error("Para una venta financiada debes indicar al menos una cuota.");
    }

    if (isFinancing && !fechaInicioPagos) {
      throw new Error("Selecciona la fecha de inicio de pagos.");
    }

    if (fechaInicioPagos && !isIsoDateInput(fechaInicioPagos)) {
      throw new Error("La fecha de inicio de pagos debe estar en formato YYYY-MM-DD.");
    }

    const payload = {
      action: "negociacion",
      reserva_id: id,
      precio_final: precioFinal,
      tipo_venta: tipoVenta,
      monto_inicial: montoInicial,
      numero_cuotas: isFinancing ? numeroCuotas : 0,
      fecha_inicio_pagos: isFinancing ? fechaInicioPagos : "",
      observaciones_negociacion: observaciones
    };

    await runAction(payload, "No se pudo guardar la negociación.");

    closeNegotiationShell(id);

    await syncData({ reservations: true, filters: true });
  }

  async function handleConvert(reservaId, button) {
    if (!window.confirm("Confirmar conversion a venta?")) return;

    try {
      setButtonLoading(button, true);
      await runAction({ action: "convertir", reserva_id: reservaId }, "No se pudo convertir la reserva.");
      await syncData({ reservations: true, sales: true, units: state.unitsLoaded, filters: true });
      activateSection("ventas");
      showAdminAlert("Venta creada correctamente.");
    } finally {
      setButtonLoading(button, false);
    }
  }

  async function handleSaveUnit(id) {
    await runAction({
      action: "editar_unidad",
      unidad_id: id,
      precio: document.getElementById(`precio-${id}`)?.value || "",
      area: document.getElementById(`area-${id}`)?.value || "",
      estado: document.getElementById(`estado-${id}`)?.value || ""
    }, "No se pudo actualizar la unidad.");

    await syncData({ units: true, reservations: true, sales: true, filters: true });
    showAdminAlert("Unidad actualizada.");
  }

  async function reopenSaleDetail(ventaId) {
    if (typeof legacyActions.verVenta === "function") {
      await legacyActions.verVenta(ventaId);
    }
  }

  async function waitForFreshSaleQuotaContext(ventaId, validator = null, attempts = 6, delayMs = 250) {
    let lastContext = null;
    let lastError = null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      invalidateSaleQuotaContext(ventaId);

      try {
        lastContext = await loadSaleQuotaContext(ventaId, { force: true });
        if (typeof validator !== "function" || validator(lastContext)) {
          return lastContext;
        }
      } catch (error) {
        lastError = error;
      }

      if (attempt < attempts - 1) {
        await wait(delayMs);
      }
    }

    if (lastContext) return lastContext;
    if (lastError) throw lastError;
    return null;
  }

  async function refreshSaleQuotaModule(ventaId, options = {}) {
    const { waitForContext = null } = options;
    closeSaleInlineForm();
    invalidateSaleQuotaContext(ventaId);
    if (typeof waitForContext === "function") {
      await waitForFreshSaleQuotaContext(ventaId, waitForContext);
    }
    await syncData({ sales: true, filters: true });
    await reopenSaleDetail(ventaId);
  }

  async function submitQuotaPayload(payload) {
    const response = await adminRequest({
      method: "POST",
      body: payload
    });

    if (response && response.success === false) {
      throw new Error(response.error || "No se pudo crear la cuota.");
    }

    return response;
  }

  function updateManualQuotaHint(context) {
    const hint = document.getElementById("manualQuotaHint");
    if (!hint) return;

    const numero = AppCore.safeNumber(document.getElementById("numCuota")?.value);
    const monto = AppCore.safeNumber(document.getElementById("montoCuota")?.value);
    const messages = [];

    if (Number.isInteger(numero) && numero > 0 && context.quotaNumbers.has(numero)) {
      messages.push("La cuota ya existe.");
    }

    if (monto > 0) {
      if (monto > context.saldoPendienteProgramar) {
        messages.push("La suma de cuotas excede el saldo financiado pendiente.");
      } else {
        messages.push(`Despues de guardar quedaran ${formatMoney(context.saldoPendienteProgramar - monto)} por programar.`);
      }
    } else {
      messages.push(`Saldo pendiente por programar: ${formatMoney(context.saldoPendienteProgramar)}.`);
    }

    hint.className = messages.some((message) => message.includes("excede") || message.includes("existe"))
      ? "inline-alert tone-warning"
      : "form-note-pro";
    hint.textContent = messages.join(" ");
  }

  async function handleCreateQuota(ventaId) {
    const context = await loadSaleQuotaContext(ventaId, { force: true });
    const expectedQuotaCount = context.quotas.length + 1;
    const numero = AppCore.safeNumber(document.getElementById("numCuota")?.value);
    const monto = AppCore.safeNumber(document.getElementById("montoCuota")?.value);
    const fecha = document.getElementById("fechaCuota")?.value || "";

    if (!Number.isInteger(numero) || numero <= 0) {
      throw new Error("Falta el numero de cuota.");
    }

    if (context.quotaNumbers.has(numero)) {
      throw new Error("La cuota ya existe.");
    }

    if (monto <= 0) {
      throw new Error("Monto programado invalido.");
    }

    if (monto > context.saldoPendienteProgramar) {
      throw new Error("La suma de cuotas excede el saldo financiado.");
    }

    if (!fecha) {
      throw new Error("Falta la fecha de vencimiento.");
    }

    if (!isIsoDateInput(fecha) || !parseIsoDateParts(fecha)) {
      throw new Error("La fecha de vencimiento debe estar en formato YYYY-MM-DD.");
    }

    await submitQuotaPayload({
      action: "crear_cuota",
      venta_id: ventaId,
      numero_cuota: numero,
      monto_programado: monto,
      fecha_vencimiento: fecha
    });

    await refreshSaleQuotaModule(ventaId, {
      waitForContext: (freshContext) =>
        freshContext.quotas.length >= expectedQuotaCount &&
        AppCore.safeNumber(freshContext.detail?.total_cuotas) >= expectedQuotaCount
    });
  }

  async function handleGenerateAutomaticQuotas(ventaId) {
    const context = await loadSaleQuotaContext(ventaId, { force: true });
    const count = AppCore.safeNumber(document.getElementById("autoQuotaCount")?.value);
    const firstDate = document.getElementById("autoQuotaFirstDate")?.value || "";
    const frequency = document.getElementById("autoQuotaFrequency")?.value || "mensual";
    const drafts = buildQuotaDrafts(context, count, firstDate, frequency);
    const expectedQuotaCount = context.quotas.length + drafts.length;
    let created = 0;

    try {
      for (const draft of drafts) {
        await submitQuotaPayload({
          action: "crear_cuota",
          venta_id: ventaId,
          numero_cuota: draft.numero_cuota,
          monto_programado: draft.monto_programado,
          fecha_vencimiento: draft.fecha_vencimiento
        });
        created += 1;
      }
    } catch (error) {
      await refreshSaleQuotaModule(ventaId, {
        waitForContext: created > 0
          ? (freshContext) =>
              freshContext.quotas.length >= context.quotas.length + created &&
              AppCore.safeNumber(freshContext.detail?.total_cuotas) >= context.quotas.length + created
          : null
      });
      if (created > 0) {
        throw new Error(`Se registraron ${created} cuotas antes del error. ${AppCore.getErrorMessage(error, "No se pudo completar la distribución automática.")}`);
      }
      throw error;
    }

    await refreshSaleQuotaModule(ventaId, {
      waitForContext: (freshContext) =>
        freshContext.quotas.length >= expectedQuotaCount &&
        AppCore.safeNumber(freshContext.detail?.total_cuotas) >= expectedQuotaCount
    });
    return drafts.length;
  }

  async function openQuotaForm(ventaId, mode = "manual") {
    const currentForm = getSaleInlineForm();
    if (currentForm?.dataset.open === "1" && currentForm.dataset.mode === mode) {
      closeSaleInlineForm();
      return;
    }

    const context = await loadSaleQuotaContext(ventaId, { force: true });
    const canProgram = context.saldoPendienteProgramar > 0;
    const defaultManualDate = context.quotas.length
      ? addQuotaFrequency(getSuggestedQuotaStartDate(context.quotas), "mensual", 1)
      : getTodayIso();

    if (mode === "automatico") {
      const countInput = AppCore.createElement("input", {
        attrs: {
          id: "autoQuotaCount",
          type: "number",
          min: "1",
          step: "1",
          inputmode: "numeric",
          value: String(Math.max(1, Math.min(6, Math.floor(context.saldoPendienteProgramar || 1))))
        }
      });
      const firstDateInput = AppCore.createElement("input", {
        attrs: {
          id: "autoQuotaFirstDate",
          type: "date",
          value: defaultManualDate
        }
      });
      const frequencySelect = AppCore.createElement("select", { attrs: { id: "autoQuotaFrequency" } });
      [
        { value: "mensual", label: "Mensual" },
        { value: "quincenal", label: "Quincenal" }
      ].forEach((option) => {
        frequencySelect.appendChild(AppCore.createElement("option", {
          text: option.label,
          attrs: { value: option.value }
        }));
      });

      renderSaleInlineForm({
        title: "Distribución automática de cuotas",
        description: canProgram
          ? "Genera cuotas consecutivas desde el siguiente número disponible. La última cuota absorberá diferencias de redondeo."
          : "La venta ya no tiene saldo pendiente por programar.",
        sections: [
          buildQuotaSummaryStrip(context),
          buildQuotaModeSwitch(ventaId, "automatico"),
          AppCore.createElement("div", { className: "form-grid-pro cuota-form-grid" }, [
            buildInlineField("Cantidad de cuotas", countInput),
            buildInlineField("Primera cuota", firstDateInput),
            buildInlineField("Frecuencia", frequencySelect)
          ]),
          AppCore.createElement("div", { className: "quota-preview-shell", attrs: { id: "autoQuotaPreview" } })
        ],
        actions: canProgram
          ? [
              AppCore.createElement("button", {
                className: "btn-primary",
                text: "Generar cuotas",
                attrs: { type: "button" },
                events: { click: () => window.generarCuotasAutomaticas && window.generarCuotasAutomaticas(ventaId) }
              }),
              AppCore.createElement("button", {
                className: "btn-outline",
                text: "Manual",
                attrs: { type: "button" },
                events: { click: () => window.mostrarFormularioCuota && window.mostrarFormularioCuota(ventaId, "manual") }
              }),
              AppCore.createElement("button", {
                className: "btn-outline",
                text: "Cancelar",
                attrs: { type: "button" },
                events: { click: () => closeSaleInlineForm() }
              })
            ]
          : [
              AppCore.createElement("button", {
                className: "btn-outline",
                text: "Cerrar",
                attrs: { type: "button" },
                events: { click: () => closeSaleInlineForm() }
              })
            ]
      });

      const form = getSaleInlineForm();
      if (form) form.dataset.mode = "automatico";

      [countInput, firstDateInput, frequencySelect].forEach((control) => {
        control.addEventListener("input", () => renderAutoQuotaPreview(context));
        control.addEventListener("change", () => renderAutoQuotaPreview(context));
      });
      renderAutoQuotaPreview(context);
      return;
    }

    const numeroInput = AppCore.createElement("input", {
      attrs: {
        id: "numCuota",
        type: "number",
        min: "1",
        step: "1",
        inputmode: "numeric",
        value: String(context.nextQuotaNumber),
        placeholder: "Ej. 4"
      }
    });
    const montoInput = AppCore.createElement("input", {
      attrs: {
        id: "montoCuota",
        type: "number",
        min: "0",
        step: "0.01",
        inputmode: "decimal",
        value: canProgram ? String(context.saldoPendienteProgramar) : "",
        placeholder: "Monto programado"
      }
    });
    const fechaInput = AppCore.createElement("input", {
      attrs: {
        id: "fechaCuota",
        type: "date",
        value: defaultManualDate
      }
    });

    renderSaleInlineForm({
      title: "Programacion manual de cuota",
      description: canProgram
        ? "Crea una cuota individual validando numero, monto y fecha antes de guardar."
        : "La venta ya distribuyo todo el saldo financiado en cuotas.",
      sections: [
        buildQuotaSummaryStrip(context),
        buildQuotaModeSwitch(ventaId, "manual"),
        AppCore.createElement("div", { className: "form-grid-pro cuota-form-grid" }, [
          buildInlineField("Numero de cuota", numeroInput),
          buildInlineField("Monto programado", montoInput),
          buildInlineField("Fecha de vencimiento", fechaInput)
        ]),
        AppCore.createElement("div", { className: "form-note-pro", attrs: { id: "manualQuotaHint" } })
      ],
      actions: canProgram
        ? [
            AppCore.createElement("button", {
              className: "btn-primary",
              text: "Guardar cuota",
              attrs: { type: "button" },
              events: { click: () => window.crearCuota && window.crearCuota(ventaId) }
            }),
            AppCore.createElement("button", {
              className: "btn-outline",
                text: "Distribución automática",
              attrs: { type: "button" },
              events: { click: () => window.mostrarFormularioCuota && window.mostrarFormularioCuota(ventaId, "automatico") }
            }),
            AppCore.createElement("button", {
              className: "btn-outline",
              text: "Cancelar",
              attrs: { type: "button" },
              events: { click: () => closeSaleInlineForm() }
            })
          ]
        : [
            AppCore.createElement("button", {
              className: "btn-outline",
              text: "Cerrar",
              attrs: { type: "button" },
              events: { click: () => closeSaleInlineForm() }
            })
          ]
    });

    const form = getSaleInlineForm();
    if (form) form.dataset.mode = "manual";

    [numeroInput, montoInput].forEach((control) => {
      control.addEventListener("input", () => updateManualQuotaHint(context));
      control.addEventListener("change", () => updateManualQuotaHint(context));
    });
    updateManualQuotaHint(context);
  }

  async function openPaymentForm(ventaId, cuotaId = "") {
    const currentForm = getSaleInlineForm();
    const mode = cuotaId ? `pago-${cuotaId}` : "pago-general";
    if (currentForm?.dataset.open === "1" && currentForm.dataset.mode === mode) {
      closeSaleInlineForm();
      return;
    }

    const context = await loadSaleQuotaContext(ventaId, { force: true });
    const targetQuota = cuotaId
      ? context.quotas.find((quota) => String(quota.id) === String(cuotaId)) || null
      : null;
    const saldoObjetivo = targetQuota
      ? AppCore.safeNumber(targetQuota.saldo_pendiente)
      : context.saldoPendientePago;
    const description = targetQuota
      ? `Registraras un pago dirigido a la cuota ${targetQuota.numero_cuota || targetQuota.numero}. Saldo pendiente: ${formatMoney(saldoObjetivo)}.`
      : `Registrarás un pago distribuido automáticamente entre cuotas pendientes. Saldo total pendiente: ${formatMoney(context.saldoPendientePago)}.`;

    const montoInput = AppCore.createElement("input", {
      attrs: {
        id: "montoPago",
        type: "number",
        min: "0",
        step: "0.01",
        inputmode: "decimal",
        value: saldoObjetivo > 0 ? String(saldoObjetivo) : "",
        placeholder: "Monto a registrar"
      }
    });
    const metodoSelect = AppCore.createElement("select", { attrs: { id: "metodoPago" } });
    [
      { value: "Efectivo", label: "Efectivo" },
      { value: "Transferencia", label: "Transferencia" },
      { value: "Yape", label: "Yape" },
      { value: "Plin", label: "Plin" },
      { value: "Deposito", label: "Dep\u00f3sito" },
      { value: "Inicial", label: "Inicial" }
    ].forEach((method) => {
      metodoSelect.appendChild(AppCore.createElement("option", { text: method.label, attrs: { value: method.value } }));
    });
    const fechaInput = AppCore.createElement("input", {
      attrs: {
        id: "fechaPago",
        type: "date",
        value: getTodayIso()
      }
    });

    renderSaleInlineForm({
      title: targetQuota ? `Registrar pago de cuota ${targetQuota.numero_cuota || targetQuota.numero}` : "Registrar pago",
      description,
      sections: [
        AppCore.createElement("div", { className: "neg-summary-pro quota-summary-strip" }, [
          AppCore.createElement("div", { className: "neg-summary-pill" }, [
            AppCore.createElement("span", { text: "Total pagado" }),
            AppCore.createElement("strong", { text: formatMoney(context.totalPagado) })
          ]),
          AppCore.createElement("div", { className: "neg-summary-pill" }, [
            AppCore.createElement("span", { text: "Saldo pendiente de pago" }),
            AppCore.createElement("strong", { text: formatMoney(context.saldoPendientePago) })
          ]),
          AppCore.createElement("div", { className: "neg-summary-pill" }, [
            AppCore.createElement("span", { text: targetQuota ? "Saldo de la cuota" : "Cuotas activas" }),
            AppCore.createElement("strong", { text: targetQuota ? formatMoney(saldoObjetivo) : String(context.quotas.length) })
          ])
        ]),
        AppCore.createElement("div", { className: "form-grid-pro single cuota-form-grid" }, [
          buildInlineField("Monto", montoInput),
          buildInlineField("Metodo", metodoSelect),
          buildInlineField("Fecha de pago", fechaInput)
        ])
      ],
      actions: [
        AppCore.createElement("button", {
          className: "btn-primary",
          text: "Guardar pago",
          attrs: { type: "button" },
          events: { click: () => window.registrarPago && window.registrarPago(ventaId, cuotaId) }
        }),
        AppCore.createElement("button", {
          className: "btn-outline",
          text: "Cancelar",
          attrs: { type: "button" },
          events: { click: () => closeSaleInlineForm() }
        })
      ]
    });

    const form = getSaleInlineForm();
    if (form) form.dataset.mode = mode;
  }

  async function handleRegisterPayment(ventaId, cuotaId = "") {
    const context = await loadSaleQuotaContext(ventaId, { force: true });
    const monto = AppCore.safeNumber(document.getElementById("montoPago")?.value);
    const metodo = document.getElementById("metodoPago")?.value || "Efectivo";
    const fechaPago = document.getElementById("fechaPago")?.value || "";
    const targetQuota = cuotaId
      ? context.quotas.find((quota) => String(quota.id) === String(cuotaId)) || null
      : null;
    const saldoMaximo = targetQuota
      ? AppCore.safeNumber(targetQuota.saldo_pendiente)
      : context.saldoPendientePago;

    if (monto <= 0) {
      throw new Error("Pago invalido.");
    }

    if (!fechaPago) {
      throw new Error("Falta la fecha de pago.");
    }

    if (!isIsoDateInput(fechaPago) || !parseIsoDateParts(fechaPago)) {
      throw new Error("La fecha de pago debe estar en formato YYYY-MM-DD.");
    }

    if (saldoMaximo <= 0) {
      throw new Error(targetQuota ? "La cuota no tiene saldo pendiente." : "La venta no tiene saldo pendiente de pago.");
    }

    if (monto > saldoMaximo) {
      throw new Error(targetQuota ? "El monto excede el saldo pendiente de la cuota seleccionada." : "El monto excede el saldo pendiente disponible.");
    }

    const response = await adminRequest({
      method: "PATCH",
      body: {
        action: "registrar_pago",
        venta_id: ventaId,
        cuota_id: cuotaId || undefined,
        monto,
        metodo,
        fecha_pago: fechaPago
      }
    });

    if (response && response.success === false) {
      throw new Error(response.error || "La cuota no pudo actualizarse.");
    }

    await refreshSaleQuotaModule(ventaId);
  }

  window.aprobarExtension = (id) => approveExtension(id, true);
  window.rechazarExtension = (id) => approveExtension(id, false);
  window.mostrarNegociacion = (id) => showNegotiationForm(id);
  window.validar = async (id) => {
    try {
      await handleValidate(id);
    } catch (error) {
      showAdminAlert(AppCore.getErrorMessage(error, "No se pudo validar la reserva."));
    }
  };
  window.rechazar = async (id, unidadRecordId) => {
    try {
      await handleReject(id, unidadRecordId);
    } catch (error) {
      showAdminAlert(AppCore.getErrorMessage(error, "No se pudo rechazar la reserva."));
    }
  };
  window.guardarNegociacion = async (id) => {
    try {
      await handleSaveNegotiation(id);
      showAdminAlert("Negociación guardada correctamente.");
    } catch (error) {
      showAdminAlert(AppCore.getErrorMessage(error, "No se pudo guardar la negociación."));
    }
  };
  window.convertirVenta = async (id, button) => {
    try {
      await handleConvert(id, button);
    } catch (error) {
      showAdminAlert(AppCore.getErrorMessage(error, "No se pudo convertir la reserva."));
    }
  };
  window.guardarUnidad = async (id) => {
    try {
      await handleSaveUnit(id);
    } catch (error) {
      showAdminAlert(AppCore.getErrorMessage(error, "No se pudo actualizar la unidad."));
    }
  };
  window.crearCuota = async (ventaId) => {
    try {
      await handleCreateQuota(ventaId);
      showAdminAlert("Cuota registrada correctamente.");
    } catch (error) {
      showAdminAlert(AppCore.getErrorMessage(error, "No se pudo crear la cuota."));
    }
  };
  window.generarCuotasAutomaticas = async (ventaId) => {
    try {
      const created = await handleGenerateAutomaticQuotas(ventaId);
      showAdminAlert(`Se generaron ${created} cuotas correctamente.`);
    } catch (error) {
      showAdminAlert(AppCore.getErrorMessage(error, "No se pudo completar la distribución automática."));
    }
  };
  window.mostrarFormularioCuota = async (ventaId, mode = "manual") => {
    try {
      await openQuotaForm(ventaId, mode);
    } catch (error) {
      showAdminAlert(AppCore.getErrorMessage(error, "No se pudo abrir el formulario de cuotas."));
    }
  };
  window.mostrarPago = async (ventaId, cuotaId = "") => {
    try {
      await openPaymentForm(ventaId, cuotaId);
    } catch (error) {
      showAdminAlert(AppCore.getErrorMessage(error, "No se pudo abrir el formulario de pago."));
    }
  };
  window.registrarPago = async (ventaId, cuotaId = "") => {
    try {
      await handleRegisterPayment(ventaId, cuotaId);
      showAdminAlert("Pago registrado correctamente.");
    } catch (error) {
      showAdminAlert(AppCore.getErrorMessage(error, "No se pudo registrar el pago."));
    }
  };
  window.showSection = (sectionId, button) => activateSection(sectionId, button || document.querySelector(`.nav-btn[data-nav="${sectionId}"]`));
  window.loadReservas = async () => { await fetchReservations(); renderReservations(); renderDashboard(); return state.reservations; };
  window.loadVentas = async () => { await fetchSales(); renderSales(); renderDashboard(); return state.sales; };
  window.loadDashboard = async () => { await Promise.all([fetchReservations(), fetchSales(), fetchExtensions()]); renderDashboard(); };
  window.cargarExtensiones = async () => { await fetchExtensions(); renderExtensions(); renderDashboard(); return state.extensions; };
  window.loadUnidades = async () => {
    await fetchUnits({ optional: false });
    populateFilters();
    renderUnits();
    return state.units;
  };
  window.renderUnidades = (items) => renderUnits(Array.isArray(items) ? items : getFilteredUnits());

  async function init() {
    if (init.done) return;
    init.done = true;
    if (refs.headerTitle) refs.headerTitle.textContent = "Panel de Administración";
    if (refs.subtitle) refs.subtitle.textContent = "Operación comercial, control y seguimiento.";
    document.title = "Ayllu Laguna Huaypo | Administración";
    applyStaticCopy();
    bindEvents();
    await refreshAll();
    await activateSection(state.currentSection);
    consumeDeepLink();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
