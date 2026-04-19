(function () {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const STATUS_META = {
    disponible: { label: "Disponible", color: "#18b76d", tone: "available" },
    reservado: { label: "Reservado", color: "#f5b942", tone: "reserved" },
    vendido: { label: "Vendido", color: "#ff6b6b", tone: "sold" },
    financiado: { label: "Financiado", color: "#53a7ff", tone: "financed" }
  };

  function isTouchDevice() {
    return "ontouchstart" in window || navigator.maxTouchPoints > 0;
  }

  function repairText(value) {
    if (window.AppCore?.repairTextEncoding) {
      return window.AppCore.repairTextEncoding(value);
    }
    return String(value ?? "");
  }

  function normalizeText(value) {
    return repairText(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  function safeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function getStatusMeta(estado) {
    const key = normalizeText(estado);
    return STATUS_META[key] || {
      label: estado || "Sin estado",
      color: "#8f99b0",
      tone: "neutral"
    };
  }

  function getColorEstado(estado) {
    return getStatusMeta(estado).color;
  }

  function formatCompactCurrency(value, currency = "PEN") {
    return new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1
    }).format(safeNumber(value));
  }

  function formatCurrency(value, currency = "PEN") {
    return new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency
    }).format(safeNumber(value));
  }

  function throttleFrame(callback) {
    let frameId = 0;
    let latestArgs = null;

    return function throttled(...args) {
      latestArgs = args;
      if (frameId) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        callback(...(latestArgs || []));
      });
    };
  }

  function getSvgElement() {
    return document.querySelector("#plano-container svg");
  }

  function createSvgNode(tagName, attributes = {}) {
    const node = document.createElementNS(SVG_NS, tagName);
    Object.entries(attributes).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      node.setAttribute(key, String(value));
    });
    return node;
  }

  function clearSelection(svg) {
    if (!svg) return;
    svg.querySelectorAll("path.selected").forEach((path) => {
      path.classList.remove("selected");
    });
  }

  function getManzanaFromLoteId(loteId) {
    const parts = String(loteId || "").split("-");
    return parts[2] || "";
  }

  function highlightManzana(svg, loteId) {
    if (!svg) return;
    const manzana = getManzanaFromLoteId(loteId);
    if (!manzana) return;

    resolveSvgElements(svg, `path[id*="-${manzana}-"]`).forEach((path) => {
      if (path.id && path.id.includes(`-${manzana}-`)) {
        path.classList.add("manzana-highlight");
      }
    });
  }

  function clearHighlightedManzana(svg) {
    if (!svg) return;
    svg.querySelectorAll(".manzana-highlight").forEach((path) => {
      path.classList.remove("manzana-highlight");
    });
  }

  function resolveSvgElements(svg, selectorOrElements = "path[id]") {
    if (!svg) return [];
    if (typeof selectorOrElements === "string") {
      return Array.from(svg.querySelectorAll(selectorOrElements));
    }
    return Array.from(selectorOrElements || []).filter(Boolean);
  }

  function getSvgBounds(svg) {
    if (!svg) return { x: 0, y: 0, width: 0, height: 0 };
    const viewBox = svg.viewBox && svg.viewBox.baseVal;

    if (viewBox && viewBox.width && viewBox.height) {
      return {
        x: viewBox.x,
        y: viewBox.y,
        width: viewBox.width,
        height: viewBox.height
      };
    }

    try {
      return svg.getBBox();
    } catch (error) {
      return { x: 0, y: 0, width: svg.clientWidth || 0, height: svg.clientHeight || 0 };
    }
  }

  function getContentBounds(svg, selector = "path[id]") {
    if (!svg) return { x: 0, y: 0, width: 0, height: 0 };
    const elements = resolveSvgElements(svg, selector);
    const bounds = getElementsBounds(elements);
    return bounds || getSvgBounds(svg);
  }

  function calculateFitTransform(wrapper, bounds, paddingRatio = 0.92) {
    const wrapperRect = wrapper?.getBoundingClientRect?.();
    const width = safeNumber(wrapperRect?.width);
    const height = safeNumber(wrapperRect?.height);

    if (!width || !height || !bounds?.width || !bounds?.height) {
      return { x: 0, y: 0, scale: 1 };
    }

    const scale = Math.max(
      0.02,
      Math.min(width / bounds.width, height / bounds.height) * paddingRatio
    );
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;

    const x = width / (2 * scale) - centerX;
    const y = height / (2 * scale) - centerY;

    return { x, y, scale };
  }

  function applyView(panzoom, view, options = {}) {
    if (!panzoom || !view) return;
    panzoom.zoom(view.scale, {
      animate: options.animate !== false,
      force: true
    });
    panzoom.pan(view.x, view.y, {
      animate: options.animate !== false,
      force: true,
      duration: options.duration || 420
    });
  }

  function getElementsBounds(elements = []) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    elements.forEach((element) => {
      if (!element?.getBBox) return;
      const box = element.getBBox();
      if (!box || !box.width || !box.height) return;
      minX = Math.min(minX, box.x);
      minY = Math.min(minY, box.y);
      maxX = Math.max(maxX, box.x + box.width);
      maxY = Math.max(maxY, box.y + box.height);
    });

    if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
      return null;
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  function focusBounds(panzoom, wrapper, bounds, options = {}) {
    if (!panzoom || !wrapper || !bounds) return;
    const paddingRatio = safeNumber(options.paddingRatio, 0.82);
    const view = calculateFitTransform(wrapper, bounds, paddingRatio);
    const boost = clamp(safeNumber(options.boost, 1.2), 1, 6);
    const minScale = safeNumber(options.minScale, 0.55);
    const wrapperRect = wrapper.getBoundingClientRect();
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    view.scale = clamp(view.scale * boost, minScale, safeNumber(options.maxScale, 8));
    view.x = wrapperRect.width / (2 * view.scale) - centerX;
    view.y = wrapperRect.height / (2 * view.scale) - centerY;
    applyView(panzoom, view, { animate: options.animate !== false, duration: options.duration || 480 });
  }

  function focusElements(panzoom, wrapper, elements, options = {}) {
    const bounds = getElementsBounds(elements);
    if (!bounds) return;
    focusBounds(panzoom, wrapper, bounds, options);
  }

  function zoomManzana(panzoom, wrapper, svg, manzana) {
    if (!panzoom || !wrapper || !svg || !manzana) {
      return;
    }

    const lotes = resolveSvgElements(svg, `path[id*="-${manzana}-"]`).filter((path) =>
      path.id.includes(`-${manzana}-`)
    );

    if (!lotes.length) {
      return;
    }

    focusElements(panzoom, wrapper, lotes, { boost: 1.55, maxScale: 7 });
  }

  function getLabelMode(scale, isMobile = false) {
    if (isMobile) return "hidden";
    if (scale >= 2.55) return "full";
    if (scale >= 1.78) return "compact";
    if (scale >= 1.26) return "code";
    return "hidden";
  }

  function updateSvgTextSize(svg, panzoom) {
    if (!svg || !panzoom) return;
    const scale = panzoom.getScale();
    svg.querySelectorAll("[data-label-size]").forEach((textNode) => {
      const baseSize = safeNumber(textNode.dataset.labelSize, 14);
      textNode.setAttribute("font-size", String(baseSize / Math.max(scale, 0.7)));
    });
  }

  function formatArea(value) {
    return `${safeNumber(value).toFixed(2)} m²`;
  }

  function calculatePricePerSquareMeter(item) {
    const area = safeNumber(item?.area);
    const price = safeNumber(item?.precio_publico ?? item?.precio);
    if (area <= 0 || price <= 0) return 0;
    return price / area;
  }

  function createProjectBenchmark(lotes = []) {
    const comparable = (Array.isArray(lotes) ? lotes : [])
      .map((lote) => ({
        area: safeNumber(lote?.area),
        pricePerM2: calculatePricePerSquareMeter(lote)
      }))
      .filter((item) => item.area > 0 && item.pricePerM2 > 0);

    if (!comparable.length) {
      return {
        avgPricePerM2: 0,
        medianArea: 0,
        minPricePerM2: 0,
        maxPricePerM2: 0
      };
    }

    const sortedAreas = comparable
      .map((item) => item.area)
      .sort((left, right) => left - right);
    const sortedPricePerM2 = comparable
      .map((item) => item.pricePerM2)
      .sort((left, right) => left - right);
    const middleIndex = Math.floor(sortedAreas.length / 2);

    return {
      avgPricePerM2: comparable.reduce((sum, item) => sum + item.pricePerM2, 0) / comparable.length,
      medianArea: sortedAreas[middleIndex] || sortedAreas[0] || 0,
      minPricePerM2: sortedPricePerM2[0] || 0,
      maxPricePerM2: sortedPricePerM2[sortedPricePerM2.length - 1] || 0
    };
  }

  function getLotContextLabel(spatialMeta = {}) {
    if (spatialMeta.isCorner) {
      return "Esquina estratégica";
    }
    if (spatialMeta.edgeCount >= 2) {
      return "Frente perimetral";
    }
    if (spatialMeta.edgeCount === 1) {
      return "Borde del proyecto";
    }
    if (spatialMeta.verticalZone === "top") {
      return "Zona alta del proyecto";
    }
    if (spatialMeta.verticalZone === "bottom") {
      return "Zona baja del proyecto";
    }
    return "Zona interior";
  }

  function getLotContextDetail(spatialMeta = {}) {
    if (spatialMeta.isCorner) {
      return "Ubicación relativa de esquina dentro del plano, útil para exposición y referencia comercial.";
    }
    if (spatialMeta.edgeCount >= 1) {
      return "Lote ubicado en el perímetro visible del proyecto.";
    }
    return "Lote ubicado en una zona interior con lectura estable dentro del proyecto.";
  }

  function getLotOpportunity(score) {
    if (score >= 88) return "Excelente opción";
    if (score >= 78) return "Muy buena relación";
    if (score >= 68) return "Oportunidad comercial";
    if (score >= 58) return "Buena alternativa";
    return "Valor estable";
  }

  function buildCommercialProfile(lote, benchmark = {}, spatialMeta = {}) {
    const pricePerM2 = calculatePricePerSquareMeter(lote);
    const avgPricePerM2 = safeNumber(benchmark.avgPricePerM2);
    const medianArea = safeNumber(benchmark.medianArea);
    const area = safeNumber(lote?.area);
    const normalizedState = normalizeText(lote?.estado);

    const valueRatio = avgPricePerM2 > 0 ? (avgPricePerM2 - pricePerM2) / avgPricePerM2 : 0;
    const priceScore = clamp(Math.round(20 + valueRatio * 38), 8, 34);
    const areaScore = medianArea > 0 ? clamp(Math.round((area / medianArea) * 12), 5, 16) : 8;
    const contextScore = spatialMeta.isCorner ? 12 : spatialMeta.edgeCount >= 1 ? 8 : 4;
    const availabilityScore = normalizedState === "disponible"
      ? 14
      : normalizedState === "reservado"
        ? 6
        : 2;
    const score = clamp(36 + priceScore + areaScore + contextScore + availabilityScore, 42, 98);

    const reasons = [];
    if (pricePerM2 > 0 && avgPricePerM2 > 0) {
      if (pricePerM2 <= avgPricePerM2 * 0.92) {
        reasons.push("Precio por m² competitivo dentro de esta fase.");
      } else if (pricePerM2 >= avgPricePerM2 * 1.08) {
        reasons.push("Precio por m² por encima del promedio del proyecto.");
      } else {
        reasons.push("Precio por m² alineado con el promedio comercial.");
      }
    }
    if (area > 0 && medianArea > 0) {
      reasons.push(area >= medianArea ? "Área igual o superior al lote medio del proyecto." : "Área más compacta para una entrada comercial más ligera.");
    }
    reasons.push(getLotContextDetail(spatialMeta));
    if (normalizedState === "disponible") {
      reasons.push("Disponibilidad inmediata para gestión comercial.");
    }

    return {
      pricePerM2,
      score,
      scoreLabel: getLotOpportunity(score),
      recommendation: reasons[0] || "Alternativa comercial útil según los datos disponibles.",
      reasons,
      contextLabel: getLotContextLabel(spatialMeta),
      contextDetail: getLotContextDetail(spatialMeta)
    };
  }

  function buildRiskAlerts(lote = {}) {
    const alerts = [];
    const normalizedSaleState = normalizeText(lote.venta_estado);

    if (lote.reserva_vigencia_expirada) {
      alerts.push({
        tone: "critical",
        label: "Reserva vencida",
        detail: "La vigencia comercial de esta reserva ya expiró."
      });
    } else if (lote.reserva_por_vencer) {
      alerts.push({
        tone: "warning",
        label: "Reserva por vencer",
        detail: "La reserva requiere seguimiento inmediato."
      });
    }

    if (lote.reserva_extension_pendiente) {
      alerts.push({
        tone: "info",
        label: "Extensión pendiente",
        detail: "Existe una solicitud de extensión pendiente de revisión."
      });
    }

    if (normalizedSaleState.includes("mora")) {
      alerts.push({
        tone: "critical",
        label: "Venta morosa",
        detail: "La operación presenta cuotas con mora."
      });
    } else if (normalizedSaleState.includes("venc")) {
      alerts.push({
        tone: "warning",
        label: "Venta vencida",
        detail: "Hay cuotas vencidas pendientes de regularización."
      });
    } else if (normalizedSaleState.includes("bloq")) {
      alerts.push({
        tone: "info",
        label: "Venta bloqueada",
        detail: "La operación no admite cambios hasta revisión administrativa."
      });
    }

    return alerts;
  }

  function buildFinancialSummary(lote = {}) {
    const total = Math.max(
      safeNumber(lote.precio_publico ?? lote.precio),
      safeNumber(lote.venta_total_financiado) + safeNumber(lote.monto_reserva)
    );
    const pagado = safeNumber(lote.venta_total_pagado);
    const saldo = Math.max(0, safeNumber(lote.venta_saldo_restante));
    const avance = clamp(safeNumber(lote.venta_avance_porcentaje), 0, 100);
    const cuotasVencidas = safeNumber(lote.venta_cuotas_vencidas);
    const cuotasMorosas = safeNumber(lote.venta_cuotas_morosas);

    return {
      total,
      pagado,
      saldo,
      avance,
      cuotasVencidas,
      cuotasMorosas,
      hasData: total > 0 || pagado > 0 || saldo > 0
    };
  }

  function buildPurchaseSimulation(price, options = {}) {
    const total = Math.max(0, safeNumber(price));
    const reserveApplied = clamp(safeNumber(options.reserveApplied), 0, total);
    const suggestedInitial = total > 0 ? Math.max(3000, Math.round(total * 0.1)) : 3000;
    const initial = clamp(safeNumber(options.initial, suggestedInitial), 0, total);
<<<<<<< HEAD
    const installments = clamp(Math.round(safeNumber(options.installments ?? options.months, 48)), 1, 240);
=======
    const months = clamp(Math.round(safeNumber(options.months, 48)), 1, 120);
>>>>>>> 95265aa (deploy)
    const financed = Math.max(0, total - initial);
    const monthly = installments > 0 ? financed / installments : 0;

    return {
      total,
      reserveApplied,
      initial,
      initialNet: Math.max(0, initial - reserveApplied),
      financed,
      months: installments,
      installments,
      monthly
    };
  }

  function buildComparisonHighlights(lots = []) {
    const highlights = new Map();
    const comparable = (Array.isArray(lots) ? lots : []).filter(Boolean);
    if (!comparable.length) return highlights;

    const bestScore = [...comparable].sort((left, right) => safeNumber(right.score) - safeNumber(left.score))[0];
    const bestValue = [...comparable]
      .filter((item) => safeNumber(item.pricePerM2) > 0)
      .sort((left, right) => safeNumber(left.pricePerM2) - safeNumber(right.pricePerM2))[0];
    const largestArea = [...comparable].sort((left, right) => safeNumber(right.area) - safeNumber(left.area))[0];

    if (bestScore) {
      highlights.set(bestScore.lote_id, ["Mejor opción"]);
    }
    if (bestValue) {
      highlights.set(bestValue.lote_id, [...(highlights.get(bestValue.lote_id) || []), "Mejor valor"]);
    }
    if (largestArea) {
      highlights.set(largestArea.lote_id, [...(highlights.get(largestArea.lote_id) || []), "Mayor área"]);
    }

    return highlights;
  }

  window.PlanoUtils = {
    SVG_NS,
    applyView,
    buildCommercialProfile,
    buildComparisonHighlights,
    buildFinancialSummary,
    buildPurchaseSimulation,
    buildRiskAlerts,
    calculateFitTransform,
    calculatePricePerSquareMeter,
    clamp,
    clearHighlightedManzana,
    clearSelection,
    createProjectBenchmark,
    createSvgNode,
    focusBounds,
    focusElements,
    formatArea,
    formatCompactCurrency,
    formatCurrency,
    getColorEstado,
    getContentBounds,
    getElementsBounds,
    getLabelMode,
    getLotContextDetail,
    getLotContextLabel,
    getLotOpportunity,
    getManzanaFromLoteId,
    getStatusMeta,
    getSvgBounds,
    getSvgElement,
    highlightManzana,
    isTouchDevice,
    normalizeText,
    repairText,
    safeNumber,
    throttleFrame,
    updateSvgTextSize,
    zoomManzana
  };
})();
