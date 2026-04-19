(function () {
  const { AppCore, PlanoUtils } = window;
  const svgCache = new Map();
  const DEFAULT_360_CONFIG = { "alp-f2": 1 };
  const VISIBILITY_KEY = "plano_visibility_mode";
  const PANNELLUM_JS = "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js";
  const PANNELLUM_CSS = "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css";
  let pannellumLoader = null;

  function el(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (text !== undefined) {
      node.textContent = AppCore.repairTextEncoding
        ? AppCore.repairTextEncoding(String(text))
        : String(text);
    }
    return node;
  }

  function createStatusBadge(meta, label) {
    return AppCore.createElement("span", {
      className: "status-badge",
      text: label || meta.label,
      attrs: { "data-tone": meta.tone || "neutral" }
    });
  }

  function createMetric(label, value) {
    return AppCore.createElement("div", { className: "detail-metric" }, [
      AppCore.createElement("span", { text: label }),
      AppCore.createElement("strong", {
        text: AppCore.repairTextEncoding
          ? AppCore.repairTextEncoding(value || "No disponible")
          : value || "No disponible"
      })
    ]);
  }

  function createDetailItem(label, value, options = {}) {
    const item = AppCore.createElement("div", {
      className: `detail-item${options.internal ? " is-internal" : ""}`,
      attrs: options.internal ? { "data-internal": "true" } : {}
    });
    item.appendChild(el("span", "", label));
    item.appendChild(el(
      options.multiline ? "p" : "strong",
      "",
      AppCore.repairTextEncoding
        ? AppCore.repairTextEncoding(value || options.fallback || "No disponible")
        : value || options.fallback || "No disponible"
    ));
    return item;
  }

  function createActionButton(label, tone, handler) {
    const button = AppCore.createElement("button", {
      className: tone === "outline" ? "btn-outline" : tone === "ghost" ? "btn-ghost" : "plano-action",
      text: label,
      attrs: { type: "button" }
    });
    if (tone === "ghost") button.dataset.tone = "dark";
    button.addEventListener("click", handler);
    return button;
  }

  async function fetchSvgMarkup(name) {
    if (!svgCache.has(name)) {
      svgCache.set(name, fetch(`/planos/${name}`).then(async (response) => {
        if (!response.ok) {
          throw new Error("No se encontro el plano solicitado.");
        }
        return response.text();
      }));
    }
    return svgCache.get(name);
  }

  function ensureStylesheet(id, href) {
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  function ensureScript(id, src) {
    const existing = document.getElementById(id);
    if (existing) {
      if (window.pannellum) return Promise.resolve(window.pannellum);
      return new Promise((resolve, reject) => {
        existing.addEventListener("load", () => resolve(window.pannellum), { once: true });
        existing.addEventListener("error", reject, { once: true });
      });
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.id = id;
      script.src = src;
      script.async = true;
      script.onload = () => resolve(window.pannellum);
      script.onerror = reject;
      document.body.appendChild(script);
    });
  }

  function ensurePannellum() {
    if (window.pannellum) return Promise.resolve(window.pannellum);
    if (!pannellumLoader) {
      ensureStylesheet("pannellum-runtime-css", PANNELLUM_CSS);
      pannellumLoader = ensureScript("pannellum-runtime-js", PANNELLUM_JS)
        .catch((error) => {
          console.warn("No se pudo cargar Pannellum en esta sesion.", error);
          return null;
        });
    }
    return pannellumLoader;
  }

  function getCurrentParams() {
    return new URLSearchParams(window.location.search);
  }

  function setQueryState(project, phase, presentationMode) {
    const params = getCurrentParams();
    params.set("proyecto", project);
    params.set("fase", phase);
    if (presentationMode) {
      params.set("presentacion", "1");
    } else {
      params.delete("presentacion");
    }
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  }

  function getTooltipContent(lote, isAdmin, presentationMode) {
    const fragment = document.createDocumentFragment();
    fragment.appendChild(AppCore.createElement("div", { className: "tooltip-title" }, [
      AppCore.createElement("strong", { text: lote.lote_id }),
      createStatusBadge(PlanoUtils.getStatusMeta(lote.estado))
    ]));
    fragment.appendChild(AppCore.createElement("p", {
      className: "tooltip-meta",
      text: `Precio: ${PlanoUtils.formatCurrency(lote.precio_publico || lote.precio || 0)}`
    }));
    fragment.appendChild(AppCore.createElement("p", {
      className: "tooltip-meta",
      text: `Area: ${PlanoUtils.safeNumber(lote.area).toFixed(2)} m2`
    }));
    if (isAdmin && !presentationMode && lote.venta_estado) {
      fragment.appendChild(AppCore.createElement("p", {
        className: "tooltip-meta",
        text: `Estado comercial: ${lote.venta_estado}`
      }));
    }
    return fragment;
  }

  function createSummaryPill(label, value, color) {
    return AppCore.createElement("div", { className: "summary-pill" }, [
      AppCore.createElement("span", {
        className: "summary-dot",
        attrs: { style: `background:${color};` }
      }),
      AppCore.createElement("span", { text: label }),
      AppCore.createElement("strong", { text: value })
    ]);
  }

  function normalizeLote(item, currentProject, currentPhase) {
    return {
      ...item,
      lote_id: PlanoUtils.repairText(item.lote_id || ""),
      lote: PlanoUtils.repairText(item.lote || ""),
      manzana: PlanoUtils.repairText(item.manzana || ""),
      proyecto: PlanoUtils.repairText(item.proyecto || currentProject),
      fase: PlanoUtils.repairText(item.fase || currentPhase),
      precio: PlanoUtils.safeNumber(item.precio),
      precio_publico: PlanoUtils.safeNumber(item.precio_publico ?? item.precio),
      area: PlanoUtils.safeNumber(item.area),
      estado: PlanoUtils.normalizeText(item.estado),
      monto_reserva: PlanoUtils.safeNumber(item.monto_reserva),
      descuento_solicitado: PlanoUtils.safeNumber(item.descuento_solicitado),
      sobreprecio: PlanoUtils.safeNumber(item.sobreprecio),
      motivo_descuento: PlanoUtils.repairText(item.motivo_descuento || ""),
      cliente: PlanoUtils.repairText(item.cliente || ""),
      agente: PlanoUtils.repairText(item.agente || ""),
      reserva_codigo_comercial: PlanoUtils.repairText(item.reserva_codigo_comercial || ""),
      reserva_estado: PlanoUtils.repairText(item.reserva_estado || ""),
      reserva_etapa: PlanoUtils.repairText(item.reserva_etapa || ""),
      reserva_dias_restantes: item.reserva_dias_restantes ?? null,
      reserva_vigencia_expirada: Boolean(item.reserva_vigencia_expirada),
      reserva_por_vencer: Boolean(item.reserva_por_vencer),
      reserva_extension_pendiente: Boolean(item.reserva_extension_pendiente),
      reserva_extension_usada: Boolean(item.reserva_extension_usada),
      venta_estado: PlanoUtils.repairText(item.venta_estado || ""),
      venta_total_pagado: PlanoUtils.safeNumber(item.venta_total_pagado),
      venta_saldo_restante: PlanoUtils.safeNumber(item.venta_saldo_restante),
      venta_avance_porcentaje: PlanoUtils.safeNumber(item.venta_avance_porcentaje),
      venta_cuotas_vencidas: PlanoUtils.safeNumber(item.venta_cuotas_vencidas),
      venta_cuotas_morosas: PlanoUtils.safeNumber(item.venta_cuotas_morosas),
      venta_total_financiado: PlanoUtils.safeNumber(item.venta_total_financiado),
      can_view_reserva: Boolean(item.can_view_reserva)
    };
  }

  function commercialStateLabel(lote) {
    return lote.venta_estado || PlanoUtils.getStatusMeta(lote.estado).label;
  }

  function createRiskBadge(alert) {
    return AppCore.createElement("span", {
      className: "risk-badge",
      text: alert.label,
      attrs: { "data-tone": alert.tone || "info", title: alert.detail || alert.label }
    });
  }

  function createInsightList(items = []) {
    return AppCore.createElement("div", { className: "insight-list" }, items.map((item) =>
      AppCore.createElement("div", { className: "insight-row", text: item })
    ));
  }

  function createProgressBar(value = 0) {
    const safeValue = Math.max(0, Math.min(100, PlanoUtils.safeNumber(value)));
    return AppCore.createElement("div", { className: "progress-meter" }, [
      AppCore.createElement("span", {
        className: "progress-meter__fill",
        attrs: { style: `width:${safeValue}%;` }
      })
    ]);
  }

  function formatLotRouteContext(lote) {
    const parts = [lote.proyecto];
    if (lote.fase) parts.push(`Fase ${lote.fase}`);
    if (lote.manzana) parts.push(`Mz. ${lote.manzana}`);
    if (lote.lote) parts.push(`Lt. ${lote.lote}`);
    return parts.filter(Boolean).join(" · ");
  }

  function buildPublicBlock(lote, currentProject, currentPhase) {
    const card = AppCore.createElement("section", { className: "detail-card" }, [
      AppCore.createElement("h3", { text: "Resumen del lote" })
    ]);
    const grid = AppCore.createElement("div", { className: "detail-grid" });
    grid.append(
      createDetailItem("Proyecto", lote.proyecto || currentProject),
      createDetailItem("Fase", lote.fase || currentPhase),
      createDetailItem("Manzana", lote.manzana || "-"),
      createDetailItem("Lote", lote.lote || lote.lote_id),
      createDetailItem("Area", `${PlanoUtils.safeNumber(lote.area).toFixed(2)} m2`),
      createDetailItem("Precio", PlanoUtils.formatCurrency(lote.precio_publico || lote.precio || 0))
    );
    card.appendChild(grid);
    card.appendChild(AppCore.createElement("div", {
      className: "detail-note",
      text: lote.estado === "disponible"
        ? "Este lote esta disponible para gestion comercial inmediata."
        : `Estado comercial actual: ${commercialStateLabel(lote)}.`
    }));
    return card;
  }

  function buildCommercialBlock(lote, visible, isAdmin) {
    const card = AppCore.createElement("section", {
      className: `detail-card${visible ? "" : " hidden"}`
    }, [
      AppCore.createElement("h3", { text: isAdmin ? "Contexto comercial" : "Detalle ampliado" })
    ]);
    const grid = AppCore.createElement("div", { className: "detail-grid" });
    grid.append(
      createDetailItem("Codigo", lote.lote_id),
      createDetailItem("Estado comercial", commercialStateLabel(lote)),
      createDetailItem("Referencia", `${lote.proyecto} / ${lote.fase}`),
      createDetailItem("Precio resumido", PlanoUtils.formatCompactCurrency(lote.precio_publico || lote.precio || 0))
    );
    if (lote.reserva_codigo_comercial) {
      grid.appendChild(createDetailItem("Reserva", lote.reserva_codigo_comercial));
    }
    if (lote.venta_estado) {
      grid.appendChild(createDetailItem("Venta", lote.venta_estado));
    }
    card.appendChild(grid);
    return card;
  }

  function buildOperationalBlock(lote, visible) {
    const card = AppCore.createElement("section", {
      className: `detail-card is-internal${visible ? "" : " hidden"}`,
      attrs: { "data-internal": "true" }
    }, [
      AppCore.createElement("h3", { text: "Operación interna" })
    ]);
    const grid = AppCore.createElement("div", { className: "detail-grid" });
    grid.append(
      createDetailItem("Cliente", lote.cliente || "-", { internal: true }),
      createDetailItem("Asesor", lote.agente || "-", { internal: true }),
      createDetailItem("Monto reserva", lote.monto_reserva ? PlanoUtils.formatCurrency(lote.monto_reserva) : "-", { internal: true }),
      createDetailItem("Estado venta", lote.venta_estado || "-", { internal: true })
    );
    if (lote.descuento_solicitado) {
      grid.appendChild(createDetailItem("Descuento solicitado", PlanoUtils.formatCurrency(lote.descuento_solicitado), { internal: true }));
    }
    if (lote.sobreprecio) {
      grid.appendChild(createDetailItem("Sobreprecio", PlanoUtils.formatCurrency(lote.sobreprecio), { internal: true }));
    }
    if (lote.motivo_descuento) {
      grid.appendChild(createDetailItem("Motivo", lote.motivo_descuento, { internal: true, multiline: true }));
    }
    card.appendChild(grid);
    return card;
  }

  function buildEditBlock(lote, visible, onSave, onCancel) {
    const card = AppCore.createElement("section", {
      className: `detail-card is-internal${visible ? "" : " hidden"}`,
      attrs: { "data-internal": "true" }
    }, [
      AppCore.createElement("h3", { text: "Edicion rapida" })
    ]);

    const form = AppCore.createElement("form", { className: "detail-inline-form" });
    form.append(
      AppCore.createElement("label", {}, [
        "Precio lista",
        AppCore.createElement("input", {
          attrs: {
            type: "number",
            name: "precio",
            min: "0",
            step: "1",
            value: PlanoUtils.safeNumber(lote.precio)
          }
        })
      ]),
      AppCore.createElement("label", {}, [
        "Area",
        AppCore.createElement("input", {
          attrs: {
            type: "number",
            name: "area",
            min: "0",
            step: "0.01",
            value: PlanoUtils.safeNumber(lote.area)
          }
        })
      ]),
      AppCore.createElement("label", {}, [
        "Estado",
        (() => {
          const select = AppCore.createElement("select", { attrs: { name: "estado" } });
          ["Disponible", "Reservado", "Vendido"].forEach((value) => {
            const option = AppCore.createElement("option", { text: value, attrs: { value } });
            if (PlanoUtils.normalizeText(value) === PlanoUtils.normalizeText(lote.estado)) {
              option.selected = true;
            }
            select.appendChild(option);
          });
          return select;
        })()
      ])
    );

    const actions = AppCore.createElement("div", { className: "detail-actions-stack" });
    const saveButton = createActionButton("Guardar cambios", "primary", async () => onSave(form, saveButton));
    const cancelButton = createActionButton("Cancelar", "outline", onCancel);
    actions.append(saveButton, cancelButton);
    card.append(form, actions);
    return card;
  }

  function formatLotRouteContext(lote) {
    const parts = [PlanoUtils.repairText(lote?.proyecto || "")];
    if (lote?.fase) parts.push(`Fase ${PlanoUtils.repairText(lote.fase)}`);
    if (lote?.manzana) parts.push(`Mz. ${PlanoUtils.repairText(lote.manzana)}`);
    if (lote?.lote) parts.push(`Lt. ${PlanoUtils.repairText(lote.lote)}`);
    return parts.filter(Boolean).join(" · ");
  }

  function buildPublicBlock(lote, currentProject, currentPhase) {
    const card = AppCore.createElement("section", { className: "detail-card" }, [
      AppCore.createElement("h3", { text: "Resumen del lote" })
    ]);
    const grid = AppCore.createElement("div", { className: "detail-grid" });
    grid.append(
      createDetailItem("Proyecto", lote.proyecto || currentProject),
      createDetailItem("Fase", lote.fase || currentPhase),
      createDetailItem("Manzana", lote.manzana || "-"),
      createDetailItem("Lote", lote.lote || lote.lote_id),
      createDetailItem("Área", PlanoUtils.formatArea(lote.area)),
      createDetailItem("Precio", PlanoUtils.formatCurrency(lote.precio_publico || lote.precio || 0))
    );
    card.appendChild(grid);
    card.appendChild(AppCore.createElement("div", { className: "detail-chip-row" }, [
      createStatusBadge(PlanoUtils.getStatusMeta(lote.estado)),
      AppCore.createElement("span", { className: "quality-badge", text: lote.scoreLabel || "Valor estable" }),
      AppCore.createElement("span", { className: "context-badge", text: lote.contextLabel || "Zona interior" })
    ]));
    card.appendChild(AppCore.createElement("div", {
      className: "detail-note",
      text: lote.estado === "disponible"
        ? "Este lote está disponible para gestión comercial inmediata."
        : `Estado comercial actual: ${commercialStateLabel(lote)}.`
    }));
    card.appendChild(createInsightList([
      lote.recommendation || "Sin recomendación adicional.",
      `Contexto relativo: ${lote.contextDetail || "Sin detalle espacial."}`
    ]));
    return card;
  }

  function buildCommercialBlock(lote, visible, isAdmin) {
    const card = AppCore.createElement("section", {
      className: `detail-card${visible ? "" : " hidden"}`
    }, [
      AppCore.createElement("h3", { text: isAdmin ? "Contexto comercial" : "Detalle ampliado" })
    ]);
    const grid = AppCore.createElement("div", { className: "detail-grid" });
    grid.append(
      createDetailItem("Código", lote.lote_id),
      createDetailItem("Estado comercial", commercialStateLabel(lote)),
      createDetailItem("Referencia", formatLotRouteContext(lote)),
      createDetailItem("Precio resumido", PlanoUtils.formatCompactCurrency(lote.precio_publico || lote.precio || 0)),
      createDetailItem("Precio por m²", lote.pricePerM2 ? PlanoUtils.formatCurrency(lote.pricePerM2) : "No disponible"),
      createDetailItem("Puntaje", `${lote.score || 0}/100`)
    );
    if (lote.reserva_codigo_comercial) {
      grid.appendChild(createDetailItem("Reserva", lote.reserva_codigo_comercial));
    }
    if (lote.venta_estado) {
      grid.appendChild(createDetailItem("Venta", lote.venta_estado));
    }
    card.appendChild(grid);
    card.appendChild(createInsightList(lote.recommendationReasons || []));
    return card;
  }

  function buildRiskBlock(lote) {
    const alerts = Array.isArray(lote.riskAlerts) ? lote.riskAlerts : [];
    if (!alerts.length) {
      return AppCore.createElement("section", { className: "detail-card" }, [
        AppCore.createElement("h3", { text: "Alertas de riesgo" }),
        AppCore.createElement("div", {
          className: "detail-empty",
          text: "Sin alertas operativas relevantes para este lote."
        })
      ]);
    }

    return AppCore.createElement("section", { className: "detail-card" }, [
      AppCore.createElement("h3", { text: "Alertas de riesgo" }),
      AppCore.createElement("div", { className: "risk-badge-row" }, alerts.map(createRiskBadge)),
      createInsightList(alerts.map((item) => item.detail || item.label))
    ]);
  }

  function buildFinancialBlock(lote) {
    const financial = lote.financial || {};
    if (!financial.hasData) {
      return AppCore.createElement("section", {
        className: "detail-card is-internal",
        attrs: { "data-internal": "true" }
      }, [
        AppCore.createElement("h3", { text: "Estado financiero" }),
        AppCore.createElement("div", {
          className: "detail-empty",
          text: "Aún no hay contexto financiero consolidado para este lote."
        })
      ]);
    }

    const card = AppCore.createElement("section", {
      className: "detail-card is-internal",
      attrs: { "data-internal": "true" }
    }, [
      AppCore.createElement("h3", { text: "Estado financiero" })
    ]);
    const grid = AppCore.createElement("div", { className: "detail-grid" });
    grid.append(
      createDetailItem("Monto total", PlanoUtils.formatCurrency(financial.total), { internal: true }),
      createDetailItem("Pagado", PlanoUtils.formatCurrency(financial.pagado), { internal: true }),
      createDetailItem("Saldo", PlanoUtils.formatCurrency(financial.saldo), { internal: true }),
      createDetailItem("Avance", `${financial.avance}%`, { internal: true }),
      createDetailItem("Cuotas vencidas", String(financial.cuotasVencidas), { internal: true }),
      createDetailItem("Cuotas morosas", String(financial.cuotasMorosas), { internal: true })
    );
    card.appendChild(grid);
    card.appendChild(createProgressBar(financial.avance));
    return card;
  }

  function createController(options = {}) {
    const session = AppCore.requireSession(options.sessionOptions || {});
    if (!session) return null;

    const params = getCurrentParams();
    const currentProject = String(params.get("proyecto") || options.defaultProject || "VG").trim();
    const currentPhase = String(params.get("fase") || options.defaultPhase || "F1").trim();
    const debugEnabled = params.get("planoDebug") === "1" || localStorage.getItem("plano_debug") === "1";

    const refs = {
      body: document.body,
      topContent: document.getElementById("top-content"),
      togglePanel: document.getElementById("toggle-panel"),
      miniInfo: document.getElementById("mini-info"),
      headerKicker: document.getElementById("headerKicker"),
      headerTitle: document.getElementById("headerTitle"),
      headerSubtitle: document.getElementById("headerSubtitle"),
      btnPresentation: document.getElementById("btnPresentacion"),
      btnVisibility: document.getElementById("btnVisibility"),
      btnResetView: document.getElementById("btnResetView"),
      btn360: document.getElementById("btn360"),
      btnExportPng: document.getElementById("btnExportPng"),
      btnExportPdf: document.getElementById("btnExportPdf"),
      btnLogout: document.getElementById("btnLogout"),
      btnSearch: document.getElementById("btnBuscarLote"),
      inputSearch: document.getElementById("inputLote"),
      suggestions: document.getElementById("sugerencias-lotes"),
      selectProject: document.getElementById("selectProyecto"),
      selectPhase: document.getElementById("selectFase"),
      summary: document.getElementById("resumen"),
      filters: Array.from(document.querySelectorAll('#filtros input[type="checkbox"]')),
      wrapper: document.getElementById("plano-wrapper"),
      container: document.getElementById("plano-container"),
      loading: document.getElementById("planoLoading"),
      tooltip: document.getElementById("tooltip"),
      overlay: document.getElementById("panelOverlay"),
      panel: document.getElementById("mobile-card"),
      panelEyebrow: document.getElementById("detailEyebrow"),
      panelTitle: document.getElementById("detailTitle"),
      panelSubtitle: document.getElementById("detailSubtitle"),
      panelStatus: document.getElementById("detailStatusBadge"),
      panelMetrics: document.getElementById("detailMetrics"),
      panelActions: document.getElementById("detailPrimaryActions"),
      panelPublic: document.getElementById("detailPublicBlock"),
      panelCommercial: document.getElementById("detailCommercialBlock"),
      panelOperational: document.getElementById("detailOperationalBlock"),
      panelEdit: document.getElementById("detailEditBlock"),
      detailClose: document.getElementById("detailClose"),
      modal360: document.getElementById("modal360"),
      visor360: document.getElementById("visor360"),
      cerrar360: document.getElementById("cerrar360"),
      contador360: document.getElementById("contador360"),
      valuationPanel: document.getElementById("panel-valorizacion"),
      projectionSummary: document.getElementById("proyeccionResumen"),
      variationType: document.getElementById("tipoVariacion"),
      variationPrice: document.getElementById("variacionPrecio"),
      simulationButton: document.getElementById("btnSimular"),
      valActual: document.getElementById("valActual"),
      valProyectado: document.getElementById("valProyectado"),
      valGanancia: document.getElementById("valGanancia"),
      valPromedioM2: document.getElementById("valPromedioM2"),
      valDisponible: document.getElementById("valDisponible"),
      valVendido: document.getElementById("valVendido"),
      compareDock: null,
      compareList: null,
      compareOpen: null,
      compareClear: null,
      compareModal: null,
      compareModalBody: null,
      compareClose: null,
      projectButton: null,
      projectModal: null,
      projectModalBody: null,
      projectModalClose: null
    };

    const state = {
      session,
      role: options.role || session.decoded.rol || "agente",
      isAdmin: (options.role || session.decoded.rol) === "admin",
      isMobile: window.matchMedia("(max-width: 840px)").matches,
      performanceMode: false,
      visibilityMode: localStorage.getItem(VISIBILITY_KEY) === "sunlight" ? "sunlight" : "dark",
      currentProject,
      currentPhase,
      presentationMode: params.get("presentacion") === "1" || params.get("modo") === "cliente",
      lotes: [],
      lotesMap: new Map(),
      lotElements: [],
      lotElementsMap: new Map(),
      lotGeometry: new Map(),
      projectBounds: null,
      selectedLotId: "",
      filteredStates: new Set(["disponible", "reservado", "vendido", "financiado"]),
      svg: null,
      panzoom: null,
      initialView: null,
      scaleRange: {
        min: 0.05,
        max: 8
      },
      labelNodes: new Map(),
      labelRender: {
        mode: "",
        scale: 0,
        force: true
      },
      wheelHandler: null,
      panzoomChangeHandler: null,
      highlightedLotElements: [],
      heavySvg: false,
      tooltipLotId: "",
      viewer360: null,
      loadRequestId: 0,
      touchBindingsCleanup: null,
      compareIds: [],
      compareHighlights: new Map(),
      benchmark: null,
      touch: {
        active: false,
        lastTapAt: 0,
        lastTapX: 0,
        lastTapY: 0,
        moved: false,
        startX: 0,
        startY: 0,
        lockUntil: 0
      },
      simulation: {
        initial: 3000,
        months: 48
      },
      visibleSections: {
        detail: false,
        operational: false,
        edit: false,
        quickReserve: false
      }
    };

    const views360 = options.vistas360 || DEFAULT_360_CONFIG;

    function syncViewportFlags() {
      state.isMobile = window.matchMedia("(max-width: 840px)").matches;
      state.performanceMode = state.heavySvg || (state.isAdmin && state.isMobile);
    }

    syncViewportFlags();

    function key360() {
      return `${state.currentProject.toLowerCase()}-${state.currentPhase.toLowerCase()}`;
    }

    function has360() {
      return Boolean(views360[key360()]);
    }

    function analyzeSvgComplexity(svgMarkup) {
      const source = String(svgMarkup || "");
      const pathCount = (source.match(/<path\b/g) || []).length;
      const clipPathCount = (source.match(/<clipPath\b/g) || []).length;
      const bytes = source.length;

      return {
        bytes,
        pathCount,
        clipPathCount,
        isHeavy: bytes >= 900000 || pathCount >= 3500 || clipPathCount >= 1200
      };
    }

    function debugViewport(event, extra = {}) {
      if (!debugEnabled) return;
      console.info("[plano-debug]", {
        event,
        project: state.currentProject,
        phase: state.currentPhase,
        isMobile: state.isMobile,
        heavySvg: state.heavySvg,
        ...extra
      });
    }

    function setLoading(loading, message) {
      if (!refs.loading) return;
      refs.loading.classList.toggle("hidden", !loading);
      if (loading) {
        refs.loading.replaceChildren(
          AppCore.createElement("div", { className: "plano-spinner" }),
          AppCore.createElement("span", { text: message || "Cargando plano" })
        );
      }
    }

    function applyStaticState() {
      syncViewportFlags();
      if (refs.selectProject) refs.selectProject.value = state.currentProject;
      if (refs.selectPhase) refs.selectPhase.value = state.currentPhase;
      refs.body.classList.toggle("presentation-mode", state.presentationMode);
      refs.body.classList.toggle("sunlight-mode", state.visibilityMode === "sunlight");
      refs.body.classList.toggle("performance-mode", state.performanceMode);
      refs.body.classList.toggle("mobile-plano", state.isMobile);
      refs.btnExportPng?.classList.toggle("hidden", !options.allowExport);
      refs.btnExportPdf?.classList.toggle("hidden", !options.allowExport);
      refs.valuationPanel?.classList.toggle("hidden", !state.isAdmin);
      refs.projectionSummary?.classList.toggle("hidden", !state.isAdmin);
      document.getElementById("proyeccionControles")?.classList.toggle("hidden", !state.isAdmin);
      if (refs.headerKicker) refs.headerKicker.textContent = state.isAdmin ? "Plano administrativo" : "Plano comercial";
      if (refs.headerTitle) refs.headerTitle.textContent = `${state.currentProject} - ${state.currentPhase}`;
      if (refs.headerSubtitle) {
        refs.headerSubtitle.textContent = state.isAdmin
        ? `Operación ${state.presentationMode ? "comercial" : "operativa"} de lotes y seguimiento.`
          : `${state.presentationMode ? "Vista cliente" : "Disponibilidad y reserva"} para ${state.session.decoded.nombre || "asesor"}.`;
      }
      if (refs.miniInfo) refs.miniInfo.textContent = `${state.currentProject} - ${state.currentPhase}`;
      if (refs.btnPresentation) refs.btnPresentation.textContent = state.presentationMode ? "Salir de presentacion" : "Modo presentacion";
      if (refs.btnVisibility) refs.btnVisibility.textContent = state.visibilityMode === "sunlight" ? "Modo oscuro" : "Modo sol";
      refs.btn360?.classList.toggle("hidden", !has360());
    }

    function ensureDynamicChrome() {
      if (!refs.projectButton) {
        refs.projectButton = createActionButton("Contexto proyecto", "outline", openProjectContext);
        refs.projectButton.classList.add("btn-outline");
        refs.projectButton.classList.remove("plano-action");
        document.querySelector(".plano-toolbar")?.prepend(refs.projectButton);
      }

      if (!refs.compareDock) {
        refs.compareDock = AppCore.createElement("div", { className: "compare-dock hidden" });
        refs.compareList = AppCore.createElement("div", { className: "compare-dock__list" });
        refs.compareOpen = AppCore.createElement("button", {
          className: "btn-outline",
          text: "Abrir comparador",
          attrs: { type: "button" }
        });
        refs.compareClear = AppCore.createElement("button", {
          className: "btn-ghost",
          text: "Limpiar",
          attrs: { type: "button" }
        });
        refs.compareDock.append(refs.compareList, refs.compareOpen, refs.compareClear);
        refs.body.appendChild(refs.compareDock);
        refs.compareOpen.addEventListener("click", openCompareModal);
        refs.compareClear.addEventListener("click", clearCompareSelection);
      }

      if (!refs.compareModal) {
        refs.compareModal = AppCore.createElement("div", { className: "plano-modal hidden" });
        refs.compareModalBody = AppCore.createElement("div", { className: "plano-modal__body" });
        refs.compareClose = AppCore.createElement("button", {
          className: "btn-outline",
          text: "Cerrar",
          attrs: { type: "button" }
        });
        const shell = AppCore.createElement("div", { className: "plano-modal__sheet" }, [
          AppCore.createElement("div", { className: "plano-modal__header" }, [
            AppCore.createElement("div", {}, [
              AppCore.createElement("span", { className: "plano-kicker", text: "Comparador comercial" }),
              AppCore.createElement("h3", { text: "Comparar lotes" })
            ]),
            refs.compareClose
          ]),
          refs.compareModalBody
        ]);
        refs.compareModal.appendChild(shell);
        refs.body.appendChild(refs.compareModal);
        refs.compareClose.addEventListener("click", closeCompareModal);
        refs.compareModal.addEventListener("click", (event) => {
          if (event.target === refs.compareModal) closeCompareModal();
        });
      }

      if (!refs.projectModal) {
        refs.projectModal = AppCore.createElement("div", { className: "plano-modal hidden" });
        refs.projectModalBody = AppCore.createElement("div", { className: "plano-modal__body" });
        refs.projectModalClose = AppCore.createElement("button", {
          className: "btn-outline",
          text: "Cerrar",
          attrs: { type: "button" }
        });
        const shell = AppCore.createElement("div", { className: "plano-modal__sheet" }, [
          AppCore.createElement("div", { className: "plano-modal__header" }, [
            AppCore.createElement("div", {}, [
              AppCore.createElement("span", { className: "plano-kicker", text: "Mapa del proyecto" }),
              AppCore.createElement("h3", { text: "Contexto del proyecto" })
            ]),
            refs.projectModalClose
          ]),
          refs.projectModalBody
        ]);
        refs.projectModal.appendChild(shell);
        refs.body.appendChild(refs.projectModal);
        refs.projectModalClose.addEventListener("click", closeProjectContext);
        refs.projectModal.addEventListener("click", (event) => {
          if (event.target === refs.projectModal) closeProjectContext();
        });
      }
    }

    function setGestureLock(duration = 260) {
      state.touch.lockUntil = Date.now() + duration;
    }

    function isGestureLocked() {
      return Date.now() < state.touch.lockUntil;
    }

    function syncCompareHighlights() {
      const selectedLots = state.compareIds
        .map((lotId) => state.lotesMap.get(lotId))
        .filter(Boolean);
      state.compareHighlights = PlanoUtils.buildComparisonHighlights(selectedLots);
    }

    function renderCompareDock() {
      if (!refs.compareDock || !refs.compareList || !refs.compareOpen || !refs.compareClear) return;

      syncCompareHighlights();
      AppCore.clearElement(refs.compareList);
      const selectedLots = state.compareIds
        .map((lotId) => state.lotesMap.get(lotId))
        .filter(Boolean);

      refs.compareDock.classList.toggle("hidden", !selectedLots.length);
      refs.compareOpen.disabled = selectedLots.length < 2;
      refs.compareClear.disabled = !selectedLots.length;

      selectedLots.forEach((lote) => {
        const item = AppCore.createElement("button", {
          className: "compare-chip",
          text: lote.lote_id,
          attrs: { type: "button" }
        });
        item.addEventListener("click", () => toggleCompareLot(lote.lote_id));
        refs.compareList.appendChild(item);
      });
    }

    function toggleCompareLot(loteId) {
      const existingIndex = state.compareIds.indexOf(loteId);
      if (existingIndex >= 0) {
        state.compareIds.splice(existingIndex, 1);
      } else {
        if (state.compareIds.length >= 3) {
          state.compareIds.shift();
        }
        state.compareIds.push(loteId);
      }
      syncCompareHighlights();
      renderCompareDock();
      if (state.selectedLotId) {
        const selected = state.lotesMap.get(state.selectedLotId);
        if (selected) renderPanel(selected);
      }
    }

    function clearCompareSelection() {
      state.compareIds = [];
      syncCompareHighlights();
      renderCompareDock();
      closeCompareModal();
      if (state.selectedLotId) {
        const selected = state.lotesMap.get(state.selectedLotId);
        if (selected) renderPanel(selected);
      }
    }

    function closeCompareModal() {
      refs.compareModal?.classList.add("hidden");
      refs.body.classList.remove("no-scroll");
    }

    function openCompareModal() {
      if (!refs.compareModalBody || state.compareIds.length < 2) return;

      const selectedLots = state.compareIds
        .map((lotId) => state.lotesMap.get(lotId))
        .filter(Boolean);
      syncCompareHighlights();
      AppCore.clearElement(refs.compareModalBody);

      const grid = AppCore.createElement("div", { className: "compare-grid" });
      selectedLots.forEach((lote) => {
        const winners = state.compareHighlights.get(lote.lote_id) || [];
        const card = AppCore.createElement("article", { className: "compare-card" }, [
          AppCore.createElement("div", { className: "compare-card__top" }, [
            AppCore.createElement("div", {}, [
              AppCore.createElement("span", { className: "plano-kicker", text: formatLotRouteContext(lote) }),
              AppCore.createElement("h4", { text: lote.lote_id })
            ]),
            createStatusBadge(PlanoUtils.getStatusMeta(lote.estado))
          ]),
          AppCore.createElement("div", { className: "compare-card__badges" }, winners.map((label) =>
            AppCore.createElement("span", { className: "quality-badge", text: label })
          )),
          AppCore.createElement("div", { className: "compare-card__grid" }, [
            createDetailItem("Precio", PlanoUtils.formatCurrency(lote.precio_publico || lote.precio || 0)),
            createDetailItem("Área", PlanoUtils.formatArea(lote.area)),
            createDetailItem("Precio/m²", lote.pricePerM2 ? PlanoUtils.formatCurrency(lote.pricePerM2) : "No disponible"),
            createDetailItem("Puntaje", `${lote.score || 0}/100`),
            createDetailItem("Contexto", lote.contextLabel || "Sin contexto"),
            createDetailItem("Recomendación", lote.scoreLabel || "Valor estable")
          ]),
          createInsightList([
            lote.recommendation || "Sin recomendación destacada.",
            lote.contextDetail || "Sin contexto relativo adicional."
          ])
        ]);
        grid.appendChild(card);
      });

      refs.compareModalBody.appendChild(grid);
      refs.compareModal.classList.remove("hidden");
      refs.body.classList.add("no-scroll");
    }

    function closeProjectContext() {
      refs.projectModal?.classList.add("hidden");
      refs.body.classList.remove("no-scroll");
    }

    function openProjectContext() {
      if (!refs.projectModalBody) return;

      const recommendedLot = [...state.lotes]
        .filter((lote) => lote.estado === "disponible")
        .sort((left, right) => PlanoUtils.safeNumber(right.score) - PlanoUtils.safeNumber(left.score))[0] || null;
      const availableLots = state.lotes.filter((lote) => lote.estado === "disponible").length;

      AppCore.clearElement(refs.projectModalBody);
      refs.projectModalBody.append(
        AppCore.createElement("section", { className: "detail-card" }, [
          AppCore.createElement("h3", { text: "Vista tipo mapa preparada" }),
          AppCore.createElement("p", {
            className: "detail-note",
            text: "La estructura queda lista para coordenadas o enlace real del proyecto. Mientras tanto, esta vista resume el contexto comercial sin depender de APIs pesadas."
          }),
          AppCore.createElement("div", { className: "detail-grid" }, [
            createDetailItem("Proyecto", state.currentProject),
            createDetailItem("Fase", state.currentPhase),
            createDetailItem("Lotes visibles", String(state.lotes.length)),
            createDetailItem("Disponibles", String(availableLots)),
            createDetailItem("Promedio m²", state.benchmark?.avgPricePerM2 ? PlanoUtils.formatCurrency(state.benchmark.avgPricePerM2) : "No disponible"),
            createDetailItem("Lote sugerido", recommendedLot?.lote_id || "Sin sugerencia")
          ])
        ])
      );

      if (recommendedLot) {
        refs.projectModalBody.appendChild(AppCore.createElement("section", { className: "detail-card" }, [
          AppCore.createElement("h3", { text: "Mejor alternativa del momento" }),
          createInsightList([
            `${recommendedLot.lote_id}: ${recommendedLot.scoreLabel}`,
            recommendedLot.recommendation || "Sin insight adicional."
          ])
        ]));
      }

      refs.projectModal.classList.remove("hidden");
      refs.body.classList.add("no-scroll");
    }

    function buildLotGeometry() {
      state.lotGeometry = new Map();
      state.projectBounds = null;
      if (!state.svg) return;
      const projectBounds = PlanoUtils.getContentBounds(state.svg, state.lotElements);
      if (!projectBounds?.width || !projectBounds?.height) return;
      state.projectBounds = projectBounds;

      const toleranceX = Math.max(projectBounds.width * 0.035, 18);
      const toleranceY = Math.max(projectBounds.height * 0.04, 18);

      state.lotes.forEach((lote) => {
        const path = getLotElement(lote.lote_id);
        if (!path?.getBBox) return;
        const bounds = path.getBBox();
        const nearLeft = bounds.x <= projectBounds.x + toleranceX;
        const nearRight = bounds.x + bounds.width >= projectBounds.x + projectBounds.width - toleranceX;
        const nearTop = bounds.y <= projectBounds.y + toleranceY;
        const nearBottom = bounds.y + bounds.height >= projectBounds.y + projectBounds.height - toleranceY;
        const edgeCount = [nearLeft, nearRight, nearTop, nearBottom].filter(Boolean).length;
        const centerX = bounds.x + bounds.width / 2;
        const centerY = bounds.y + bounds.height / 2;
        const verticalZone = centerY < projectBounds.y + projectBounds.height * 0.33
          ? "top"
          : centerY > projectBounds.y + projectBounds.height * 0.66
            ? "bottom"
            : "middle";

        state.lotGeometry.set(lote.lote_id, {
          bounds,
          edgeCount,
          isCorner: edgeCount >= 2,
          nearLeft,
          nearRight,
          nearTop,
          nearBottom,
          verticalZone,
          centerX,
          centerY
        });
      });
    }

    function enrichCommercialData() {
      state.benchmark = PlanoUtils.createProjectBenchmark(
        state.lotes.filter((lote) => lote.estado !== "vendido")
      );

      state.lotes = state.lotes.map((lote) => {
        const spatialMeta = state.lotGeometry.get(lote.lote_id) || {};
        const profile = PlanoUtils.buildCommercialProfile(lote, state.benchmark, spatialMeta);
        return {
          ...lote,
          ...profile,
          financial: PlanoUtils.buildFinancialSummary(lote),
          riskAlerts: PlanoUtils.buildRiskAlerts(lote)
        };
      });

      state.lotesMap = new Map(state.lotes.map((item) => [item.lote_id, item]));
      syncCompareHighlights();
    }

    function updateSummary() {
      if (!refs.summary) return;
      const counters = { disponible: 0, reservado: 0, vendido: 0, financiado: 0 };
      const riskCount = state.lotes.filter((lote) => Array.isArray(lote.riskAlerts) && lote.riskAlerts.length).length;
      state.lotes.forEach((lote) => {
        if (counters[lote.estado] !== undefined) {
          counters[lote.estado] += 1;
        }
      });

      AppCore.clearElement(refs.summary);
      refs.summary.append(
        createSummaryPill("Disponibles", String(counters.disponible), PlanoUtils.getColorEstado("disponible")),
        createSummaryPill("Reservados", String(counters.reservado), PlanoUtils.getColorEstado("reservado")),
        createSummaryPill("Vendidos", String(counters.vendido), PlanoUtils.getColorEstado("vendido")),
        createSummaryPill("Financiados", String(counters.financiado), PlanoUtils.getColorEstado("financiado")),
        createSummaryPill("Prom. m²", state.benchmark?.avgPricePerM2 ? PlanoUtils.formatCurrency(state.benchmark.avgPricePerM2) : "S/ 0.00", "#53a7ff"),
        createSummaryPill("Alertas", String(riskCount), riskCount ? "#ff8b5c" : "#8f99b0")
      );
    }

    function clearSelection() {
      const selectedPath = state.selectedLotId
        ? getLotElement(state.selectedLotId)
        : state.svg?.querySelector?.(".plano-path.selected");
      selectedPath?.classList.remove("selected");
      clearHighlightedLots();
    }

    function closePanel() {
      refs.panel?.classList.remove("active");
      refs.overlay?.classList.remove("active");
      clearSelection();
      state.selectedLotId = "";
      state.visibleSections.detail = false;
      state.visibleSections.operational = false;
      state.visibleSections.edit = false;
      state.visibleSections.quickReserve = false;
      requestLabelRefresh(true);
    }

    function getQuickReserveDraft() {
      try {
        return JSON.parse(localStorage.getItem("plano_quick_reserve_draft") || "{}");
      } catch (error) {
        return {};
      }
    }

    function saveQuickReserveDraft(draft) {
      localStorage.setItem("plano_quick_reserve_draft", JSON.stringify(draft || {}));
    }

        function buildSimulationBlock(lote) {
      const section = AppCore.createElement("section", { className: "detail-card" }, [
        AppCore.createElement("h3", { text: "Simulación comercial" })
      ]);
      const totalPrice = lote.precio_publico || lote.precio || 0;
      const controls = AppCore.createElement("div", { className: "simulation-controls" });
      const initialInput = AppCore.createElement("input", {
        attrs: {
          type: "number",
          min: "0",
          step: "100",
          inputmode: "decimal",
          value: String(state.simulation.initial)
        }
      });
<<<<<<< HEAD
      const installmentsInput = AppCore.createElement("input", {
        attrs: {
          type: "number",
          min: "1",
          max: "240",
          step: "1",
          inputmode: "numeric",
          value: String(state.simulation.months || 48)
=======
      const monthsInput = AppCore.createElement("input", {
        attrs: {
          type: "number",
          min: "1",
          max: "120",
          step: "1",
          inputmode: "numeric",
          value: String(simulation.months)
>>>>>>> 95265aa (deploy)
        }
      });
      const detailGrid = AppCore.createElement("div", { className: "detail-grid" });
      const initialDetail = createDetailItem("Inicial", PlanoUtils.formatCurrency(simulation.initial));
      const monthlyDetail = createDetailItem("Monto por cuota", PlanoUtils.formatCurrency(simulation.monthly));
      const financedDetail = createDetailItem("A financiar", PlanoUtils.formatCurrency(simulation.financed));
      const monthsDetail = createDetailItem("Número de cuotas", String(simulation.months));
      const reserveNote = AppCore.createElement("div", {
        className: `detail-note${simulation.reserveApplied > 0 ? "" : " hidden"}`,
        text: simulation.reserveApplied > 0
          ? `La simulación descuenta una reserva ya registrada de ${PlanoUtils.formatCurrency(simulation.reserveApplied)} al calcular la inicial neta.`
          : ""
      });

      detailGrid.append(
        initialDetail,
        monthlyDetail,
        financedDetail,
        monthsDetail
      );

      const detailNodes = {
        initial: initialDetail.querySelector("strong, p"),
        monthly: monthlyDetail.querySelector("strong, p"),
        financed: financedDetail.querySelector("strong, p"),
        months: monthsDetail.querySelector("strong, p")
      };

      function updateSimulationSummary() {
        const nextSimulation = PlanoUtils.buildPurchaseSimulation(totalPrice, {
          initial: state.simulation.initial,
          months: state.simulation.months,
          reserveApplied: lote.monto_reserva
        });

        if (detailNodes.initial) detailNodes.initial.textContent = PlanoUtils.formatCurrency(nextSimulation.initial);
        if (detailNodes.monthly) detailNodes.monthly.textContent = PlanoUtils.formatCurrency(nextSimulation.monthly);
        if (detailNodes.financed) detailNodes.financed.textContent = PlanoUtils.formatCurrency(nextSimulation.financed);
        if (detailNodes.months) detailNodes.months.textContent = String(nextSimulation.months);

        if (nextSimulation.reserveApplied > 0) {
          reserveNote.textContent = `La simulación descuenta una reserva ya registrada de ${PlanoUtils.formatCurrency(nextSimulation.reserveApplied)} al calcular la inicial neta.`;
          reserveNote.classList.remove("hidden");
        } else {
          reserveNote.textContent = "";
          reserveNote.classList.add("hidden");
        }
      }

<<<<<<< HEAD
      const metricsGrid = AppCore.createElement("div", { className: "detail-grid" });
      const initialItem = createDetailItem("Inicial", PlanoUtils.formatCurrency(0));
      const installmentItem = createDetailItem("Cuota estimada", PlanoUtils.formatCurrency(0));
      const financedItem = createDetailItem("A financiar", PlanoUtils.formatCurrency(0));
      const countItem = createDetailItem("Cuotas", "0");
      metricsGrid.append(initialItem, installmentItem, financedItem, countItem);

      const reserveNote = AppCore.createElement("div", { className: "detail-note hidden" });
      const metricTargets = {
        initial: initialItem.querySelector("strong, p"),
        installment: installmentItem.querySelector("strong, p"),
        financed: financedItem.querySelector("strong, p"),
        count: countItem.querySelector("strong, p")
      };

      const resolveSimulation = () => {
        const rawInitial = String(initialInput.value || "").trim();
        const rawInstallments = String(installmentsInput.value || "").trim();
        return PlanoUtils.buildPurchaseSimulation(totalPrice, {
          initial: rawInitial === "" ? state.simulation.initial : PlanoUtils.safeNumber(rawInitial, state.simulation.initial),
          months: rawInstallments === "" ? state.simulation.months : PlanoUtils.safeNumber(rawInstallments, state.simulation.months),
          reserveApplied: lote.monto_reserva
        });
      };

      const refreshSimulation = (normalizeInputs = false) => {
        const simulation = resolveSimulation();
        state.simulation.initial = simulation.initial;
        state.simulation.months = simulation.installments;
        metricTargets.initial.textContent = PlanoUtils.formatCurrency(simulation.initial);
        metricTargets.installment.textContent = PlanoUtils.formatCurrency(simulation.monthly);
        metricTargets.financed.textContent = PlanoUtils.formatCurrency(simulation.financed);
        metricTargets.count.textContent = String(simulation.installments);

        if (normalizeInputs) {
          initialInput.value = String(simulation.initial);
          installmentsInput.value = String(simulation.installments);
        }

        if (simulation.reserveApplied > 0) {
          reserveNote.textContent = `La simulación descuenta una reserva ya registrada de ${PlanoUtils.formatCurrency(simulation.reserveApplied)} al calcular la inicial neta.`;
          reserveNote.classList.remove("hidden");
        } else {
          reserveNote.textContent = "";
          reserveNote.classList.add("hidden");
        }
      };

      initialInput.addEventListener("input", () => refreshSimulation(false));
      initialInput.addEventListener("blur", () => {
        if (!String(initialInput.value || "").trim()) initialInput.value = "0";
        refreshSimulation(true);
=======
      initialInput.addEventListener("input", () => {
        state.simulation.initial = PlanoUtils.safeNumber(initialInput.value, state.simulation.initial);
        updateSimulationSummary();
      });
      monthsInput.addEventListener("input", () => {
        if (monthsInput.value === "") {
          updateSimulationSummary();
          return;
        }
        const nextMonths = PlanoUtils.clamp(
          Math.round(PlanoUtils.safeNumber(monthsInput.value, state.simulation.months)),
          1,
          120
        );
        state.simulation.months = nextMonths;
        updateSimulationSummary();
>>>>>>> 95265aa (deploy)
      });
      installmentsInput.addEventListener("input", () => refreshSimulation(false));
      installmentsInput.addEventListener("blur", () => refreshSimulation(true));

      controls.append(
        AppCore.createElement("label", { className: "simulation-field" }, [
          AppCore.createElement("span", { text: "Inicial estimada" }),
          initialInput
        ]),
        AppCore.createElement("label", { className: "simulation-field" }, [
<<<<<<< HEAD
          AppCore.createElement("span", { text: "Cuotas" }),
          installmentsInput
        ])
      );

      section.append(controls, metricsGrid, reserveNote);
      refreshSimulation(true);
=======
          AppCore.createElement("span", { text: "Número de cuotas" }),
          monthsInput
        ])
      );

      section.append(
        controls,
        detailGrid
      );

      section.appendChild(reserveNote);
>>>>>>> 95265aa (deploy)
      return section;
    }

    function buildQuickReserveBlock(lote) {
      const draft = getQuickReserveDraft();
      const section = AppCore.createElement("section", { className: "detail-card" }, [
        AppCore.createElement("h3", { text: "Pre-reserva rápida" })
      ]);
      const form = AppCore.createElement("form", { className: "detail-inline-form" });
      const status = AppCore.createElement("div", { className: "detail-note", text: "Completa solo los datos mínimos para iniciar una reserva rápida en campo." });
      const submit = AppCore.createElement("button", {
        className: "plano-action",
        text: "Crear pre-reserva",
        attrs: { type: "submit" }
      });

      const fields = [
        { name: "cliente_actual", label: "Cliente", type: "text", value: draft.cliente_actual || "" },
        { name: "dni_cliente", label: "Documento", type: "text", value: draft.dni_cliente || "" },
        { name: "telefono_cliente", label: "Teléfono", type: "text", value: draft.telefono_cliente || "" },
        { name: "monto_reserva", label: "Separación", type: "number", value: draft.monto_reserva || "3000" }
      ];

      fields.forEach((field) => {
        form.appendChild(AppCore.createElement("label", {}, [
          field.label,
          AppCore.createElement("input", {
            attrs: {
              type: field.type,
              name: field.name,
              value: field.value,
              min: field.type === "number" ? "0" : undefined,
              step: field.type === "number" ? "1" : undefined
            }
          })
        ]));
      });

      form.appendChild(submit);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        submit.disabled = true;
        status.textContent = "Registrando pre-reserva...";

        const payload = Object.fromEntries(new FormData(form).entries());
        payload.action = "crear_reserva";
        payload.unidad_record_id = lote.unidad_record_id;
        payload.descuento_solicitado = 0;
        payload.sobreprecio = 0;
        payload.motivo_descuento = "";

        try {
          saveQuickReserveDraft(payload);
          const response = await AppCore.apiRequest({
            method: "POST",
            auth: true,
            body: payload
          });
          status.textContent = "Pre-reserva creada correctamente.";
          state.visibleSections.quickReserve = false;
          await loadScenario(state.currentProject, state.currentPhase);
          if (response?.reserva_id) {
            window.open(`/ver-reserva.html?id=${encodeURIComponent(response.reserva_id)}`, "_blank", "noopener");
          }
          window.setTimeout(() => {
            const updatedLot = state.lotesMap.get(lote.lote_id);
            if (updatedLot) {
              setSelectedLot(updatedLot.lote_id, false);
            }
          }, 120);
        } catch (error) {
          status.textContent = AppCore.getErrorMessage(error, "No se pudo crear la pre-reserva.");
        } finally {
          submit.disabled = false;
        }
      });

      section.append(form, status);
      return section;
    }

    function renderPanel(lote) {
      if (!lote || !refs.panel) return;

      if (refs.panelEyebrow) {
        refs.panelEyebrow.textContent = state.presentationMode
          ? "Vista comercial"
          : state.isAdmin
            ? "Ficha operativa"
            : "Detalle del lote";
      }
      if (refs.panelTitle) refs.panelTitle.textContent = lote.lote_id;
      if (refs.panelSubtitle) refs.panelSubtitle.textContent = formatLotRouteContext(lote);

      AppCore.clearElement(refs.panelStatus);
      refs.panelStatus?.appendChild(createStatusBadge(PlanoUtils.getStatusMeta(lote.estado)));
      if (Array.isArray(lote.riskAlerts) && lote.riskAlerts.length) {
        refs.panelStatus?.appendChild(AppCore.createElement("div", {
          className: "risk-badge-row"
        }, lote.riskAlerts.slice(0, 3).map(createRiskBadge)));
      }

      AppCore.clearElement(refs.panelMetrics);
      refs.panelMetrics?.append(
        createMetric("Precio", PlanoUtils.formatCurrency(lote.precio_publico || lote.precio || 0)),
        createMetric("Área", PlanoUtils.formatArea(lote.area)),
        createMetric("Estado", commercialStateLabel(lote)),
        createMetric(state.isAdmin && lote.financial?.hasData ? "Avance" : "Puntaje", state.isAdmin && lote.financial?.hasData ? `${lote.financial.avance}%` : `${lote.score || 0}/100`)
      );

      AppCore.clearElement(refs.panelActions);
      const actions = [];
      const canViewReserve = Boolean(lote.reserva_id && (state.isAdmin || lote.can_view_reserva));
      const inCompare = state.compareIds.includes(lote.lote_id);

      if (!state.isAdmin && lote.estado === "disponible" && !state.presentationMode) {
        actions.push(createActionButton("Reservar", "primary", () => {
          window.location.href = `/index.html?unidad_id=${encodeURIComponent(lote.lote_id)}`;
        }));
        actions.push(createActionButton(
          state.visibleSections.quickReserve ? "Cerrar pre-reserva" : "Pre-reserva rápida",
          "outline",
          () => {
            state.visibleSections.quickReserve = !state.visibleSections.quickReserve;
            renderPanel(lote);
          }
        ));
      }

      actions.push(createActionButton(
        inCompare ? "Quitar comparador" : "Comparar",
        "outline",
        () => toggleCompareLot(lote.lote_id)
      ));

      if (canViewReserve) {
        actions.push(createActionButton("Ver ficha", "outline", () => {
          const url = state.isAdmin
            ? `/ver-reserva-admin.html?id=${encodeURIComponent(lote.reserva_id)}`
            : `/ver-reserva.html?id=${encodeURIComponent(lote.reserva_id)}`;
          window.open(url, "_blank", "noopener");
        }));
      }

      actions.push(createActionButton(
        state.visibleSections.detail ? "Ocultar detalle" : "Ver detalle",
        "ghost",
        () => {
          state.visibleSections.detail = !state.visibleSections.detail;
          renderPanel(lote);
        }
      ));

      if (has360()) {
        actions.push(createActionButton("Vista 360", "ghost", open360));
      }

      if (state.isAdmin && !state.presentationMode) {
        actions.push(createActionButton(
          state.visibleSections.operational ? "Ocultar operativo" : "Estado comercial",
          "outline",
          () => {
            state.visibleSections.operational = !state.visibleSections.operational;
            renderPanel(lote);
          }
        ));

        if (lote.venta_id) {
          actions.push(createActionButton("Ver venta", "outline", () => {
            window.open(`/admin.html?view=venta&id=${encodeURIComponent(lote.venta_id)}`, "_blank", "noopener");
          }));
        }

        actions.push(createActionButton(
          state.visibleSections.edit ? "Cerrar edición" : "Editar",
          "primary",
          () => {
            state.visibleSections.edit = !state.visibleSections.edit;
            renderPanel(lote);
          }
        ));
      }

      refs.panelActions?.append(...actions);

      const publicBlock = buildPublicBlock(lote, state.currentProject, state.currentPhase);
      publicBlock.id = "detailPublicBlock";
      publicBlock.appendChild(buildSimulationBlock(lote));
      if (!state.presentationMode) {
        publicBlock.appendChild(buildRiskBlock(lote));
      }
      if (!state.isAdmin && state.visibleSections.quickReserve && lote.estado === "disponible" && !state.presentationMode) {
        publicBlock.appendChild(buildQuickReserveBlock(lote));
      }
      refs.panelPublic?.replaceWith(publicBlock);
      refs.panelPublic = publicBlock;

      const commercialBlock = buildCommercialBlock(lote, state.visibleSections.detail, state.isAdmin);
      commercialBlock.id = "detailCommercialBlock";
      refs.panelCommercial?.replaceWith(commercialBlock);
      refs.panelCommercial = commercialBlock;

      const operationalBlock = buildOperationalBlock(lote, state.visibleSections.operational);
      operationalBlock.id = "detailOperationalBlock";
      if (state.isAdmin && !state.presentationMode) {
        operationalBlock.appendChild(buildFinancialBlock(lote));
      }
      refs.panelOperational?.replaceWith(operationalBlock);
      refs.panelOperational = operationalBlock;

      const editBlock = buildEditBlock(
        lote,
        state.isAdmin && !state.presentationMode && state.visibleSections.edit,
        async (form, button) => {
          if (!lote.unidad_record_id) {
            alert("La unidad no cuenta con identificador para editar.");
            return;
          }
          try {
            button.disabled = true;
            await AppCore.apiRequest({
              method: "PATCH",
              auth: true,
              body: {
                action: "editar_unidad",
                unidad_id: lote.unidad_record_id,
                precio: form.querySelector('[name="precio"]')?.value || "",
                area: form.querySelector('[name="area"]')?.value || "",
                estado: form.querySelector('[name="estado"]')?.value || ""
              }
            });
            lote.precio = PlanoUtils.safeNumber(form.querySelector('[name="precio"]')?.value);
            lote.precio_publico = lote.precio;
            lote.area = PlanoUtils.safeNumber(form.querySelector('[name="area"]')?.value);
            lote.estado = PlanoUtils.normalizeText(form.querySelector('[name="estado"]')?.value);
            repaintLots();
            updateSummary();
            updateValuation();
            renderPanel(lote);
          } catch (error) {
            alert(AppCore.getErrorMessage(error, "No se pudo actualizar la unidad."));
          } finally {
            button.disabled = false;
          }
        },
        () => {
          state.visibleSections.edit = false;
          renderPanel(lote);
        }
      );
      editBlock.id = "detailEditBlock";
      refs.panelEdit?.replaceWith(editBlock);
      refs.panelEdit = editBlock;

      refs.panel.classList.add("active");
      refs.overlay?.classList.add("active");
      renderCompareDock();
    }

    function repaintLots() {
      if (!state.svg) return;
      state.lotes.forEach((lote) => {
        const element = getLotElement(lote.lote_id);
        if (!element) return;
        element.classList.add("plano-path");
        element.style.fill = PlanoUtils.getColorEstado(lote.estado);
      });
      applyFilters();
    }

    function getInitialFitBounds() {
      if (!state.svg) return null;
      if (state.projectBounds?.width && state.projectBounds?.height) {
        return state.projectBounds;
      }
      state.projectBounds = PlanoUtils.getContentBounds(state.svg, state.lotElements);
      return state.projectBounds;
    }

    function buildCenteredView(bounds, scale) {
      const wrapperRect = refs.wrapper?.getBoundingClientRect?.();
      if (!wrapperRect?.width || !wrapperRect?.height || !bounds?.width || !bounds?.height || !scale) {
        return { x: 0, y: 0, scale: scale || 1 };
      }

      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;

      return {
        x: wrapperRect.width / (2 * scale) - centerX,
        y: wrapperRect.height / (2 * scale) - centerY,
        scale
      };
    }

    function getMobileInitialViewportConfig(bounds) {
      const wrapperRect = refs.wrapper?.getBoundingClientRect?.();
      const wrapperWidth = PlanoUtils.safeNumber(wrapperRect?.width);
      const wrapperHeight = PlanoUtils.safeNumber(wrapperRect?.height);
      const wrapperAspect = wrapperWidth && wrapperHeight ? wrapperWidth / wrapperHeight : 1;
      const contentAspect = bounds?.width && bounds?.height ? bounds.width / bounds.height : 1;

      let paddingRatio = state.performanceMode ? 0.964 : 0.972;
      if (contentAspect > wrapperAspect * 1.14) {
        paddingRatio = Math.max(paddingRatio, 0.988);
      } else if (contentAspect < wrapperAspect * 0.84) {
        paddingRatio = Math.min(paddingRatio, 0.966);
      }

      if (state.currentProject === "VG") {
        paddingRatio = Math.max(paddingRatio, 0.992);
      } else if (state.currentProject === "PR") {
        paddingRatio = Math.max(paddingRatio, 0.982);
      }

      return {
        paddingRatio: PlanoUtils.clamp(paddingRatio, 0.958, 0.995),
        floorRatio: state.performanceMode ? 0.965 : 0.972
      };
    }

    function computeInitialView() {
      const bounds = getInitialFitBounds();
      if (!bounds) return null;
      if (!state.isMobile) {
        const desktopPadding = state.currentProject === "VG" ? 0.985 : 0.955;
        return PlanoUtils.calculateFitTransform(refs.wrapper, bounds, desktopPadding);
      }

      const wrapperRect = refs.wrapper?.getBoundingClientRect?.();
      const wrapperWidth = PlanoUtils.safeNumber(wrapperRect?.width);
      const wrapperHeight = PlanoUtils.safeNumber(wrapperRect?.height);
      const config = getMobileInitialViewportConfig(bounds);
      const view = PlanoUtils.calculateFitTransform(refs.wrapper, bounds, config.paddingRatio);

      if (!wrapperWidth || !wrapperHeight || !bounds.width || !bounds.height) {
        return view;
      }

      const exactFitScale = Math.min(wrapperWidth / bounds.width, wrapperHeight / bounds.height);
      const targetScale = Math.max(view.scale, exactFitScale * config.floorRatio);

      return targetScale === view.scale
        ? view
        : buildCenteredView(bounds, targetScale);
    }

    function refreshScaleRange(fitView = null) {
      const resolvedFit = fitView || computeInitialView();
      const fitScale = PlanoUtils.safeNumber(resolvedFit?.scale, 0);
      let minScale = state.isMobile ? 0.05 : 0.55;
      let maxScale = state.isMobile ? 8.5 : 10;

      if (fitScale > 0) {
        minScale = state.isMobile
          ? fitScale * 0.88
          : Math.min(0.55, fitScale * 0.82);
        if (state.isMobile) {
          maxScale = state.performanceMode ? 8 : 8.75;
        }
      }

      state.scaleRange = {
        min: Math.max(minScale, 0.005),
        max: Math.max(maxScale, Math.max(minScale, 0.005) + 0.75)
      };

      debugViewport("scale-range", {
        fitScale,
        scaleRange: state.scaleRange
      });

      return state.scaleRange;
    }

    function applyScaleRange() {
      if (!state.panzoom || !state.scaleRange) return;
      if (state.isMobile && typeof state.panzoom.setScaleRange === "function") {
        state.panzoom.setScaleRange(state.scaleRange);
        return;
      }
      if (typeof state.panzoom.setOptions === "function") {
        state.panzoom.setOptions({
          minScale: state.scaleRange.min,
          maxScale: state.scaleRange.max
        });
      }
    }

    function refreshInitialView(options = {}) {
      state.initialView = computeInitialView();
      refreshScaleRange(state.initialView);
      applyScaleRange();
      if (!options.apply || !state.initialView || !state.panzoom) return;
      PlanoUtils.applyView(state.panzoom, state.initialView, {
        animate: options.animate !== false,
        duration: options.duration || 360
      });
    }

    function buildLabels() {
      if (!state.svg) return;
      state.svg.querySelectorAll(".plano-label-layer").forEach((node) => node.remove());
      state.labelNodes.clear();
      state.labelRender.force = true;
      return;
    }

    function requestLabelRefresh(force = false) {
      if (force) {
        state.labelRender.force = true;
      }
      updateLabels();
    }

    const updateLabels = PlanoUtils.throttleFrame(() => {
      if (!state.panzoom || !state.labelNodes.size || state.isMobile || state.performanceMode) return;
      const scale = state.panzoom.getScale();
      const mode = PlanoUtils.getLabelMode(scale, state.isMobile);
      const scaleDelta = Math.abs(scale - PlanoUtils.safeNumber(state.labelRender.scale));
      if (!state.labelRender.force && state.labelRender.mode === mode && scaleDelta < 0.16) {
        return;
      }
      state.labelRender.force = false;
      state.labelRender.mode = mode;
      state.labelRender.scale = scale;
      const visibleLotes = new Set(
        state.lotes
          .filter((lote) => state.filteredStates.has(lote.estado))
          .map((lote) => lote.lote_id)
      );
      let mobileCounter = 0;

      state.labelNodes.forEach((entry, loteId) => {
        const lote = state.lotesMap.get(loteId);
        const selected = state.selectedLotId === loteId;
        const visible = visibleLotes.has(loteId);
        const tooSmall = entry.bounds.width * entry.bounds.height < 450;
        const show = visible && (selected || mode !== "hidden") && (!tooSmall || scale >= 1.6 || selected);

        if (state.isMobile && !selected && show) {
          mobileCounter += 1;
        }

        const canShow = show && (!state.isMobile || selected || mobileCounter <= 55);
        entry.group.classList.toggle("is-visible", canShow);
        if (!canShow) return;

        const secondary = mode === "code"
          ? ""
          : mode === "compact"
            ? (state.presentationMode ? PlanoUtils.getStatusMeta(lote.estado).label : PlanoUtils.formatCompactCurrency(lote.precio_publico || lote.precio || 0))
            : PlanoUtils.formatCompactCurrency(lote.precio_publico || lote.precio || 0);
        const tertiary = mode === "full" ? PlanoUtils.getStatusMeta(lote.estado).label : "";
        const lineCount = 1 + (secondary ? 1 : 0) + (tertiary ? 1 : 0);
        const width = Math.max(64, Math.min(132, Math.max(entry.bounds.width * 0.9, lote.lote_id.length * 8 + 26)));
        const height = 24 + (lineCount - 1) * 12;

        entry.pill.setAttribute("x", String(entry.centerX - width / 2));
        entry.pill.setAttribute("y", String(entry.centerY - height / 2));
        entry.pill.setAttribute("width", String(width));
        entry.pill.setAttribute("height", String(height));
        entry.code.textContent = lote.lote_id;
        entry.price.textContent = secondary;
        entry.status.textContent = tertiary;
        entry.code.setAttribute("y", String(entry.centerY - (lineCount === 1 ? 0 : 10)));
        entry.price.setAttribute("y", String(entry.centerY + (tertiary ? 4 : 10)));
        entry.status.setAttribute("y", String(entry.centerY + 18));
      });

      PlanoUtils.updateSvgTextSize(state.svg, state.panzoom);
    });

    function applyFilters() {
      state.filteredStates = new Set(
        refs.filters
          .filter((input) => input.checked)
          .map((input) => PlanoUtils.normalizeText(input.value))
      );

      state.lotes.forEach((lote) => {
        const element = getLotElement(lote.lote_id);
        if (!element) return;
        element.classList.toggle("is-muted", !state.filteredStates.has(lote.estado));
      });

      requestLabelRefresh(true);
    }

    function updateValuation() {
      if (!state.isAdmin || !refs.valActual) return;

      let totalActual = 0;
      let totalProjected = 0;
      let totalArea = 0;
      let availableValue = 0;
      let soldLots = 0;

      state.lotes.forEach((lote) => {
        const currentPrice = PlanoUtils.safeNumber(lote.precio);
        const projectedPrice = lote.precio_simulado ? PlanoUtils.safeNumber(lote.precio_simulado) : currentPrice;
        totalActual += currentPrice;
        totalProjected += projectedPrice;
        totalArea += PlanoUtils.safeNumber(lote.area);
        if (lote.estado === "disponible") availableValue += projectedPrice;
        if (lote.estado === "vendido") soldLots += 1;
      });

      const totalLots = Math.max(state.lotes.length, 1);
      refs.valActual.textContent = PlanoUtils.formatCurrency(totalActual);
      refs.valProyectado.textContent = PlanoUtils.formatCurrency(totalProjected);
      refs.valGanancia.textContent = PlanoUtils.formatCurrency(totalProjected - totalActual);
      refs.valPromedioM2.textContent = totalArea ? PlanoUtils.formatCurrency(totalProjected / totalArea) : "S/ 0.00";
      refs.valDisponible.textContent = PlanoUtils.formatCurrency(availableValue);
      refs.valVendido.textContent = `${((soldLots / totalLots) * 100).toFixed(1)}%`;
      refs.projectionSummary?.replaceChildren(
        AppCore.createElement("div", { text: `Proyecto actual: ${PlanoUtils.formatCurrency(totalActual)}` }),
        AppCore.createElement("div", { text: `Proyecto proyectado: ${PlanoUtils.formatCurrency(totalProjected)}` }),
        AppCore.createElement("div", { text: `Disponible comercial: ${PlanoUtils.formatCurrency(availableValue)}` })
      );
    }

    function simulatePrices() {
      if (!state.isAdmin) return;
      const mode = refs.variationType?.value || "porcentaje";
      const delta = PlanoUtils.safeNumber(refs.variationPrice?.value);

      state.lotes.forEach((lote) => {
        if (lote.estado !== "disponible" || !delta) {
          delete lote.precio_simulado;
          return;
        }
        lote.precio_simulado = mode === "monto"
          ? Math.round(PlanoUtils.safeNumber(lote.precio) + delta)
          : Math.round(PlanoUtils.safeNumber(lote.precio) * (1 + delta / 100));
      });

      updateValuation();
      requestLabelRefresh(true);
      if (state.selectedLotId) renderPanel(state.lotesMap.get(state.selectedLotId));
    }

    async function open360() {
      if (!has360() || !refs.modal360) return;
      refs.modal360.classList.remove("hidden");
      refs.body.classList.add("no-scroll");

      if (state.viewer360 && typeof state.viewer360.destroy === "function") {
        state.viewer360.destroy();
      }

      const route = `/assets/360/${key360()}/01.jpg`;
      const pannellumRuntime = await ensurePannellum();
      if (pannellumRuntime) {
        state.viewer360 = window.pannellum.viewer("visor360", {
          type: "equirectangular",
          panorama: route,
          autoLoad: true,
          showZoomCtrl: true,
          showFullscreenCtrl: false,
          compass: false
        });
      } else if (refs.visor360) {
        refs.visor360.replaceChildren(AppCore.createElement("img", {
          attrs: {
            src: route,
            alt: "Vista 360",
            style: "width:100%;height:100%;object-fit:cover;"
          }
        }));
      }

      if (refs.contador360) {
        refs.contador360.textContent = `Vista 1 de ${views360[key360()] || 1}`;
      }
    }

    function close360() {
      refs.modal360?.classList.add("hidden");
      refs.body.classList.remove("no-scroll");
      if (state.viewer360 && typeof state.viewer360.destroy === "function") {
        state.viewer360.destroy();
      }
      state.viewer360 = null;
      refs.visor360?.replaceChildren();
    }

    function exportSvgAs(kind) {
      if (!state.svg) {
        alert("El plano aun no esta listo para exportarse.");
        return;
      }

      const serializer = new XMLSerializer();
      const source = serializer.serializeToString(state.svg);
      const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const image = new Image();

      image.onload = function onLoad() {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        const scale = kind === "png" ? 3 : 2;
        canvas.width = image.width * scale;
        canvas.height = image.height * scale;
        context.scale(scale, scale);
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0);

        if (kind === "png") {
          const link = document.createElement("a");
          link.download = `plano-${state.currentProject}-${state.currentPhase}.png`;
          link.href = canvas.toDataURL("image/png");
          link.click();
        } else if (window.jspdf?.jsPDF) {
          const { jsPDF } = window.jspdf;
          const pdf = new jsPDF("landscape", "pt", "a3");
          const imageData = canvas.toDataURL("image/jpeg", 0.88);
          const pageWidth = pdf.internal.pageSize.getWidth();
          const pageHeight = pdf.internal.pageSize.getHeight();
          const margin = 40;
          const maxWidth = pageWidth - margin * 2;
          const maxHeight = pageHeight - 90;
          let width = maxWidth;
          let height = (canvas.height * width) / canvas.width;
          if (height > maxHeight) {
            height = maxHeight;
            width = (canvas.width * height) / canvas.height;
          }
          pdf.text(`Plano ${state.currentProject} - ${state.currentPhase}`, margin, 36);
          pdf.addImage(imageData, "JPEG", margin, 56, width, height);
          pdf.save(`plano-${state.currentProject}-${state.currentPhase}.pdf`);
        } else {
          alert("El generador de PDF no esta disponible en esta vista.");
        }

        URL.revokeObjectURL(url);
      };

      image.src = url;
    }

    function bindPanzoom(svg) {
      if (typeof state.touchBindingsCleanup === "function") {
        state.touchBindingsCleanup();
        state.touchBindingsCleanup = null;
      }
      if (state.svg && state.wheelHandler) {
        state.svg.removeEventListener("wheel", state.wheelHandler);
      }
      if (state.svg && state.panzoomChangeHandler) {
        state.svg.removeEventListener("panzoomchange", state.panzoomChangeHandler);
      }
      if (state.panzoom && typeof state.panzoom.destroy === "function") {
        state.panzoom.destroy();
      }
      const scaleRange = state.scaleRange || refreshScaleRange();
      if (state.isMobile) {
        state.panzoom = createMobileTouchController(svg, scaleRange);
        bindTouchEnhancements();
        return;
      }
      state.panzoom = window.Panzoom(svg, {
        maxScale: scaleRange.max,
        minScale: scaleRange.min,
        step: state.performanceMode ? 0.12 : 0.24,
        contain: "outside",
        pinchAndPan: true,
        canvas: true,
        animate: !state.performanceMode,
        duration: state.performanceMode ? 0 : 240,
        touchAction: "none",
        origin: "0 0"
      });
      state.wheelHandler = state.panzoom.zoomWithWheel;
      state.panzoomChangeHandler = () => requestLabelRefresh(false);
      if (!state.isMobile) {
        svg.addEventListener("wheel", state.wheelHandler, { passive: false });
      }
      svg.addEventListener("panzoomchange", state.panzoomChangeHandler);
    }

    function createMobileTouchController(svg, range = {}) {
      let minScale = PlanoUtils.safeNumber(range.min, 0.05);
      let maxScale = PlanoUtils.safeNumber(range.max, 8);
      let scale = 1;
      let panX = 0;
      let panY = 0;
      let frameId = 0;

      function queueRender() {
        if (frameId) return;
        frameId = window.requestAnimationFrame(() => {
          frameId = 0;
          svg.style.transform = `scale(${scale}) translate(${panX}px, ${panY}px)`;
        });
      }

      function getBounds() {
        return getInitialFitBounds() || PlanoUtils.getContentBounds(svg, state.lotElements) || PlanoUtils.getSvgBounds(svg);
      }

      function centerView(targetScale) {
        const bounds = getBounds();
        const wrapperRect = refs.wrapper?.getBoundingClientRect?.();
        if (!bounds || !wrapperRect?.width || !wrapperRect?.height) {
          return { x: panX, y: panY };
        }
        return {
          x: wrapperRect.width / (2 * targetScale) - bounds.x - bounds.width / 2,
          y: wrapperRect.height / (2 * targetScale) - bounds.y - bounds.height / 2
        };
      }

      function clampView(nextX, nextY, nextScale) {
        const bounds = getBounds();
        const wrapperRect = refs.wrapper?.getBoundingClientRect?.();
        if (!bounds || !wrapperRect?.width || !wrapperRect?.height) {
          return { x: nextX, y: nextY };
        }

        const marginX = Math.min(wrapperRect.width * 0.11, 54);
        const marginY = Math.min(wrapperRect.height * 0.11, 54);

        const minX = marginX / nextScale - bounds.x - bounds.width;
        const maxX = (wrapperRect.width - marginX) / nextScale - bounds.x;
        const minY = marginY / nextScale - bounds.y - bounds.height;
        const maxY = (wrapperRect.height - marginY) / nextScale - bounds.y;

        const centered = centerView(nextScale);

        return {
          x: minX > maxX ? centered.x : PlanoUtils.clamp(nextX, minX, maxX),
          y: minY > maxY ? centered.y : PlanoUtils.clamp(nextY, minY, maxY)
        };
      }

      function setView(view = {}) {
        const nextScale = PlanoUtils.clamp(
          view.scale ?? scale,
          minScale,
          maxScale
        );
        const clamped = clampView(
          view.x ?? panX,
          view.y ?? panY,
          nextScale
        );
        scale = nextScale;
        panX = clamped.x;
        panY = clamped.y;
        queueRender();
      }

      const controller = {
        getScale() {
          return scale;
        },
        getPan() {
          return { x: panX, y: panY };
        },
        zoom(nextScale) {
          setView({ scale: nextScale });
        },
        pan(nextX, nextY, options = {}) {
          setView({
            x: options.relative ? panX + nextX : nextX,
            y: options.relative ? panY + nextY : nextY
          });
        },
        zoomToPoint(nextScale, options = {}) {
          const targetScale = PlanoUtils.clamp(nextScale, minScale, maxScale);
          const focal = options.focal;
          if (!focal || !Number.isFinite(focal.x) || !Number.isFinite(focal.y)) {
            setView({ scale: targetScale });
            return;
          }
          const targetX = panX + focal.x / targetScale - focal.x / scale;
          const targetY = panY + focal.y / targetScale - focal.y / scale;
          setView({ scale: targetScale, x: targetX, y: targetY });
        },
        setView,
        setScaleRange(nextRange = {}) {
          minScale = PlanoUtils.safeNumber(nextRange.min, minScale);
          maxScale = Math.max(
            PlanoUtils.safeNumber(nextRange.max, maxScale),
            minScale + 0.75
          );
          setView({ scale });
        },
        destroy() {
          if (frameId) {
            window.cancelAnimationFrame(frameId);
            frameId = 0;
          }
        }
      };

      return controller;
    }

    function decorateSvg(svg) {
      svg.classList.add("plano-svg");
      svg.setAttribute("preserveAspectRatio", svg.getAttribute("preserveAspectRatio") || "xMidYMid meet");
    }

    function indexLotElements() {
      state.lotElements = [];
      state.lotElementsMap = new Map();
      if (!state.svg) return;

      state.lotes.forEach((lote) => {
        const element = document.getElementById(lote.lote_id);
        if (!element?.getBBox) return;
        state.lotElements.push(element);
        state.lotElementsMap.set(lote.lote_id, element);
      });
    }

    function getLotElement(loteId) {
      return state.lotElementsMap.get(loteId) || document.getElementById(loteId);
    }

    function clearHighlightedLots() {
      state.highlightedLotElements.forEach((element) => {
        element.classList.remove("manzana-highlight");
      });
      state.highlightedLotElements = [];
    }

    function highlightSelectedManzana(loteId) {
      clearHighlightedLots();
      const manzana = PlanoUtils.getManzanaFromLoteId(loteId);
      if (!manzana) return;

      state.highlightedLotElements = state.lotElements.filter((element) => element.id.includes(`-${manzana}-`));
      state.highlightedLotElements.forEach((element) => {
        element.classList.add("manzana-highlight");
      });
    }

    function waitForStableViewport(maxFrames = 18, stableFrames = 2) {
      return new Promise((resolve) => {
        let lastWidth = 0;
        let lastHeight = 0;
        let stableCount = 0;

        const tick = (remaining) => {
          const rect = refs.wrapper?.getBoundingClientRect?.();
          const bounds = getInitialFitBounds();
          const width = Math.round(PlanoUtils.safeNumber(rect?.width));
          const height = Math.round(PlanoUtils.safeNumber(rect?.height));

          if (width > 0 && height > 0 && bounds?.width && bounds?.height) {
            stableCount = width === lastWidth && height === lastHeight ? stableCount + 1 : 1;
            lastWidth = width;
            lastHeight = height;
            if (stableCount >= stableFrames) {
              resolve(true);
              return;
            }
          }
          if (remaining <= 0) {
            resolve(false);
            return;
          }
          requestAnimationFrame(() => tick(remaining - 1));
        };

        tick(maxFrames);
      });
    }

    function loadMap(data) {
      state.lotes = (Array.isArray(data) ? data : []).map((item) =>
        normalizeLote(item, state.currentProject, state.currentPhase)
      );
      state.lotesMap = new Map(state.lotes.map((item) => [item.lote_id, item]));
    }

    async function loadScenario(project, phase) {
      const requestId = state.loadRequestId + 1;
      state.loadRequestId = requestId;
      state.currentProject = String(project || state.currentProject).trim();
      state.currentPhase = String(phase || state.currentPhase).trim();
      applyStaticState();
      setQueryState(state.currentProject, state.currentPhase, state.presentationMode);
      closePanel();
      refs.inputSearch && (refs.inputSearch.value = "");
      refs.suggestions?.classList.add("hidden");
      if (refs.tooltip) refs.tooltip.style.display = "none";
      setLoading(true, "Actualizando plano");

      try {
        const svgName = `${state.currentProject.toLowerCase()}-${state.currentPhase.toLowerCase()}-ma.svg`;
        const [svgMarkup, payload] = await Promise.all([
          fetchSvgMarkup(svgName),
          AppCore.apiRequest({
            query: { plano: 1, proyecto: state.currentProject, fase: state.currentPhase },
            auth: true
          })
        ]);

        if (requestId !== state.loadRequestId) {
          return;
        }

        state.heavySvg = analyzeSvgComplexity(svgMarkup).isHeavy;
        applyStaticState();
        refs.container.innerHTML = svgMarkup;
        state.svg = PlanoUtils.getSvgElement();
        if (!state.svg) {
          throw new Error("No se pudo inicializar el SVG del plano.");
        }

        decorateSvg(state.svg);
        loadMap(payload);
        indexLotElements();
        buildLotGeometry();
        enrichCommercialData();
        repaintLots();
        const viewportReady = await waitForStableViewport();
        if (!viewportReady) {
          debugViewport("viewport-timeout", {
            wrapper: refs.wrapper?.getBoundingClientRect?.(),
            bounds: state.projectBounds,
            lotElements: state.lotElements.length
          });
        }
        refreshScaleRange();
        bindPanzoom(state.svg);
        refreshInitialView({ apply: true, animate: false });
        debugViewport("initial-fit", {
          wrapper: refs.wrapper?.getBoundingClientRect?.(),
          bounds: state.projectBounds,
          initialView: state.initialView,
          scaleRange: state.scaleRange,
          lotElements: state.lotElements.length
        });
        buildLabels();

        updateSummary();
        updateValuation();
        renderCompareDock();
      } catch (error) {
        if (requestId !== state.loadRequestId) {
          return;
        }
        console.error("Plano loadScenario", error);
        refs.container.replaceChildren(AppCore.createElement("div", {
          className: "detail-empty",
          text: AppCore.getErrorMessage(error, "No se pudo cargar el plano.")
        }));
      } finally {
        if (requestId === state.loadRequestId) {
          setLoading(false);
        }
      }
    }

    function updateTooltip(target, lote, point) {
      if (!refs.tooltip) return;
      refs.tooltip.style.display = "none";
      state.tooltipLotId = "";
    }

    function zoomToTouchPoint(point, multiplier = state.isMobile ? 1.62 : 1.45) {
      if (!state.panzoom || !refs.wrapper) return;
      const scaleRange = state.scaleRange || refreshScaleRange();
      const rect = refs.wrapper.getBoundingClientRect();
      const nextScale = PlanoUtils.clamp(
        state.panzoom.getScale() * multiplier,
        scaleRange.min,
        scaleRange.max
      );
      state.panzoom.zoomToPoint(nextScale, {
        animate: !state.performanceMode,
        focal: {
          x: point.clientX - rect.left,
          y: point.clientY - rect.top
        }
      });
      requestLabelRefresh(true);
    }

    function bindTouchEnhancements() {
      if (typeof state.touchBindingsCleanup === "function") {
        state.touchBindingsCleanup();
        state.touchBindingsCleanup = null;
      }
      if (!refs.wrapper || !refs.container || !state.panzoom || !state.isMobile) return;

      const gesture = {
        mode: "idle",
        startPanX: 0,
        startPanY: 0,
        lastDistance: 0,
        lastCenterX: 0,
        lastCenterY: 0
      };

      function getDistance(touchA, touchB) {
        return Math.hypot(touchB.clientX - touchA.clientX, touchB.clientY - touchA.clientY);
      }

      function getCenter(touchA, touchB) {
        return {
          x: (touchA.clientX + touchB.clientX) / 2,
          y: (touchA.clientY + touchB.clientY) / 2
        };
      }

      const onTouchStart = (event) => {
        if (!event.touches?.length) return;
        const touch = event.touches[0];
        state.touch.active = true;
        state.touch.startX = touch.clientX;
        state.touch.startY = touch.clientY;
        state.touch.moved = false;
        const currentPan = state.panzoom.getPan ? state.panzoom.getPan() : { x: 0, y: 0 };
        gesture.startPanX = currentPan.x;
        gesture.startPanY = currentPan.y;

        if (event.touches.length > 1) {
          const first = event.touches[0];
          const second = event.touches[1];
          const center = getCenter(first, second);
          gesture.mode = "pinch";
          gesture.lastDistance = Math.max(getDistance(first, second), 1);
          gesture.lastCenterX = center.x;
          gesture.lastCenterY = center.y;
          state.touch.moved = true;
          state.touch.lastTapAt = 0;
          setGestureLock(560);
        } else {
          gesture.mode = "pan";
          gesture.lastDistance = 0;
          gesture.lastCenterX = touch.clientX;
          gesture.lastCenterY = touch.clientY;
        }
        if (event.cancelable) event.preventDefault();
      };

      const onTouchMove = (event) => {
        if (!state.touch.active || !event.touches?.length) return;

        if (event.touches.length > 1) {
          const first = event.touches[0];
          const second = event.touches[1];
          const center = getCenter(first, second);
          const distance = Math.max(getDistance(first, second), 1);
          const scaleRange = state.scaleRange || refreshScaleRange();

          if (gesture.mode !== "pinch") {
            const currentPan = state.panzoom.getPan ? state.panzoom.getPan() : { x: 0, y: 0 };
            gesture.mode = "pinch";
            gesture.startPanX = currentPan.x;
            gesture.startPanY = currentPan.y;
            gesture.lastDistance = distance;
            gesture.lastCenterX = center.x;
            gesture.lastCenterY = center.y;
          }

          const currentPan = state.panzoom.getPan ? state.panzoom.getPan() : { x: 0, y: 0 };
          const currentScale = Math.max(state.panzoom.getScale(), 0.001);
          const rawScaleFactor = distance / Math.max(gesture.lastDistance || distance, 1);
          const pinchFactor = Math.pow(
            rawScaleFactor,
            rawScaleFactor >= 1 ? 0.94 : 0.9
          );
          const nextScale = PlanoUtils.clamp(
            currentScale * pinchFactor,
            scaleRange.min,
            scaleRange.max
          );
          const wrapperRect = refs.wrapper.getBoundingClientRect();
          const lastFocal = {
            x: gesture.lastCenterX - wrapperRect.left,
            y: gesture.lastCenterY - wrapperRect.top
          };
          const nextFocal = {
            x: center.x - wrapperRect.left,
            y: center.y - wrapperRect.top
          };
          const worldX = lastFocal.x / currentScale - currentPan.x;
          const worldY = lastFocal.y / currentScale - currentPan.y;
          const targetX = nextFocal.x / nextScale - worldX;
          const targetY = nextFocal.y / nextScale - worldY;

          state.panzoom.setView({
            scale: nextScale,
            x: targetX,
            y: targetY
          });
          gesture.lastDistance = distance;
          gesture.lastCenterX = center.x;
          gesture.lastCenterY = center.y;
          state.touch.moved = true;
          state.touch.lastTapAt = 0;
          setGestureLock(560);
          if (event.cancelable) event.preventDefault();
          return;
        }

        const current = event.touches[0];
        const deltaX = current.clientX - state.touch.startX;
        const deltaY = current.clientY - state.touch.startY;
        const distance = Math.hypot(deltaX, deltaY);

        if (distance > 6) {
          const scale = Math.max(state.panzoom.getScale(), 0.001);
          state.panzoom.setView({
            x: gesture.startPanX + deltaX / scale,
            y: gesture.startPanY + deltaY / scale
          });
          state.touch.moved = true;
          state.touch.lastTapAt = 0;
          setGestureLock(420);
        }
        if (event.cancelable) event.preventDefault();
      };

      const onTouchEnd = (event) => {
        if (!state.touch.active) return;
        if ((event.touches?.length || 0) > 0) {
          state.touch.moved = true;
          if (event.touches.length > 1) {
            const first = event.touches[0];
            const second = event.touches[1];
            const center = getCenter(first, second);
            gesture.mode = "pinch";
            gesture.lastDistance = Math.max(getDistance(first, second), 1);
            gesture.lastCenterX = center.x;
            gesture.lastCenterY = center.y;
          } else {
            const remaining = event.touches[0];
            const currentPan = state.panzoom.getPan ? state.panzoom.getPan() : { x: 0, y: 0 };
            gesture.mode = "pan";
            state.touch.startX = remaining.clientX;
            state.touch.startY = remaining.clientY;
            gesture.startPanX = currentPan.x;
            gesture.startPanY = currentPan.y;
            gesture.lastDistance = 0;
            gesture.lastCenterX = remaining.clientX;
            gesture.lastCenterY = remaining.clientY;
          }
          setGestureLock(560);
          return;
        }

        state.touch.active = false;
        gesture.mode = "idle";
        const touch = event.changedTouches?.[0];
        const moved = state.touch.moved;
        state.touch.moved = false;

        if (!touch) {
          state.touch.lastTapAt = 0;
          return;
        }

        if (moved) {
          state.touch.lastTapAt = 0;
          setGestureLock(420);
          return;
        }

        const now = Date.now();
        const distance = Math.hypot(touch.clientX - state.touch.lastTapX, touch.clientY - state.touch.lastTapY);
        if (state.touch.lastTapAt && now - state.touch.lastTapAt < 280 && distance < 28) {
          setGestureLock(560);
          zoomToTouchPoint(touch);
          state.touch.lastTapAt = 0;
          return;
        }

        state.touch.lastTapAt = now;
        state.touch.lastTapX = touch.clientX;
        state.touch.lastTapY = touch.clientY;
        const target = document.elementFromPoint(touch.clientX, touch.clientY)?.closest?.("path");
        if (target && state.lotesMap.has(target.id) && !target.classList.contains("is-muted")) {
          setGestureLock(320);
          setSelectedLot(target.id, true);
        }
      };

      const onTouchCancel = () => {
        state.touch.active = false;
        gesture.mode = "idle";
        state.touch.lastTapAt = 0;
        state.touch.moved = false;
        gesture.lastDistance = 0;
        gesture.lastCenterX = 0;
        gesture.lastCenterY = 0;
        setGestureLock(420);
      };

      refs.container.addEventListener("touchstart", onTouchStart, { passive: false });
      document.addEventListener("touchmove", onTouchMove, { passive: false });
      document.addEventListener("touchend", onTouchEnd, { passive: false });
      document.addEventListener("touchcancel", onTouchCancel, { passive: false });

      state.touchBindingsCleanup = () => {
        refs.container.removeEventListener("touchstart", onTouchStart);
        document.removeEventListener("touchmove", onTouchMove);
        document.removeEventListener("touchend", onTouchEnd);
        document.removeEventListener("touchcancel", onTouchCancel);
      };
    }

    function setSelectedLot(loteId, shouldFocus = true) {
      const lote = state.lotesMap.get(loteId);
      const path = getLotElement(loteId);
      if (!lote || !path) return;
      if (state.selectedLotId && state.selectedLotId !== loteId) {
        state.visibleSections.quickReserve = false;
      }
      clearSelection();
      path.classList.add("selected");
      highlightSelectedManzana(loteId);
      state.selectedLotId = loteId;
      if (shouldFocus && state.panzoom) {
        PlanoUtils.focusElements(state.panzoom, refs.wrapper, [path], {
          boost: state.isMobile ? (state.performanceMode ? 1.7 : 1.95) : 1.7,
          maxScale: state.isMobile ? 7.25 : 7,
          minScale: state.scaleRange?.min
        });
      }
      renderPanel(lote);
      requestLabelRefresh(true);
    }

    function handleSearch() {
      const normalized = PlanoUtils.normalizeText(refs.inputSearch?.value);
      if (!normalized) return;
      const match = state.lotes.find((lote) =>
        PlanoUtils.normalizeText(lote.lote_id).includes(normalized) ||
        PlanoUtils.normalizeText(lote.lote).includes(normalized)
      );
      if (!match) {
        alert("No se encontro un lote con ese criterio.");
        return;
      }
      setSelectedLot(match.lote_id);
      refs.suggestions?.classList.add("hidden");
    }

    function renderSuggestions(query) {
      if (!refs.suggestions) return;
      AppCore.clearElement(refs.suggestions);
      const normalized = PlanoUtils.normalizeText(query);
      if (!normalized) {
        refs.suggestions.classList.add("hidden");
        return;
      }
      const matches = state.lotes.filter((lote) =>
        PlanoUtils.normalizeText(lote.lote_id).includes(normalized)
      ).slice(0, 8);
      if (!matches.length) {
        refs.suggestions.classList.add("hidden");
        return;
      }
      matches.forEach((lote) => {
        const item = AppCore.createElement("button", {
          className: "sugerencia-item",
          text: lote.lote_id,
          attrs: { type: "button" }
        });
        item.addEventListener("click", () => {
          refs.inputSearch.value = lote.lote_id;
          setSelectedLot(lote.lote_id);
          refs.suggestions.classList.add("hidden");
        });
        refs.suggestions.appendChild(item);
      });
      refs.suggestions.classList.remove("hidden");
    }

    function bindEvents() {
      refs.togglePanel?.addEventListener("click", () => {
        refs.topContent?.classList.toggle("active");
        refs.togglePanel.textContent = refs.topContent?.classList.contains("active") ? "^" : "v";
      });
      refs.filters.forEach((input) => input.addEventListener("change", applyFilters));
      refs.selectProject?.addEventListener("change", () => loadScenario(refs.selectProject.value, refs.selectPhase?.value || state.currentPhase));
      refs.selectPhase?.addEventListener("change", () => loadScenario(refs.selectProject?.value || state.currentProject, refs.selectPhase.value));
      refs.btnSearch?.addEventListener("click", handleSearch);
      refs.inputSearch?.addEventListener("input", (event) => renderSuggestions(event.target.value));
      refs.inputSearch?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          handleSearch();
        }
      });
      refs.btnPresentation?.addEventListener("click", () => {
        state.presentationMode = !state.presentationMode;
        applyStaticState();
        setQueryState(state.currentProject, state.currentPhase, state.presentationMode);
        requestLabelRefresh(true);
        if (state.selectedLotId) renderPanel(state.lotesMap.get(state.selectedLotId));
      });
      refs.btnVisibility?.addEventListener("click", () => {
        state.visibilityMode = state.visibilityMode === "sunlight" ? "dark" : "sunlight";
        localStorage.setItem(VISIBILITY_KEY, state.visibilityMode);
        applyStaticState();
      });
      refs.btnResetView?.addEventListener("click", () => {
        closePanel();
        refreshInitialView({ apply: true, animate: !state.performanceMode, duration: 420 });
        requestLabelRefresh(true);
      });
      refs.btn360?.addEventListener("click", open360);
      refs.btnExportPng?.addEventListener("click", () => exportSvgAs("png"));
      refs.btnExportPdf?.addEventListener("click", () => exportSvgAs("pdf"));
      refs.btnLogout?.addEventListener("click", () => AppCore.logout());
      refs.detailClose?.addEventListener("click", closePanel);
      refs.overlay?.addEventListener("click", closePanel);
      refs.cerrar360?.addEventListener("click", close360);
      refs.simulationButton?.addEventListener("click", simulatePrices);
      refs.variationType?.addEventListener("change", simulatePrices);
      refs.variationPrice?.addEventListener("input", PlanoUtils.throttleFrame(simulatePrices));
      document.addEventListener("click", (event) => {
        if (!refs.suggestions || refs.suggestions.classList.contains("hidden")) return;
        const insideSearch = refs.inputSearch?.contains(event.target) || refs.btnSearch?.contains(event.target) || refs.suggestions.contains(event.target);
        if (!insideSearch) {
          refs.suggestions.classList.add("hidden");
        }
      });
      refs.container.addEventListener("click", (event) => {
        if (isGestureLocked()) return;
        const target = event.target.closest("path");
        if (!target || target.classList.contains("is-muted")) return;
        if (!state.lotesMap.has(target.id)) return;
        setSelectedLot(target.id, true);
      });
      bindTouchEnhancements();
      window.addEventListener("resize", PlanoUtils.throttleFrame(() => {
        const wasMobile = state.isMobile;
        const wasPerformanceMode = state.performanceMode;
        applyStaticState();
        refreshScaleRange();
        if (state.svg && (wasMobile !== state.isMobile || wasPerformanceMode !== state.performanceMode)) {
          bindPanzoom(state.svg);
          buildLabels();
        } else {
          applyScaleRange();
        }
        if (state.selectedLotId && state.panzoom) {
          const selectedPath = getLotElement(state.selectedLotId);
          if (selectedPath) {
            PlanoUtils.focusElements(state.panzoom, refs.wrapper, [selectedPath], {
              boost: state.isMobile ? (state.performanceMode ? 1.7 : 1.95) : 1.7,
              maxScale: state.isMobile ? 7.25 : 7,
              minScale: state.scaleRange?.min,
              animate: false
            });
          } else {
            refreshInitialView({
              apply: true,
              animate: false
            });
          }
        } else {
          refreshInitialView({
            apply: true,
            animate: false
          });
        }
        requestLabelRefresh(true);
      }));
    }

    async function init() {
      ensureDynamicChrome();
      applyStaticState();
      bindEvents();
      await loadScenario(state.currentProject, state.currentPhase);
    }

    return { init };
  }

  window.PlanoExperience = {
    create: createController
  };
})();


