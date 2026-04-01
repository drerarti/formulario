const fetch = global.fetch;

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = process.env.AIRTABLE_BASE;
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;
const NUBEFACT_URL = process.env.NUBEFACT_URL;
const NUBEFACT_TOKEN = process.env.NUBEFACT_TOKEN;

const AIRTABLE_HEADERS = {
  Authorization: `Bearer ${AIRTABLE_TOKEN}`,
  "Content-Type": "application/json"
};
const AIRTABLE_BASE_URL = `https://api.airtable.com/v0/${BASE_ID}`;
const AIRTABLE_RATE_LIMIT_RETRIES = 1;
const AIRTABLE_RATE_LIMIT_DELAY_MS = 700;
const UNITS_CACHE_TTL_MS = 30000;
const BASIC_UNITS_FIELDS = [
  "unidad_id",
  "proyecto",
  "Fase",
  "Manzana",
  "Lote",
  "area_m2",
  "precio_lista",
  "estado_unidad",
  "reserva_record_id",
  "reserva_id"
];
const PLANO_UNIT_FIELDS = [
  "unidad_id",
  "proyecto",
  "Fase",
  "Manzana",
  "Lote",
  "area_m2",
  "precio_lista",
  "estado_unidad",
  "cliente_nombre",
  "agente_nombre",
  "monto_reserva",
  "descuento_solicitado",
  "sobreprecio",
  "motivo_descuento",
  "reserva_record_id",
  "reserva_id",
  "reserva_created_time"
];
const unitsListCache = {
  value: null,
  expiresAt: 0,
  promise: null
};

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify(payload)
  };
}

function success(payload, statusCode = 200) {
  return jsonResponse(statusCode, payload);
}

function failure(statusCode, error, extra = {}) {
  return jsonResponse(statusCode, { error, ...extra });
}

function getAuthHeader(event) {
  return event.headers.authorization || event.headers.Authorization || "";
}

function verifySession(event) {
  const authHeader = getAuthHeader(event);
  if (!authHeader.startsWith("Bearer ")) {
    return { error: failure(401, "No autorizado") };
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return { error: failure(401, "No autorizado") };
  }

  try {
    return { session: jwt.verify(token, JWT_SECRET) };
  } catch (error) {
    return { error: failure(401, "Token invÃƒÆ’Ã‚Â¡lido o expirado") };
  }
}

function requireSession(event, roles = []) {
  const { session, error } = verifySession(event);
  if (error) {
    return { error };
  }

  if (roles.length > 0 && !roles.includes(session.rol)) {
    return { error: failure(403, "Acceso restringido") };
  }

  return { session };
}

function asTrimmedString(value, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function asNumber(value, options = {}) {
  const { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY, fallback = 0 } = options;
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, number));
}

function escapeFormulaValue(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildQueryString(params = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => searchParams.append(key, String(item)));
      return;
    }

    searchParams.set(key, String(value));
  });

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : "";
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createRequestError(status, message, extra = {}) {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extra);
  return error;
}

function getRetryDelayMs(response) {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return retryAfter * 1000;
  }
  return AIRTABLE_RATE_LIMIT_DELAY_MS;
}

async function airtableRequest(path, options = {}, attempt = 0) {
  const {
    method = "GET",
    body,
    query
  } = options;
  const normalizedMethod = String(method || "GET").toUpperCase();

  const response = await fetch(
    `${AIRTABLE_BASE_URL}/${path}${buildQueryString(query)}`,
    {
      method: normalizedMethod,
      headers: AIRTABLE_HEADERS,
      body: body ? JSON.stringify(body) : undefined
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data.error?.message || data.error || `Airtable error (${response.status})`;
    if (response.status === 429 && normalizedMethod === "GET" && attempt < AIRTABLE_RATE_LIMIT_RETRIES) {
      await delay(getRetryDelayMs(response));
      return airtableRequest(path, options, attempt + 1);
    }
    throw createRequestError(response.status, message, {
      retryAfterMs: response.status === 429 ? getRetryDelayMs(response) : 0
    });
  }

  return data;
}

async function airtableList(table, options = {}) {
  const { formula, pageSize = 100, sort, fields } = options;
  let offset;
  let records = [];
  let selectedFields = Array.isArray(fields) && fields.length ? fields : null;

  do {
    const query = { pageSize };

    if (formula) {
      query.filterByFormula = formula;
    }

    if (offset) {
      query.offset = offset;
    }

    if (sort) {
      sort.forEach((entry, index) => {
        query[`sort[${index}][field]`] = entry.field;
        query[`sort[${index}][direction]`] = entry.direction || "asc";
      });
    }

    if (selectedFields) {
      query["fields[]"] = selectedFields;
    }

    let data;
    try {
      data = await airtableRequest(table, { query });
    } catch (error) {
      if (selectedFields && isUnknownFieldError(error)) {
        console.warn(`[airtable] Fallback sin fields[] para ${table}: ${error.message}`);
        selectedFields = null;
        delete query["fields[]"];
        data = await airtableRequest(table, { query });
      } else {
        throw error;
      }
    }
    records = records.concat(data.records || []);
    offset = data.offset;
  } while (offset);

  return records;
}

function invalidateUnitsListCache() {
  unitsListCache.value = null;
  unitsListCache.expiresAt = 0;
  unitsListCache.promise = null;
}

async function getCachedUnitsRecords(options = {}) {
  const { force = false } = options;
  const now = Date.now();

  if (!force && unitsListCache.value && unitsListCache.expiresAt > now) {
    return unitsListCache.value;
  }

  if (!force && unitsListCache.promise) {
    return unitsListCache.promise;
  }

  const request = airtableList("UNIDADES", {
    fields: BASIC_UNITS_FIELDS
  }).then((records) => {
    unitsListCache.value = records;
    unitsListCache.expiresAt = Date.now() + UNITS_CACHE_TTL_MS;
    return records;
  }).finally(() => {
    unitsListCache.promise = null;
  });

  unitsListCache.promise = request;
  return request;
}

function computeVentaSaldo(fields, totalPagadoCuotas = 0) {
  const precio = asNumber(fields.precio_base);
  const reserva = asNumber(fields.monto_reserva);
  const inicial = asNumber(fields.monto_inicial);
  return precio - reserva - inicial - totalPagadoCuotas;
}

function buildCommercialReservaCode(id, createdTime = "") {
  const seed = `${id || ""}|${createdTime || ""}`;
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 1000000;
  }

  return `AYL-RES-${String(hash).padStart(6, "0")}`;
}

const RESERVATION_CONFIRMATION_DAYS = 2;
const NEGOTIATION_TERM_DAYS = 15;
const NEGOTIATION_EXTENSION_DAYS = 15;
const EXTENSION_REQUIRED_DEPOSIT = 2500;
const RESERVATION_EXPIRING_THRESHOLD_DAYS = 3;

function buildCuotasPagoMap(cuotasRecords) {
  const totals = new Map();

  cuotasRecords.forEach((record) => {
    const ventaIds = Array.isArray(record.fields.venta) ? record.fields.venta : [];
    const montoPagado = asNumber(record.fields.monto_pagado, { min: 0 });

    ventaIds.forEach((ventaId) => {
      totals.set(ventaId, (totals.get(ventaId) || 0) + montoPagado);
    });
  });

  return totals;
}

function groupCuotasByVenta(cuotasRecords = []) {
  const map = new Map();

  cuotasRecords.forEach((record) => {
    const ventaIds = Array.isArray(record.fields.venta) ? record.fields.venta : [];
    ventaIds.forEach((ventaId) => {
      if (!map.has(ventaId)) {
        map.set(ventaId, []);
      }
      map.get(ventaId).push(record);
    });
  });

  map.forEach((records) => {
    records.sort((left, right) =>
      asNumber(left.fields.numero_cuota, { min: 0 }) - asNumber(right.fields.numero_cuota, { min: 0 })
    );
  });

  return map;
}

function groupExtensionsByReserva(extensionRecords = []) {
  const map = new Map();

  extensionRecords.forEach((record) => {
    const reservaId = asTrimmedString(record.fields.reserva_record_id || record.fields.reserva_id, 80);
    if (!reservaId) return;
    if (!map.has(reservaId)) {
      map.set(reservaId, []);
    }
    map.get(reservaId).push(record);
  });

  map.forEach((records) => {
    records.sort((left, right) => {
      const leftTime = new Date(left.createdTime || 0).getTime() || 0;
      const rightTime = new Date(right.createdTime || 0).getTime() || 0;
      return rightTime - leftTime;
    });
  });

  return map;
}

function sortByCreatedTimeDesc(records = []) {
  return [...records].sort((left, right) => {
    const leftTime = new Date(left.createdTime || left.created_at || 0).getTime() || 0;
    const rightTime = new Date(right.createdTime || right.created_at || 0).getTime() || 0;
    return rightTime - leftTime;
  });
}

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function parseDateOnly(value) {
  const trimmed = asTrimmedString(value, 30);
  if (!trimmed) return null;
  const date = new Date(`${trimmed}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(asTrimmedString(value, 30));
}

function startOfDay(date = new Date()) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function formatDateOnly(value) {
  const date = value instanceof Date ? value : parseDateOnly(value);
  if (!date) return "";
  return startOfDay(date).toISOString().split("T")[0];
}

function addDaysToDate(value, days = 0) {
  const baseDate = value instanceof Date ? new Date(value) : parseDateOnly(value);
  if (!baseDate) return null;
  const result = startOfDay(baseDate);
  result.setDate(result.getDate() + Number(days || 0));
  return result;
}

function addDaysToIso(value, days = 0) {
  return formatDateOnly(addDaysToDate(value, days));
}

function getDaysUntilDate(value, now = new Date()) {
  const target = parseDateOnly(value);
  if (!target) return null;
  return Math.round((startOfDay(target).getTime() - startOfDay(now).getTime()) / 86400000);
}

function getDaysPastDue(value, now = new Date()) {
  const dueDate = parseDateOnly(value);
  if (!dueDate) return 0;
  return Math.floor((startOfDay(now).getTime() - startOfDay(dueDate).getTime()) / 86400000);
}

function getCuotaState(fields, now = new Date()) {
  const montoProgramado = asNumber(fields.monto_programado, { min: 0 });
  const montoPagado = asNumber(fields.monto_pagado, { min: 0 });
  const saldo = Math.max(0, montoProgramado - montoPagado);
  const diasAtraso = Math.max(0, getDaysPastDue(fields.fecha_vencimiento, now));

  let estado = "Pendiente";

  if (saldo <= 0 && montoProgramado > 0) {
    estado = "Pagada";
  } else if (diasAtraso > 30) {
    estado = "Morosa";
  } else if (diasAtraso > 0) {
    estado = "Vencida";
  } else if (montoPagado > 0) {
    estado = "Parcial";
  }

  return {
    monto_programado: montoProgramado,
    monto_pagado: montoPagado,
    saldo,
    dias_atraso: diasAtraso,
    estado
  };
}

function getVentaSnapshot(fields, cuotaRecords = [], now = new Date()) {
  const cuotas = cuotaRecords.map((record) => ({
    id: record.id,
    numero_cuota: asNumber(record.fields.numero_cuota, { min: 0 }),
    fecha_vencimiento: record.fields.fecha_vencimiento || "",
    ...getCuotaState(record.fields, now)
  }));

  const totalPagadoCuotas = cuotas.reduce((sum, cuota) => sum + cuota.monto_pagado, 0);
  const saldoRestante = Math.max(0, computeVentaSaldo(fields, totalPagadoCuotas));
  const totalFinanciado = Math.max(
    0,
    asNumber(fields.precio_base, { min: 0 }) -
      asNumber(fields.monto_reserva, { min: 0 }) -
      asNumber(fields.monto_inicial, { min: 0 })
  );
  const totalProgramadoCuotas = cuotas.reduce((sum, cuota) => sum + cuota.monto_programado, 0);
  const cuotasVencidas = cuotas.filter((cuota) => cuota.estado === "Vencida").length;
  const cuotasMorosas = cuotas.filter((cuota) => cuota.estado === "Morosa").length;
  const cuotasParciales = cuotas.filter((cuota) => cuota.estado === "Parcial").length;
  const cuotasPendientes = cuotas.filter((cuota) => cuota.estado === "Pendiente").length;
  const hasPayments = totalPagadoCuotas > 0;
  const rawStatus = normalizeKey(fields.estado_venta);
  const proximaCuota = cuotas
    .filter((cuota) => cuota.saldo > 0 && cuota.fecha_vencimiento)
    .sort((left, right) => {
      const leftDate = parseDateOnly(left.fecha_vencimiento)?.getTime() || Number.MAX_SAFE_INTEGER;
      const rightDate = parseDateOnly(right.fecha_vencimiento)?.getTime() || Number.MAX_SAFE_INTEGER;
      return leftDate - rightDate;
    })[0] || null;

  let estadoVenta = "Pendiente";

  if (rawStatus.includes("cancel")) {
    estadoVenta = "Cancelada";
  } else if (rawStatus.includes("bloq")) {
    estadoVenta = "Bloqueada";
  } else if (saldoRestante <= 0) {
    estadoVenta = "Cerrada";
  } else if (cuotasMorosas > 0) {
    estadoVenta = "Morosa";
  } else if (cuotasVencidas > 0) {
    estadoVenta = "Vencida";
  } else if (hasPayments || cuotasParciales > 0) {
    estadoVenta = "Con pagos";
  } else if (cuotas.length > 0 || normalizeKey(fields.tipo_venta).includes("financ")) {
    estadoVenta = "En proceso";
  }

  const avancePorcentaje = totalFinanciado > 0
    ? Math.min(100, Math.round((totalPagadoCuotas / totalFinanciado) * 100))
    : saldoRestante <= 0
      ? 100
      : 0;

  return {
    cuotas,
    totalPagadoCuotas,
    totalProgramadoCuotas,
    saldoRestante,
    totalFinanciado,
    avancePorcentaje,
    cuotasPendientes,
    cuotasVencidas,
    cuotasMorosas,
    estadoVenta,
    proximaCuota
  };
}

function buildExtensionSnapshot(extensionRecords = []) {
  const normalized = sortByCreatedTimeDesc(extensionRecords).map((record) => ({
    id: record.id,
    status: normalizeKey(record.fields.estado_extension),
    amount: asNumber(record.fields.monto_adicional, { min: 0 }),
    comments: record.fields.comentarios || "",
    createdTime: record.createdTime || "",
    voucher: record.fields.voucher || []
  }));

  const approved = normalized.filter((item) => item.status === "aprobada");
  const pending = normalized.filter((item) => item.status === "solicitud");
  const rejected = normalized.filter((item) => item.status === "rechazada");
  const latestApproved = approved[0] || null;
  const latestPending = pending[0] || null;

  return {
    approved,
    pending,
    rejected,
    approvedCount: approved.length,
    pendingCount: pending.length,
    rejectedCount: rejected.length,
    latestApproved,
    latestPending,
    extensionUsed: approved.length > 0,
    hasPendingRequest: pending.length > 0,
    approvedDeposit: latestApproved ? latestApproved.amount : 0,
    pendingDeposit: latestPending ? latestPending.amount : 0,
    approvedDepositSatisfied: latestApproved ? latestApproved.amount >= EXTENSION_REQUIRED_DEPOSIT : false,
    pendingDepositSatisfied: latestPending ? latestPending.amount >= EXTENSION_REQUIRED_DEPOSIT : false
  };
}

function isReservationBlockingUnit(snapshot) {
  return ["pendiente_confirmacion", "confirmada", "negociacion"].includes(snapshot?.etapa) ||
    (snapshot?.etapa === "vencida" && snapshot?.extensionPending);
}

function getLinkedReservaId(fields = {}) {
  return asTrimmedString(fields.reserva_record_id || fields.reserva_id, 80);
}

function buildReservaLinkFormula(reservaIds = []) {
  const ids = [...new Set((Array.isArray(reservaIds) ? reservaIds : []).filter(Boolean))];
  if (!ids.length) return "";

  const recordClauses = ids.map((id) => `{reserva_record_id}="${escapeFormulaValue(id)}"`);
  const legacyClauses = ids.map((id) => `{reserva_id}="${escapeFormulaValue(id)}"`);
  return `OR(${recordClauses.concat(legacyClauses).join(",")})`;
}

async function buildSnapshotsByReservaIds(reservaIds = []) {
  const ids = [...new Set((Array.isArray(reservaIds) ? reservaIds : []).filter(Boolean))];
  const snapshots = new Map();
  if (!ids.length) {
    return snapshots;
  }

  const reservaRecords = [];
  for (const reservaId of ids) {
    try {
      reservaRecords.push(await airtableRequest(`RESERVAS/${reservaId}`));
    } catch (error) {
      reservaRecords.push(null);
    }
  }

  const extensionFormula = buildReservaLinkFormula(ids);
  const extensionRecords = extensionFormula
    ? await airtableList("SOLICITUDES_EXTENSION", { formula: extensionFormula })
    : [];
  const extensionsByReserva = groupExtensionsByReserva(extensionRecords);

  reservaRecords.filter(Boolean).forEach((record) => {
    snapshots.set(record.id, getReservaSnapshot(record, extensionsByReserva.get(record.id) || []));
  });

  return snapshots;
}

async function buildReservedUnitSnapshotMap(unitRecords = []) {
  const reservaIds = [...new Set((Array.isArray(unitRecords) ? unitRecords : [])
    .filter((record) => normalizeKey(record?.fields?.estado_unidad) === "reservado")
    .map((record) => getLinkedReservaId(record.fields || {}))
    .filter(Boolean))];

  return buildSnapshotsByReservaIds(reservaIds);
}

function getEffectiveReservedUnitState(record, snapshotMap = new Map()) {
  const fields = record?.fields || {};
  const rawState = normalizeKey(fields.estado_unidad) || "";

  if (rawState !== "reservado") {
    return rawState;
  }

  const reservaId = getLinkedReservaId(fields);
  if (!reservaId) {
    return rawState;
  }

  const snapshot = snapshotMap.get(reservaId);
  if (!snapshot) {
    return rawState;
  }

  return isReservationBlockingUnit(snapshot) ? "reservado" : "disponible";
}

function getReservaSnapshot(recordOrFields, extensionRecords = [], now = new Date()) {
  const record = recordOrFields && recordOrFields.fields ? recordOrFields : { fields: recordOrFields || {} };
  const fields = record.fields || {};
  const rawStatus = normalizeKey(fields.estado_reserva);
  const extension = buildExtensionSnapshot(extensionRecords);

  const fechaCreacion = asTrimmedString(fields.fecha_inicio, 30) || formatDateOnly(record.createdTime);
  const fechaValidacion = asTrimmedString(fields.fecha_validacion, 30);
  const fechaLimiteConfirmacion = fechaCreacion
    ? addDaysToIso(fechaCreacion, RESERVATION_CONFIRMATION_DAYS)
    : "";

  let fechaNegociacionInicio = asTrimmedString(fields.fecha_negociacion_inicio, 30);
  let fechaNegociacionFin = asTrimmedString(fields.fecha_vigencia_fin, 30);

  const looksNegotiation =
    rawStatus.includes("negoci") ||
    rawStatus.includes("proceso") ||
    rawStatus.includes("extendida");

  if (!fechaNegociacionInicio && fechaNegociacionFin && looksNegotiation) {
    const negotiationBaseDays = NEGOTIATION_TERM_DAYS + (extension.extensionUsed ? NEGOTIATION_EXTENSION_DAYS : 0);
    fechaNegociacionInicio = addDaysToIso(fechaNegociacionFin, -negotiationBaseDays);
  }

  if (!fechaNegociacionFin && fechaNegociacionInicio) {
    fechaNegociacionFin = addDaysToIso(
      fechaNegociacionInicio,
      NEGOTIATION_TERM_DAYS + (extension.extensionUsed ? NEGOTIATION_EXTENSION_DAYS : 0)
    );
  }

  const confirmationDays = getDaysUntilDate(fechaLimiteConfirmacion, now);
  const negotiationDays = getDaysUntilDate(fechaNegociacionFin, now);

  let estado = fields.estado_reserva || "Pendiente de confirmacion";
  let etapa = "reserva";
  let deadline = "";
  let deadlineType = "";

  if (rawStatus.includes("rechaz")) {
    estado = "Rechazada";
    etapa = "cerrada";
  } else if (rawStatus.includes("convert")) {
    estado = "Convertida";
    etapa = "venta";
  } else if (looksNegotiation) {
    etapa = "negociacion";
    deadline = fechaNegociacionFin;
    deadlineType = extension.extensionUsed ? "extension" : "negociacion";

    if (deadline && negotiationDays !== null && negotiationDays < 0) {
      estado = "Vencida";
      etapa = "vencida";
    } else if (extension.extensionUsed) {
      estado = "Negociacion extendida";
    } else {
      estado = "En negociacion";
    }
  } else if (rawStatus.includes("confirm")) {
    estado = "Confirmada";
    etapa = "confirmada";
  } else if (rawStatus.includes("venc")) {
    estado = "Vencida";
    etapa = "vencida";
  } else {
    deadline = fechaLimiteConfirmacion;
    deadlineType = "confirmacion";
    if (deadline && confirmationDays !== null && confirmationDays < 0) {
      estado = "Vencida";
      etapa = "vencida";
    } else {
      estado = "Pendiente de confirmacion";
      etapa = "pendiente_confirmacion";
    }
  }

  const daysUntilDeadline = deadlineType === "confirmacion" ? confirmationDays : negotiationDays;
  const isExpired = daysUntilDeadline !== null && daysUntilDeadline < 0;
  const isExpiringSoon = daysUntilDeadline !== null && daysUntilDeadline >= 0 && daysUntilDeadline <= RESERVATION_EXPIRING_THRESHOLD_DAYS;
  const canValidate = etapa === "pendiente_confirmacion" && !isExpired;
  const canReject = !["cerrada", "venta"].includes(etapa) && !rawStatus.includes("rechaz");
  const canNegotiate = ["confirmada", "negociacion"].includes(etapa) && !isExpired;
  const canConvert = ["confirmada", "negociacion"].includes(etapa) && !isExpired;
  const canRequestExtension = etapa === "negociacion" && !extension.extensionUsed && !extension.hasPendingRequest && !isExpired;
  const canApproveExtension = etapa === "negociacion" && !isExpired && !extension.extensionUsed && extension.hasPendingRequest && extension.pendingDepositSatisfied;

  return {
    rawStatus: fields.estado_reserva || "",
    estado,
    etapa,
    fechaCreacion,
    fechaValidacion,
    fechaLimiteConfirmacion,
    fechaNegociacionInicio,
    fechaNegociacionFin,
    deadline,
    deadlineType,
    daysUntilDeadline,
    daysPastDeadline: daysUntilDeadline !== null && daysUntilDeadline < 0 ? Math.abs(daysUntilDeadline) : 0,
    isExpired,
    isExpiringSoon,
    extensionUsed: extension.extensionUsed,
    extensionPending: extension.hasPendingRequest,
    extensionApprovedCount: extension.approvedCount,
    extensionPendingCount: extension.pendingCount,
    extensionRejectedCount: extension.rejectedCount,
    extensionPendingDeposit: extension.pendingDeposit,
    extensionApprovedDeposit: extension.approvedDeposit,
    extensionRequiredDeposit: EXTENSION_REQUIRED_DEPOSIT,
    extensionPendingDepositSatisfied: extension.pendingDepositSatisfied,
    extensionApprovedDepositSatisfied: extension.approvedDepositSatisfied,
    latestPendingExtension: extension.latestPending,
    latestApprovedExtension: extension.latestApproved,
    canValidate,
    canReject,
    canNegotiate,
    canConvert,
    canRequestExtension,
    canApproveExtension
  };
}

function getReservaUnitSummary(fields = {}, unidadRecord = null) {
  const unidadRecordId = Array.isArray(fields.unidad) && fields.unidad.length > 0
    ? fields.unidad[0]
    : "";
  const unidadCodigoRaw = Array.isArray(fields.unidad_codigo)
    ? fields.unidad_codigo[0]
    : fields.unidad_codigo;

  return {
    recordId: unidadRecordId,
    codigo: asTrimmedString(unidadRecord?.fields?.unidad_id || unidadCodigoRaw || unidadRecordId, 120),
    proyecto: asTrimmedString(unidadRecord?.fields?.proyecto, 120),
    fase: asTrimmedString(unidadRecord?.fields?.Fase || unidadRecord?.fields?.fase, 60),
    etapa: asTrimmedString(unidadRecord?.fields?.Etapa || unidadRecord?.fields?.etapa, 60),
    manzana: asTrimmedString(unidadRecord?.fields?.Manzana || unidadRecord?.fields?.manzana, 60),
    lote: asTrimmedString(unidadRecord?.fields?.Lote || unidadRecord?.fields?.lote, 60),
    area: asNumber(unidadRecord?.fields?.area_m2, { min: 0 }),
    precioLista: asNumber(unidadRecord?.fields?.precio_lista || fields.precio_lista_unidad, { min: 0 }),
    moneda: asTrimmedString(unidadRecord?.fields?.moneda, 12) || "PEN"
  };
}

function buildReservaListItem(record, snapshot, unidadRecord = null) {
  const fields = record.fields || {};
  const unidad = getReservaUnitSummary(fields, unidadRecord);

  return {
    id: record.id,
    codigo_comercial: buildCommercialReservaCode(record.id, record.createdTime),
    estado: snapshot.estado,
    estado_base: snapshot.rawStatus,
    etapa: snapshot.etapa,
    cliente: fields.cliente || "",
    boleta_emitida: Boolean(fields.boleta_emitida),
    monto_reserva: asNumber(fields.monto_reserva, { min: 0 }),
    agente: fields.agente || "",
    unidad: unidad.codigo || unidad.recordId,
    unidad_record_id: unidad.recordId || null,
    precio_lista: unidad.precioLista,
    descuento_solicitado: asNumber(fields.descuento_solicitado, { min: 0 }),
    sobreprecio: asNumber(fields.sobreprecio, { min: 0 }),
    motivo_descuento: fields.motivo_descuento || "",
    precio_final: asNumber(fields.precio_final, { min: 0 }),
    tipo_venta: fields.tipo_venta || "",
    numero_cuotas: asNumber(fields.numero_cuotas, { min: 0 }),
    monto_inicial: asNumber(fields.monto_inicial, { min: 0 }),
    fecha_inicio_pagos: fields.fecha_inicio_pagos || "",
    fecha_creacion: record.createdTime || "",
    fecha_inicio: snapshot.fechaCreacion || fields.fecha_inicio || record.createdTime || "",
    fecha_validacion: snapshot.fechaValidacion || fields.fecha_validacion || "",
    fecha_vigencia_fin: snapshot.deadline || snapshot.fechaNegociacionFin || "",
    fecha_limite_confirmacion: snapshot.fechaLimiteConfirmacion || "",
    fecha_negociacion_inicio: snapshot.fechaNegociacionInicio || "",
    fecha_negociacion_fin: snapshot.fechaNegociacionFin || "",
    dias_restantes: snapshot.daysUntilDeadline,
    dias_vencidos: snapshot.daysPastDeadline,
    deadline_type: snapshot.deadlineType || "",
    extension_usada: snapshot.extensionUsed,
    extension_pendiente: snapshot.extensionPending,
    deposito_extension_requerido: snapshot.extensionRequiredDeposit,
    deposito_extension_pendiente: snapshot.extensionPendingDeposit,
    deposito_extension_cumplido: snapshot.extensionPendingDepositSatisfied || snapshot.extensionApprovedDepositSatisfied,
    puede_validar: snapshot.canValidate,
    puede_rechazar: snapshot.canReject,
    puede_negociar: snapshot.canNegotiate,
    puede_convertir: snapshot.canConvert,
    puede_extender: snapshot.canRequestExtension,
    puede_aprobar_extension: snapshot.canApproveExtension,
    vigencia_expirada: snapshot.isExpired,
    vigencia_por_vencer: snapshot.isExpiringSoon,
    observaciones: fields.observaciones_negociacion || ""
  };
}

function isVentaLockedStatus(status) {
  return ["cancelada", "bloqueada", "cerrada"].includes(normalizeKey(status));
}

function buildAuditText(session, context, extra = "") {
  const actor = asTrimmedString(session?.nombre, 120) || "Sistema";
  const role = asTrimmedString(session?.rol, 60) || "sistema";
  const stamp = new Date().toISOString();
  const detail = asTrimmedString(extra, 300);
  return `[${context}] ${actor} (${role}) | ${stamp}${detail ? ` | ${detail}` : ""}`;
}

function isUnknownFieldError(error) {
  return /Unknown field name|UNKNOWN_FIELD_NAME|No field matching/i.test(String(error?.message || error));
}

async function createRecordWithOptionalAudit(table, fields, auditFields = {}) {
  try {
    return await airtableRequest(table, {
      method: "POST",
      body: {
        fields: {
          ...fields,
          ...auditFields
        }
      }
    });
  } catch (error) {
    if (!isUnknownFieldError(error)) {
      throw error;
    }

    return airtableRequest(table, {
      method: "POST",
      body: {
        fields
      }
    });
  }
}

async function patchRecordWithOptionalFields(path, requiredFields = {}, optionalFields = {}) {
  try {
    return await airtableRequest(path, {
      method: "PATCH",
      body: {
        fields: {
          ...requiredFields,
          ...optionalFields
        }
      }
    });
  } catch (error) {
    if (!isUnknownFieldError(error)) {
      throw error;
    }

    return airtableRequest(path, {
      method: "PATCH",
      body: {
        fields: requiredFields
      }
    });
  }
}

async function syncVentaFinancialState(ventaId, now = new Date()) {
  const ventaRecord = await airtableRequest(`VENTAS/${ventaId}`);
  const cuotaRecords = await airtableList("CUOTAS", {
    formula: `FIND("${escapeFormulaValue(ventaId)}", ARRAYJOIN({venta})) > 0`,
    sort: [{ field: "numero_cuota", direction: "asc" }]
  });

  const snapshot = getVentaSnapshot(ventaRecord.fields, cuotaRecords, now);

  for (const cuotaRecord of cuotaRecords) {
    const cuotaState = getCuotaState(cuotaRecord.fields, now);
    if ((cuotaRecord.fields.estado_cuota || "") !== cuotaState.estado) {
      await airtableRequest(`CUOTAS/${cuotaRecord.id}`, {
        method: "PATCH",
        body: {
          fields: {
            estado_cuota: cuotaState.estado
          }
        }
      });
    }
  }

  if ((ventaRecord.fields.estado_venta || "") !== snapshot.estadoVenta) {
    await airtableRequest(`VENTAS/${ventaId}`, {
      method: "PATCH",
      body: {
        fields: {
          estado_venta: snapshot.estadoVenta
        }
      }
    });
  }

  return {
    record: ventaRecord,
    snapshot
  };
}
exports.handler = async (event) => {

  const headers = {
    Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    "Content-Type": "application/json"
  };

  try {

    // ======================================================
    // ======================= GET ===========================
    // ======================================================
    if (event.httpMethod === "GET") {

      const qs = event.queryStringParameters || {};
      

      // ==============================
// GET SOLICITUDES EXTENSION
// ==============================
if (qs.extensiones === "1") {
<<<<<<< HEAD

  const url =
    `https://api.airtable.com/v0/${BASE_ID}/SOLICITUDES_EXTENSION`;

  const response = await fetch(url, { headers });

  if (!response.ok) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error obteniendo extensiones" })
    };
  }

  const data = await response.json();

  const result = data.records.map(r => ({
    id: r.id,
    reserva_id: r.fields.reserva_id || "",
    unidad_codigo: r.fields.unidad_codigo || "",
    cliente: r.fields.cliente || "",
    agente: r.fields.agente || "",
    monto_adicional: r.fields.monto_adicional || 0,
    comentarios: r.fields.comentarios || "",
    estado_extension: r.fields.estado_extension || "",
    voucher: r.fields.voucher || []
  }));

  return {
    statusCode: 200,
    body: JSON.stringify(result)
  };
=======
  const auth = requireSession(event);
  if (auth.error) return auth.error;

  const formula = auth.session.rol === "admin"
    ? ""
    : `LOWER({agente}) = LOWER("${escapeFormulaValue(auth.session.nombre)}")`;

  const records = await airtableList("SOLICITUDES_EXTENSION", {
    formula
  });

  const reservaIds = [...new Set(records
    .map((record) => asTrimmedString(record.fields.reserva_record_id || record.fields.reserva_id, 80))
    .filter(Boolean))];
  const reservasData = await Promise.all(reservaIds.map(async (reservaId) => {
    try {
      return await airtableRequest(`RESERVAS/${reservaId}`);
    } catch (error) {
      return null;
    }
  }));
  const reservasMap = new Map(reservasData.filter(Boolean).map((record) => [record.id, record]));
  const extensionsByReserva = groupExtensionsByReserva(records);

  const result = records.map((record) => {
    const reservaRecordId = asTrimmedString(record.fields.reserva_record_id || record.fields.reserva_id, 80);
    const reservaRecord = reservasMap.get(reservaRecordId);
    const snapshot = reservaRecord
      ? getReservaSnapshot(reservaRecord, extensionsByReserva.get(reservaRecordId) || [])
      : null;
    const montoAdicional = asNumber(record.fields.monto_adicional, { min: 0 });

    return {
      id: record.id,
      created_at: record.createdTime || "",
      reserva_id: record.fields.reserva_id || "",
      reserva_record_id: reservaRecordId,
      unidad_codigo: record.fields.unidad_codigo || "",
      cliente: record.fields.cliente || "",
      agente: record.fields.agente || "",
      monto_adicional: montoAdicional,
      comentarios: record.fields.comentarios || "",
      estado_extension: record.fields.estado_extension || "",
      voucher: record.fields.voucher || [],
      deposito_requerido: EXTENSION_REQUIRED_DEPOSIT,
      deposito_cumplido: montoAdicional >= EXTENSION_REQUIRED_DEPOSIT,
      extension_usada: snapshot ? snapshot.extensionUsed : false,
      estado_reserva: snapshot ? snapshot.estado : "",
      fecha_limite_reserva: snapshot ? snapshot.deadline : "",
      puede_aprobar: auth.session.rol === "admin" && snapshot
        ? Boolean(snapshot.canApproveExtension && snapshot.latestPendingExtension && snapshot.latestPendingExtension.id === record.id)
        : false
    };
  });

  return success(sortByCreatedTimeDesc(result));
>>>>>>> 5cc9890 (deploy)
}
      // =======================================
// OBTENER UNIDAD DESDE RESERVA
// =======================================

if (qs.reserva) {
<<<<<<< HEAD

  const reservaId = qs.reserva.trim().replace(",", "");

  const url = `https://api.airtable.com/v0/${BASE_ID}/RESERVAS/${reservaId}`;

  const response = await fetch(url, { headers });

  const data = await response.json();

  return {
    statusCode: 200,
    body: JSON.stringify({
  unidad_id: data.fields.unidad_codigo 
    ? data.fields.unidad_codigo[0] 
    : null
})
  };

}
=======
  const auth = requireSession(event);
  if (auth.error) return auth.error;

  const reservaId = qs.reserva.trim().replace(",", "");
  const data = await airtableRequest(`RESERVAS/${reservaId}`);

  return success({
    unidad_id: data.fields.unidad_codigo
      ? data.fields.unidad_codigo[0]
      : null
  });

}
      // ==============================
// GET DETALLE RESERVA
// ==============================
if (qs.reserva_detalle) {
  const auth = requireSession(event);
  if (auth.error) return auth.error;

  const reservaId = asTrimmedString(qs.reserva_detalle, 80);
  if (!reservaId) {
    return failure(400, "Reserva invÃƒÆ’Ã‚Â¡lida");
  }

  const reserva = await airtableRequest(`RESERVAS/${reservaId}`);
  const agenteReserva = asTrimmedString(reserva.fields.agente, 200).toLowerCase();
  const agenteSesion = asTrimmedString(auth.session.nombre, 200).toLowerCase();

  if (auth.session.rol !== "admin" && agenteReserva !== agenteSesion) {
    return failure(404, "Reserva no encontrada o no disponible para tu usuario");
  }

  const extensionRecords = await airtableList("SOLICITUDES_EXTENSION", {
    formula: buildReservaLinkFormula([reservaId])
  });
  const snapshot = getReservaSnapshot(reserva, extensionRecords);

  const unidadRecordId = Array.isArray(reserva.fields.unidad) && reserva.fields.unidad.length > 0
    ? reserva.fields.unidad[0]
    : "";
  const unidad = unidadRecordId
    ? await airtableRequest(`UNIDADES/${unidadRecordId}`)
    : null;
  const unidadSummary = getReservaUnitSummary(reserva.fields, unidad);
  const moneda = unidadSummary.moneda || "PEN";
  const precioLista = unidadSummary.precioLista;
  const precioFinal = asNumber(reserva.fields.precio_final || precioLista, { min: 0 });
  const montoReserva = asNumber(reserva.fields.monto_reserva, { min: 0 });
  const montoInicial = asNumber(reserva.fields.monto_inicial, { min: 0 });
  const saldoPendiente = Math.max(0, precioFinal - montoReserva - montoInicial);

  return success({
    id: reserva.id,
    codigo_comercial: buildCommercialReservaCode(reserva.id, reserva.createdTime),
    fecha_creacion: snapshot.fechaCreacion || reserva.createdTime || reserva.fields.fecha_inicio || "",
    fecha_inicio: snapshot.fechaCreacion || reserva.fields.fecha_inicio || "",
    fecha_validacion: snapshot.fechaValidacion || reserva.fields.fecha_validacion || "",
    fecha_vigencia_fin: snapshot.deadline || snapshot.fechaNegociacionFin || "",
    fecha_limite_confirmacion: snapshot.fechaLimiteConfirmacion || "",
    fecha_negociacion_inicio: snapshot.fechaNegociacionInicio || "",
    fecha_negociacion_fin: snapshot.fechaNegociacionFin || "",
    deadline_type: snapshot.deadlineType || "",
    dias_restantes: snapshot.daysUntilDeadline,
    dias_vencidos: snapshot.daysPastDeadline,
    vigencia_expirada: snapshot.isExpired,
    vigencia_por_vencer: snapshot.isExpiringSoon,
    estado: snapshot.estado,
    estado_base: snapshot.rawStatus,
    etapa: snapshot.etapa,
    agente: {
      nombre: reserva.fields.agente || auth.session.nombre || "",
      codigo: ""
    },
    cliente: {
      nombre: reserva.fields.cliente || "",
      dni: reserva.fields.dni_cliente || "",
      telefono: reserva.fields.telefono_cliente || ""
    },
    unidad: {
      record_id: unidadRecordId,
      codigo: unidadSummary.codigo || "",
      proyecto: unidadSummary.proyecto || "",
      fase: unidadSummary.fase || "",
      etapa: unidadSummary.etapa || "",
      manzana: unidadSummary.manzana || "",
      lote: unidadSummary.lote || "",
      area: unidadSummary.area || 0,
      precio_lista: precioLista,
      moneda
    },
    financiero: {
      monto_reserva: montoReserva,
      monto_inicial: montoInicial,
      precio_final: precioFinal,
      saldo_pendiente: saldoPendiente,
      moneda,
      tipo_operacion: reserva.fields.tipo_venta || "Reserva",
      descuento_solicitado: reserva.fields.descuento_solicitado || 0,
      sobreprecio: reserva.fields.sobreprecio || 0
    },
    extension: {
      usada: snapshot.extensionUsed,
      pendiente: snapshot.extensionPending,
      deposito_requerido: snapshot.extensionRequiredDeposit,
      deposito_pendiente: snapshot.extensionPendingDeposit,
      deposito_cumplido: snapshot.extensionPendingDepositSatisfied || snapshot.extensionApprovedDepositSatisfied,
      aprobadas: snapshot.extensionApprovedCount,
      pendientes: snapshot.extensionPendingCount,
      rechazadas: snapshot.extensionRejectedCount
    },
    reglas: {
      puede_validar: snapshot.canValidate,
      puede_rechazar: snapshot.canReject,
      puede_negociar: snapshot.canNegotiate,
      puede_convertir: snapshot.canConvert,
      puede_extender: snapshot.canRequestExtension,
      puede_aprobar_extension: snapshot.canApproveExtension
    },
    observaciones: reserva.fields.observaciones_negociacion || "",
    motivo_descuento: reserva.fields.motivo_descuento || "",
    boleta_emitida: !!reserva.fields.boleta_emitida
  });
}
>>>>>>> 5cc9890 (deploy)
      // ==============================
// LOGIN AGENTE
// ==============================

if (qs.validar_agente === "1") {

  const codigo = asTrimmedString(qs.codigo, 80);

  if (!codigo) {
    return {
      statusCode: 400,
      body: JSON.stringify({ valido: false })
    };
  }

  const formula = `{codigo_agente}="${escapeFormulaValue(codigo)}"`;

  const url = `https://api.airtable.com/v0/${BASE_ID}/AGENTES?filterByFormula=${encodeURIComponent(formula)}`;

  const response = await fetch(url, { headers });
  const data = await response.json();

  if (!data.records || data.records.length === 0) {
    return {
      statusCode: 200,
      body: JSON.stringify({ valido: false })
    };
  }

  const agente = data.records[0].fields;

  if (agente.estado !== "Activo") {
    return {
      statusCode: 200,
      body: JSON.stringify({ valido: false })
    };
  }

  const token = jwt.sign(
    {
      codigo: agente.codigo_agente,
      nombre: agente.nombre,
      rol: agente.rol
    },
    JWT_SECRET,
    { expiresIn: "8h" }
  );

  return {
    statusCode: 200,
    body: JSON.stringify({
      valido: true,
      token
    })
  };
}
      // ==============================
// VALIDAR AGENTE
// ==============================

if (qs.admin === "1") {
  {
  const auth = requireSession(event, ["admin"]);
  if (auth.error) return auth.error;

  const records = await airtableList("RESERVAS", {
    formula: `AND({estado_reserva}!="Rechazada",{estado_reserva}!="Convertida")`,
    sort: [{ field: "fecha_inicio", direction: "desc" }]
  });
  const extensionRecords = await airtableList("SOLICITUDES_EXTENSION");
  const extensionsByReserva = groupExtensionsByReserva(extensionRecords);
  const unitIds = [...new Set(records
    .map((record) => Array.isArray(record.fields.unidad) ? record.fields.unidad[0] : "")
    .filter(Boolean))];
  const unitRecords = await Promise.all(unitIds.map(async (unidadId) => {
    try {
      return await airtableRequest(`UNIDADES/${unidadId}`);
    } catch (error) {
      return null;
    }
  }));
  const unitsById = new Map(unitRecords.filter(Boolean).map((record) => [record.id, record]));

  const result = records
    .map((record) => {
      const snapshot = getReservaSnapshot(record, extensionsByReserva.get(record.id) || []);
      const unidadRecordId = Array.isArray(record.fields.unidad) ? record.fields.unidad[0] : "";
      return buildReservaListItem(record, snapshot, unitsById.get(unidadRecordId) || null);
    })
    .filter((item) => item.etapa !== "venta" && item.etapa !== "cerrada");

  return success(result);
  }

  const authHeader = event.headers.authorization;
  if (!authHeader) {
    return { statusCode: 401, body: JSON.stringify({ error: "No autorizado" }) };
  }

  const token = authHeader.split(" ")[1];

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return { statusCode: 401, body: JSON.stringify({ error: "Token invÃƒÆ’Ã‚Â¡lido" }) };
  }

  if (decoded.rol !== "admin") {
    return {
      statusCode: 403,
      body: JSON.stringify({ error: "Acceso restringido a administrador" })
    };
  }

  const formula = `
    OR(
      {estado_reserva}="Solicitud",
      {estado_reserva}="Confirmada"
    )
  `;

  const url = `https://api.airtable.com/v0/${BASE_ID}/RESERVAS?filterByFormula=${encodeURIComponent(formula)}`;

  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error("Error obteniendo reservas");

  const data = await response.json();

const result = data.records.map(r => {

  let unidadCodigo = "";
  let precioLista = r.fields.precio_lista_unidad || 0;

   if (r.fields.unidad && r.fields.unidad.length > 0) {
    unidadCodigo = r.fields.unidad[0];
  }

  return {
    id: r.id,
    estado: r.fields.estado_reserva,
    cliente: r.fields.cliente,
    boleta_emitida: r.fields.boleta_emitida || false,
    monto_reserva: r.fields.monto_reserva || 0,
    agente: r.fields.agente || "",
    unidad: unidadCodigo,
    unidad_record_id: r.fields.unidad ? r.fields.unidad[0] : null,
    precio_lista: precioLista,
    descuento_solicitado: r.fields.descuento_solicitado || 0,
sobreprecio: r.fields.sobreprecio || 0,
motivo_descuento: r.fields.motivo_descuento || "",
    precio_final: r.fields.precio_final || "",
    tipo_venta: r.fields.tipo_venta || "",
    numero_cuotas: r.fields.numero_cuotas || "",
    monto_inicial: r.fields.monto_inicial || "",
    fecha_inicio_pagos: r.fields.fecha_inicio_pagos || "",
    observaciones: r.fields.observaciones_negociacion || ""
  };

});

  return { statusCode: 200, body: JSON.stringify(result) };
}
// ==============================
// GET MIS RESERVAS (AGENTE)
// ==============================
if (qs.mis_reservas === "1") {
  {
  const auth = requireSession(event);
  if (auth.error) return auth.error;

  const formula = `LOWER({agente}) = LOWER("${escapeFormulaValue(auth.session.nombre)}")`;
  const records = await airtableList("RESERVAS", {
    formula,
    sort: [{ field: "fecha_inicio", direction: "desc" }]
  });
  const extensionRecords = await airtableList("SOLICITUDES_EXTENSION", {
    formula: `LOWER({agente}) = LOWER("${escapeFormulaValue(auth.session.nombre)}")`
  });
  const extensionsByReserva = groupExtensionsByReserva(extensionRecords);
  const unitIds = [...new Set(records
    .map((record) => Array.isArray(record.fields.unidad) ? record.fields.unidad[0] : "")
    .filter(Boolean))];
  const unitRecords = await Promise.all(unitIds.map(async (unidadId) => {
    try {
      return await airtableRequest(`UNIDADES/${unidadId}`);
    } catch (error) {
      return null;
    }
  }));
  const unitsById = new Map(unitRecords.filter(Boolean).map((record) => [record.id, record]));

  return success(records.map((record) => {
    const snapshot = getReservaSnapshot(record, extensionsByReserva.get(record.id) || []);
    const unidadRecordId = Array.isArray(record.fields.unidad) ? record.fields.unidad[0] : "";
    const item = buildReservaListItem(record, snapshot, unitsById.get(unidadRecordId) || null);

    return {
      ...item,
      monto: item.monto_reserva
    };
  }));
  }

  const authHeader = event.headers.authorization;
  if (!authHeader) {
    return { statusCode: 401, body: JSON.stringify({ error: "No autorizado" }) };
  }

  const token = authHeader.split(" ")[1];

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return { statusCode: 401, body: JSON.stringify({ error: "Token invÃƒÆ’Ã‚Â¡lido" }) };
  }

  const formula = `LOWER({agente}) = LOWER("${decoded.nombre}")`;

  const url =
  `https://api.airtable.com/v0/${BASE_ID}/RESERVAS` +
  `?filterByFormula=${encodeURIComponent(formula)}` +
  `&expand[]=unidad`;

const response = await fetch(url, { headers });
const data = await response.json();

const result = data.records.map(r => {

let unidadCodigo = "";
let precioLista = r.fields.precio_lista_unidad || 0;

if (r.fields.unidad && r.fields.unidad.length > 0) {
  unidadCodigo = r.fields.unidad[0];
}
return {
  cliente: r.fields.cliente,
  unidad: unidadCodigo,
  unidad_record_id: r.fields.unidad ? r.fields.unidad[0] : "",
  monto: r.fields.monto_reserva || 0,
  precio_lista: precioLista,
  estado: r.fields.estado_reserva || "",
  descuento_solicitado: r.fields.descuento_solicitado || 0,
sobreprecio: r.fields.sobreprecio || 0,
motivo_descuento: r.fields.motivo_descuento || "",
};

});
return {
  statusCode: 200,
  body: JSON.stringify(result)
};}
// ==============================
// GET KPIS AGENTE
// ==============================
if (qs.kpis_agente === "1") {
  {
  const auth = requireSession(event);
  if (auth.error) return auth.error;

  const agente = escapeFormulaValue(auth.session.nombre);
  const reservasRecords = await airtableList("RESERVAS", {
    formula: `LOWER({agente}) = LOWER("${agente}")`
  });
  const ventasRecords = await airtableList("VENTAS", {
    formula: `LOWER({agente}) = LOWER("${agente}")`
  });
  const cuotasRecords = await airtableList("CUOTAS");
  const pagosPorVenta = buildCuotasPagoMap(cuotasRecords);

  let comisionProyectada = 0;
  let comisionDisponible = 0;

  ventasRecords.forEach((venta) => {
    const precio = asNumber(venta.fields.precio_base);
    const saldo = Math.max(0, computeVentaSaldo(venta.fields, pagosPorVenta.get(venta.id) || 0));
    const comision = precio * 0.05;
    comisionProyectada += comision;

    if (saldo <= 0 || String(venta.fields.estado_venta || "").toLowerCase() === "pagada") {
      comisionDisponible += comision;
    }
  });

  return success({
    reservas: reservasRecords.length,
    ventas: ventasRecords.length,
    comision_proyectada: comisionProyectada,
    comision_disponible: comisionDisponible
  });
  }

  const authHeader = event.headers.authorization;
  if (!authHeader) {
    return { statusCode: 401, body: JSON.stringify({ error: "No autorizado" }) };
  }

  const token = authHeader.split(" ")[1];

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return { statusCode: 401, body: JSON.stringify({ error: "Token invÃƒÆ’Ã‚Â¡lido" }) };
  }

  const agente = decoded.nombre;

  // =====================
  // RESERVAS
  // =====================

  const formulaReservas = `FIND("${agente}", {agente})`;

  const urlReservas =
    `https://api.airtable.com/v0/${BASE_ID}/RESERVAS?filterByFormula=${encodeURIComponent(formulaReservas)}`;

  const resReservas = await fetch(urlReservas, { headers });
  const dataReservas = await resReservas.json();

  const reservas = dataReservas.records.length;

  // =====================
  // VENTAS
  // =====================

  const formulaVentas = `FIND("${agente}", {agente})`;

  const urlVentas =
    `https://api.airtable.com/v0/${BASE_ID}/VENTAS?filterByFormula=${encodeURIComponent(formulaVentas)}`;

  const resVentas = await fetch(urlVentas, { headers });
  const dataVentas = await resVentas.json();

  const ventas = dataVentas.records.length;
let comisionProyectada = 0;

dataVentas.records.forEach(v => {
  const precio = v.fields.precio_base || 0;

  // comisiÃƒÆ’Ã‚Â³n 5%
  const comision = precio * 0.05;

  comisionProyectada += comision;
});
  return {
  statusCode: 200,
  body: JSON.stringify({
    reservas,
    ventas,
    comision_proyectada: comisionProyectada
  })
};
}
// ==============================
// GET MIS VENTAS (AGENTE)
// ==============================
if (qs.mis_ventas === "1") {
  {
  const auth = requireSession(event);
  if (auth.error) return auth.error;

  const formula = `LOWER({agente}) = LOWER("${escapeFormulaValue(auth.session.nombre)}")`;
  const records = await airtableList("VENTAS", { formula });
  const cuotasRecords = await airtableList("CUOTAS");
  const cuotasByVenta = groupCuotasByVenta(cuotasRecords);

  return success(records.map((r) => {
    let unidadCodigo = "";

    if (Array.isArray(r.fields.unidad) && r.fields.unidad.length > 0) {
      unidadCodigo = r.fields.unidad[0];
    }

    const snapshot = getVentaSnapshot(r.fields, cuotasByVenta.get(r.id) || []);

    return {
      id: r.id,
      cliente: r.fields.cliente || "",
      unidad: unidadCodigo,
      precio_base: asNumber(r.fields.precio_base),
      saldo_restante: snapshot.saldoRestante,
      total_pagado: snapshot.totalPagadoCuotas,
      avance_porcentaje: snapshot.avancePorcentaje,
      estado: snapshot.estadoVenta
    };
  }));
  }

  const authHeader = event.headers.authorization;
  if (!authHeader) {
    return { statusCode: 401, body: JSON.stringify({ error: "No autorizado" }) };
  }

  const token = authHeader.split(" ")[1];

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return { statusCode: 401, body: JSON.stringify({ error: "Token invÃƒÆ’Ã‚Â¡lido" }) };
  }

  const agente = decoded.nombre;

 const formula = `{agente}="${agente}"`;

  const url =
    `https://api.airtable.com/v0/${BASE_ID}/VENTAS?filterByFormula=${encodeURIComponent(formula)}&expand[]=unidad`;

  const response = await fetch(url, { headers });
  const data = await response.json();

  const result = data.records.map(r => {
let unidadCodigo = "";

if (r.expanded && r.expanded.unidad && r.expanded.unidad.length > 0) {
  unidadCodigo = r.expanded.unidad[0].fields.unidad_codigo || "";
}
    const precio = r.fields.precio_base || 0;
    const reserva = r.fields.monto_reserva || 0;
    const inicial = r.fields.monto_inicial || 0;
    const saldo = precio - reserva - inicial;

    return {
      id: r.id,
      cliente: r.fields.cliente || "",
      unidad: unidadCodigo,
      precio_base: precio,
      saldo_restante: saldo > 0 ? saldo : 0,
      estado: r.fields.estado_venta || "Activa"
    };
  });

  return { statusCode: 200, body: JSON.stringify(result) };
}

// ==============================
// GET ESTADO PARA PLANO
// ==============================
if (qs.plano === "1") {
  const auth = requireSession(event);
  if (auth.error) return auth.error;

  const proyecto = asTrimmedString(qs.proyecto, 60);
  const fase = asTrimmedString(qs.fase, 60);
  const isAdmin = auth.session.rol === "admin";
  const sessionAgentName = normalizeKey(auth.session.nombre);

  const formula = `
    AND(
      {proyecto}="${proyecto}",
      {Fase}="${fase}"
    )
  `;

  const allRecords = await airtableList("UNIDADES", {
    formula,
    fields: PLANO_UNIT_FIELDS
  });
  const reservationSnapshots = await buildReservedUnitSnapshotMap(allRecords);
  const ventasByUnidad = new Map();

  if (isAdmin) {
    const ventasRecords = await airtableList("VENTAS", {
      fields: ["unidad", "estado_venta", "tipo_venta", "precio_base", "monto_reserva", "monto_inicial"]
    });
    const cuotasRecords = await airtableList("CUOTAS", {
      fields: ["venta", "monto_programado", "monto_pagado", "fecha_vencimiento", "estado_cuota"]
    });
    const cuotasByVenta = groupCuotasByVenta(cuotasRecords);

    ventasRecords.forEach((record) => {
      const snapshot = getVentaSnapshot(record.fields, cuotasByVenta.get(record.id) || []);
      const unidadIds = Array.isArray(record.fields.unidad) ? record.fields.unidad : [];

      unidadIds.forEach((unidadId) => {
        if (!ventasByUnidad.has(unidadId)) {
          ventasByUnidad.set(unidadId, {
            id: record.id,
            estado: snapshot.estadoVenta,
            totalPagadoCuotas: snapshot.totalPagadoCuotas,
            saldoRestante: snapshot.saldoRestante,
            avancePorcentaje: snapshot.avancePorcentaje,
            cuotasVencidas: snapshot.cuotasVencidas,
            cuotasMorosas: snapshot.cuotasMorosas,
            totalFinanciado: snapshot.totalFinanciado
          });
        }
      });
    });
  }

  const result = allRecords.map((record) => {
    const fields = record.fields || {};
    const reservaId = fields.reserva_record_id || fields.reserva_id || "";
    const isOwnedReservation = isAdmin || (
      sessionAgentName &&
      normalizeKey(fields.agente_nombre) &&
      sessionAgentName === normalizeKey(fields.agente_nombre)
    );
    const ventaInfo = ventasByUnidad.get(record.id);
    const effectiveState = getEffectiveReservedUnitState(record, reservationSnapshots);
    const canExposeReserva = effectiveState === "reservado";
    const reservaSnapshot = canExposeReserva && reservaId
      ? reservationSnapshots.get(reservaId) || null
      : null;

<<<<<<< HEAD
  allRecords = allRecords.concat(data.records);

  offset = data.offset;

} while (offset);

const result = allRecords.map(r => ({
  lote_id: r.fields.unidad_id,
  estado: (r.fields.estado_unidad || "").toLowerCase(),
  precio: r.fields.precio_lista || 0,
  manzana: r.fields.Manzana || "",
  lote: r.fields.Lote || "",
  area: r.fields.area_m2 || 0,
    cliente: r.fields.cliente_nombre,
  agente: r.fields.agente_nombre,
  monto_reserva: r.fields.monto_reserva,
  descuento_solicitado: r.fields.descuento_solicitado,
  sobreprecio: r.fields.sobreprecio,
  motivo_descuento: r.fields.motivo_descuento,
  reserva_id: r.id
}));
  return { statusCode: 200, body: JSON.stringify(result) };
=======
    return {
      unidad_record_id: record.id,
      lote_id: fields.unidad_id || "",
      estado: effectiveState || normalizeKey(fields.estado_unidad) || "",
      precio: asNumber(fields.precio_lista, { min: 0 }),
      precio_publico: asNumber(fields.precio_lista, { min: 0 }),
      manzana: fields.Manzana || "",
      lote: fields.Lote || "",
      area: asNumber(fields.area_m2, { min: 0 }),
      proyecto: fields.proyecto || proyecto,
      fase: fields.Fase || fase,
      cliente: isAdmin ? fields.cliente_nombre || "" : "",
      agente: isAdmin ? fields.agente_nombre || "" : "",
      monto_reserva: isAdmin ? asNumber(fields.monto_reserva, { min: 0 }) : 0,
      descuento_solicitado: isAdmin ? asNumber(fields.descuento_solicitado, { min: 0 }) : 0,
      sobreprecio: isAdmin ? asNumber(fields.sobreprecio, { min: 0 }) : 0,
      motivo_descuento: isAdmin ? fields.motivo_descuento || "" : "",
      reserva_id: isOwnedReservation && canExposeReserva ? reservaId : "",
      can_view_reserva: Boolean(isOwnedReservation && canExposeReserva && reservaId),
      reserva_codigo_comercial: isOwnedReservation && canExposeReserva && reservaId
        ? buildCommercialReservaCode(reservaId, fields.reserva_created_time || "")
        : "",
      reserva_estado: isOwnedReservation && canExposeReserva ? reservaSnapshot?.estado || "" : "",
      reserva_etapa: isOwnedReservation && canExposeReserva ? reservaSnapshot?.etapa || "" : "",
      reserva_dias_restantes: isOwnedReservation && canExposeReserva ? reservaSnapshot?.daysUntilDeadline ?? null : null,
      reserva_vigencia_expirada: Boolean(isOwnedReservation && canExposeReserva && reservaSnapshot?.isExpired),
      reserva_por_vencer: Boolean(isOwnedReservation && canExposeReserva && reservaSnapshot?.isExpiringSoon),
      reserva_extension_pendiente: Boolean(isOwnedReservation && canExposeReserva && reservaSnapshot?.extensionPending),
      reserva_extension_usada: Boolean(isOwnedReservation && canExposeReserva && reservaSnapshot?.extensionUsed),
      venta_id: isAdmin && ventaInfo ? ventaInfo.id : "",
      venta_estado: isAdmin && ventaInfo ? ventaInfo.estado : "",
      venta_total_pagado: isAdmin && ventaInfo ? ventaInfo.totalPagadoCuotas : 0,
      venta_saldo_restante: isAdmin && ventaInfo ? ventaInfo.saldoRestante : 0,
      venta_avance_porcentaje: isAdmin && ventaInfo ? ventaInfo.avancePorcentaje : 0,
      venta_cuotas_vencidas: isAdmin && ventaInfo ? ventaInfo.cuotasVencidas : 0,
      venta_cuotas_morosas: isAdmin && ventaInfo ? ventaInfo.cuotasMorosas : 0,
      venta_total_financiado: isAdmin && ventaInfo ? ventaInfo.totalFinanciado : 0
    };
  });
  return success(result);
>>>>>>> 5cc9890 (deploy)
}
      // ==============================
      // GET VENTAS
      // ==============================
      if (qs.ventas === "1") {
        {
        const auth = requireSession(event, ["admin"]);
        if (auth.error) return auth.error;

        const records = await airtableList("VENTAS");
        const cuotasRecords = await airtableList("CUOTAS");
        const cuotasByVenta = groupCuotasByVenta(cuotasRecords);

        const result = records.map(r => {
          const snapshot = getVentaSnapshot(r.fields, cuotasByVenta.get(r.id) || []);

          return {
            id: r.id,
            cliente: r.fields.cliente || "",
            unidad: Array.isArray(r.fields.unidad)
              ? r.fields.unidad[0]
              : r.fields.unidad || "",
            agente: r.fields.agente || "",
            precio_base: asNumber(r.fields.precio_base),
            monto_reserva: asNumber(r.fields.monto_reserva),
            monto_inicial: asNumber(r.fields.monto_inicial),
            saldo_restante: snapshot.saldoRestante,
            total_pagado: snapshot.totalPagadoCuotas,
            avance_porcentaje: snapshot.avancePorcentaje,
            cuotas_vencidas: snapshot.cuotasVencidas,
            cuotas_morosas: snapshot.cuotasMorosas,
            proxima_cuota: snapshot.proximaCuota?.fecha_vencimiento || "",
            tipo_venta: r.fields.tipo_venta || "",
            fecha_venta: r.fields.fecha_venta || "",
            estado_venta: snapshot.estadoVenta
          };
        });

        return success(result);
        }

        const response = await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/VENTAS`,
          { headers }
        );

        if (!response.ok) throw new Error("Error obteniendo ventas");

        const data = await response.json();

        const result = data.records.map(r => {

          const precio = r.fields.precio_base || 0;
          const reserva = r.fields.monto_reserva || 0;
          const inicial = r.fields.monto_inicial || 0;
          const saldo = precio - reserva - inicial;

          return {
            id: r.id,
            cliente: r.fields.cliente || "",
            unidad: Array.isArray(r.fields.unidad)
              ? r.fields.unidad[0]
              : r.fields.unidad || "",
            agente: r.fields.agente || "",
            precio_base: precio,
            monto_reserva: reserva,
            monto_inicial: inicial,
            saldo_restante: saldo > 0 ? saldo : 0,
            tipo_venta: r.fields.tipo_venta || "",
            fecha_venta: r.fields.fecha_venta || "",
            estado_venta: r.fields.estado_venta || "Activa"
          };
        });

        return { statusCode: 200, body: JSON.stringify(result) };
      }

      // ==============================
      // GET DETALLE VENTA
      // ==============================
      if (qs.venta_id) {
        {
        const auth = requireSession(event, ["admin"]);
        if (auth.error) return auth.error;

        const ventaData = await airtableRequest(`VENTAS/${qs.venta_id}`);
        const f = ventaData.fields;
        const cuotasVenta = await airtableList("CUOTAS", {
          formula: `FIND("${escapeFormulaValue(qs.venta_id)}", ARRAYJOIN({venta})) > 0`
        });
        const snapshot = getVentaSnapshot(f, cuotasVenta);

        return success({
          id: ventaData.id,
          cliente: f.cliente || "",
          unidad: Array.isArray(f.unidad) ? f.unidad[0] : f.unidad || "",
          agente: f.agente || "",
          precio_base: asNumber(f.precio_base),
          monto_reserva: asNumber(f.monto_reserva),
          monto_inicial: asNumber(f.monto_inicial),
          saldo_restante: snapshot.saldoRestante,
          total_pagado: snapshot.totalPagadoCuotas,
          avance_porcentaje: snapshot.avancePorcentaje,
          cuotas_vencidas: snapshot.cuotasVencidas,
          cuotas_morosas: snapshot.cuotasMorosas,
          total_cuotas: snapshot.cuotas.length,
          proxima_cuota: snapshot.proximaCuota?.fecha_vencimiento || "",
          tipo_venta: f.tipo_venta || "",
          fecha_venta: f.fecha_venta || "",
          estado_venta: snapshot.estadoVenta
        });
        }

        const ventaRes = await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/VENTAS/${qs.venta_id}`,
          { headers }
        );

        if (!ventaRes.ok) {
          return { statusCode: 404, body: JSON.stringify({ error: "Venta no encontrada" }) };
        }

        const ventaData = await ventaRes.json();
        const f = ventaData.fields;

        const precio = f.precio_base || 0;
        const reserva = f.monto_reserva || 0;
        const inicial = f.monto_inicial || 0;

        return {
          statusCode: 200,
          body: JSON.stringify({
            id: ventaData.id,
            cliente: f.cliente || "",
            unidad: Array.isArray(f.unidad) ? f.unidad[0] : f.unidad || "",
            agente: f.agente || "",
            precio_base: precio,
            monto_reserva: reserva,
            monto_inicial: inicial,
            saldo_restante: precio - reserva - inicial,
            tipo_venta: f.tipo_venta || "",
            fecha_venta: f.fecha_venta || "",
            estado_venta: f.estado_venta || "Activa"
          })
        };
      }

      // ==============================
      // GET CUOTAS POR VENTA (ROBUSTO)
      // ==============================
      if (qs.cuotas_venta) {
        {
        const auth = requireSession(event, ["admin"]);
        if (auth.error) return auth.error;

        const ventaId = qs.cuotas_venta;
        const cuotas = await airtableList("CUOTAS", {
          formula: `FIND("${escapeFormulaValue(ventaId)}", ARRAYJOIN({venta})) > 0`,
          sort: [{ field: "numero_cuota", direction: "asc" }]
        });

        return success(cuotas.map(r => {
          const cuotaState = getCuotaState(r.fields);

          return {
            id: r.id,
            numero: r.fields.numero_cuota || "",
            monto: r.fields.monto_programado || 0,
            fecha: r.fields.fecha_vencimiento || "",
            estado: cuotaState.estado,
            monto_pagado: r.fields.monto_pagado || 0,
            saldo_pendiente: cuotaState.saldo,
            dias_atraso: cuotaState.dias_atraso
          };
        }));
        }

        const ventaId = qs.cuotas_venta;

        const response = await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/CUOTAS`,
          { headers }
        );

        if (!response.ok) throw new Error("Error obteniendo cuotas");

        const data = await response.json();

        const filtradas = data.records
          .filter(r => r.fields.venta && r.fields.venta.includes(ventaId))
          .map(r => ({
            id: r.id,
            numero: r.fields.numero_cuota || "",
            monto: r.fields.monto_programado || 0,
            fecha: r.fields.fecha_vencimiento || "",
            estado: r.fields.estado_cuota || "Pendiente"
          }));

        return { statusCode: 200, body: JSON.stringify(filtradas) };
      }
if (qs.unidades === "1") {
  const auth = requireSession(event);
  if (auth.error) return auth.error;

  const allRecords = await getCachedUnitsRecords({
    force: qs.force === "1"
  });
  let reservationSnapshots = new Map();

  try {
    reservationSnapshots = await buildReservedUnitSnapshotMap(allRecords);
  } catch (error) {
    console.warn(`[unidades] No se pudo reconciliar snapshots de reserva: ${error.message}`);
  }

  const result = allRecords.map((r) => {
    try {
      const effectiveState = getEffectiveReservedUnitState(r, reservationSnapshots);
      return {
        id: r.id,
        codigo: r.fields.unidad_id || "",
        proyecto: r.fields.proyecto || "",
        fase: r.fields.Fase || "",
        manzana: r.fields.Manzana || "",
        lote: r.fields.Lote || "",
        area: r.fields.area_m2 || 0,
        precio: r.fields.precio_lista || 0,
        estado: effectiveState === "disponible"
          ? "Disponible"
          : effectiveState === "reservado"
            ? "Reservado"
            : r.fields.estado_unidad || ""
      };
    } catch (error) {
      console.warn(`[unidades] Registro omitido parcialmente (${r?.id || "sin-id"}): ${error.message}`);
      return {
        id: r?.id || "",
        codigo: r?.fields?.unidad_id || "",
        proyecto: r?.fields?.proyecto || "",
        fase: r?.fields?.Fase || "",
        manzana: r?.fields?.Manzana || "",
        lote: r?.fields?.Lote || "",
        area: r?.fields?.area_m2 || 0,
        precio: r?.fields?.precio_lista || 0,
        estado: r?.fields?.estado_unidad || ""
      };
    }
  });

  return success(result);
}
      // ==============================
      // GET UNIDADES DISPONIBLES
      // ==============================
      const auth = requireSession(event);
      if (auth.error) return auth.error;

      const formula = `{estado_unidad}="Disponible"`;

      const url = `https://api.airtable.com/v0/${BASE_ID}/UNIDADES?filterByFormula=${encodeURIComponent(formula)}`;

      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error("Error obteniendo unidades");

      const data = await response.json();

      const results = data.records.map(r => ({
        id: r.id,
        unidad_id: r.fields.unidad_id,
        proyecto: r.fields.proyecto,
        manzana: r.fields.Manzana,
        precio: r.fields.precio_lista || 0
      }));

      return { statusCode: 200, body: JSON.stringify(results) };
    }

    // ======================================================
    // ======================= PATCH =========================
    // ======================================================
if (event.httpMethod === "PATCH") {
const body = JSON.parse(event.body || "{}");
const hoyISO = new Date().toISOString().split("T")[0];

  if ([
    "editar_unidad",
    "validar",
    "rechazar",
    "negociacion",
    "aprobar_extension",
    "rechazar_extension",
    "registrar_pago",
    "convertir"
  ].includes(body.action)) {
    const auth = requireSession(event, ["admin"]);
    if (auth.error) return auth.error;

    if (body.action === "editar_unidad") {
      const unidadId = asTrimmedString(body.unidad_id, 80);
      const estado = asTrimmedString(body.estado, 50);

      if (!unidadId || !["Disponible", "Reservado", "Vendido"].includes(estado)) {
        return failure(400, "Datos de unidad invÃƒÆ’Ã‚Â¡lidos");
      }

      await airtableRequest(`UNIDADES/${unidadId}`, {
        method: "PATCH",
        body: {
          fields: {
            precio_lista: asNumber(body.precio, { min: 0 }),
            area_m2: asNumber(body.area, { min: 0 }),
            estado_unidad: estado
          }
        }
      });
      invalidateUnitsListCache();

      return success({ success: true });
    }

    if (body.action === "validar") {
      const reservaId = asTrimmedString(body.reserva_id, 80);
      if (!reservaId) {
        return failure(400, "Reserva invÃƒÆ’Ã‚Â¡lida");
      }

      const reservaData = await airtableRequest(`RESERVAS/${reservaId}`);
      const extensionRecords = await airtableList("SOLICITUDES_EXTENSION", {
        formula: buildReservaLinkFormula([reservaId])
      });
      const snapshot = getReservaSnapshot(reservaData, extensionRecords);

      if (!snapshot.canValidate) {
        return failure(409, snapshot.isExpired
          ? "La reserva ya venciÃƒÆ’Ã‚Â³ y no puede validarse"
          : "La reserva no se encuentra pendiente de confirmaciÃƒÆ’Ã‚Â³n");
      }

      await airtableRequest(`RESERVAS/${reservaId}`, {
        method: "PATCH",
        body: {
          fields: {
            estado_reserva: "Confirmada",
            fecha_validacion: hoyISO
          }
        }
      });

      return success({
        success: true,
        estado: "Confirmada",
        fecha_validacion: hoyISO
      });
    }

    if (body.action === "rechazar") {
      const reservaId = asTrimmedString(body.reserva_id, 80);
      const unidadRecordId = asTrimmedString(body.unidad_record_id, 80);
      if (!reservaId || !unidadRecordId) {
        return failure(400, "Reserva invÃƒÆ’Ã‚Â¡lida");
      }

      const reservaData = await airtableRequest(`RESERVAS/${reservaId}`);
      const extensionRecords = await airtableList("SOLICITUDES_EXTENSION", {
        formula: buildReservaLinkFormula([reservaId])
      });
      const snapshot = getReservaSnapshot(reservaData, extensionRecords);

      if (!snapshot.canReject) {
        return failure(409, "La reserva ya no admite rechazo");
      }

      await airtableRequest(`RESERVAS/${reservaId}`, {
        method: "PATCH",
        body: {
          fields: {
            estado_reserva: "Rechazada"
          }
        }
      });

      await airtableRequest(`UNIDADES/${unidadRecordId}`, {
        method: "PATCH",
        body: {
          fields: {
            estado_unidad: "Disponible"
          }
        }
      });
      invalidateUnitsListCache();

      return success({ success: true, estado: "Rechazada" });
    }

    if (body.action === "negociacion") {
      const reservaId = asTrimmedString(body.reserva_id, 80);
      const tipoVenta = asTrimmedString(body.tipo_venta, 80);
      const precioFinal = asNumber(body.precio_final, { min: 0 });
      const montoInicial = asNumber(body.monto_inicial, { min: 0 });
      const numeroCuotas = asNumber(body.numero_cuotas, { min: 0 });
      const fechaInicioPagos = asTrimmedString(body.fecha_inicio_pagos, 30);

      if (!reservaId || !tipoVenta || precioFinal <= 0) {
        return failure(400, "Datos de negociaciÃƒÆ’Ã‚Â³n invÃƒÆ’Ã‚Â¡lidos");
      }

      if (fechaInicioPagos && !isIsoDate(fechaInicioPagos)) {
        return failure(400, "La fecha de inicio de pagos no es vÃƒÆ’Ã‚Â¡lida");
      }

      const reservaData = await airtableRequest(`RESERVAS/${reservaId}`);
      const extensionRecords = await airtableList("SOLICITUDES_EXTENSION", {
        formula: buildReservaLinkFormula([reservaId])
      });
      const snapshot = getReservaSnapshot(reservaData, extensionRecords);

      if (!snapshot.canNegotiate) {
        return failure(409, snapshot.isExpired
          ? "La negociaciÃƒÆ’Ã‚Â³n ya venciÃƒÆ’Ã‚Â³ y no puede modificarse"
          : "La reserva no estÃƒÆ’Ã‚Â¡ habilitada para negociaciÃƒÆ’Ã‚Â³n");
      }

      const tipoVentaNormalizado = normalizeKey(tipoVenta);
      if (tipoVentaNormalizado.includes("financ") && numeroCuotas <= 0) {
        return failure(400, "Debes indicar el nÃƒÆ’Ã‚Âºmero de cuotas para una venta financiada");
      }

      const isExistingNegotiation = snapshot.etapa === "negociacion";
      const fechaNegociacionInicio = snapshot.fechaNegociacionInicio || hoyISO;
      const fechaNegociacionFin = snapshot.fechaNegociacionFin || addDaysToIso(hoyISO, NEGOTIATION_TERM_DAYS);
      const estadoNegociacion = snapshot.extensionUsed ? "Negociacion extendida" : "En negociacion";

      await patchRecordWithOptionalFields(
        `RESERVAS/${reservaId}`,
        {
          estado_reserva: estadoNegociacion,
          precio_final: precioFinal,
          tipo_venta: tipoVenta,
          monto_inicial: montoInicial,
          numero_cuotas: tipoVentaNormalizado.includes("financ") ? numeroCuotas : 0,
          fecha_inicio_pagos: fechaInicioPagos || "",
          observaciones_negociacion: asTrimmedString(body.observaciones, 1000),
          fecha_vigencia_fin: fechaNegociacionFin
        },
        isExistingNegotiation
          ? {}
          : { fecha_negociacion_inicio: fechaNegociacionInicio }
      );

      return success({
        success: true,
        estado: estadoNegociacion,
        fecha_negociacion_inicio: fechaNegociacionInicio,
        fecha_vigencia_fin: fechaNegociacionFin
      });
    }

    if (body.action === "aprobar_extension") {
      const extensionId = asTrimmedString(body.extension_id, 80);
      if (!extensionId) {
        return failure(400, "ExtensiÃƒÂ³n invÃƒÂ¡lida");
      }

      const extData = await airtableRequest(`SOLICITUDES_EXTENSION/${extensionId}`);
      const reservaId = asTrimmedString(extData.fields.reserva_record_id || extData.fields.reserva_id, 80);
      const montoExtra = asNumber(extData.fields.monto_adicional, { min: 0 });

      if (!reservaId) {
        return failure(400, "La extensiÃƒÂ³n no tiene una reserva asociada");
      }

      const reservaData = await airtableRequest(`RESERVAS/${reservaId}`);
      const extensionRecords = await airtableList("SOLICITUDES_EXTENSION", {
        formula: buildReservaLinkFormula([reservaId])
      });
      const snapshot = getReservaSnapshot(reservaData, extensionRecords);
      const extensionStatus = normalizeKey(extData.fields.estado_extension);

      if (extensionStatus !== "solicitud") {
        return failure(409, "La extensiÃƒÂ³n ya fue procesada");
      }

      if (snapshot.extensionUsed) {
        return failure(409, "La reserva ya utilizÃƒÂ³ su extensiÃƒÂ³n ÃƒÂºnica");
      }

      if (montoExtra < EXTENSION_REQUIRED_DEPOSIT) {
        return failure(400, `La extensiÃƒÂ³n requiere un depÃƒÂ³sito mÃƒÂ­nimo de ${EXTENSION_REQUIRED_DEPOSIT}`);
      }

      if (!snapshot.canApproveExtension || !snapshot.latestPendingExtension || snapshot.latestPendingExtension.id !== extensionId) {
        return failure(409, "La reserva no cumple las condiciones para aprobar una extensiÃƒÂ³n");
      }

      const montoActual = asNumber(reservaData.fields.monto_reserva, { min: 0 });
      const nuevaFecha = snapshot.fechaNegociacionFin
        ? addDaysToIso(snapshot.fechaNegociacionFin, NEGOTIATION_EXTENSION_DAYS)
        : "";

      if (!nuevaFecha) {
        return failure(409, "La reserva no tiene una vigencia de negociaciÃƒÆ’Ã‚Â³n valida para extender");
      }

      await airtableRequest(`RESERVAS/${reservaId}`, {
        method: "PATCH",
        body: {
          fields: {
            estado_reserva: "Negociacion extendida",
            monto_reserva: montoActual + montoExtra,
            fecha_vigencia_fin: nuevaFecha
          }
        }
      });

      await airtableRequest(`SOLICITUDES_EXTENSION/${extensionId}`, {
        method: "PATCH",
        body: {
          fields: {
            estado_extension: "Aprobada"
          }
        }
      });

      const siblingPendingRequests = extensionRecords.filter((record) =>
        record.id !== extensionId && normalizeKey(record.fields.estado_extension) === "solicitud"
      );

      if (siblingPendingRequests.length) {
        await Promise.allSettled(siblingPendingRequests.map((record) =>
          airtableRequest(`SOLICITUDES_EXTENSION/${record.id}`, {
            method: "PATCH",
            body: {
              fields: {
                estado_extension: "Rechazada"
              }
            }
          })
        ));
      }

      return success({
        success: true,
        estado: "Negociacion extendida",
        fecha_vigencia_fin: nuevaFecha,
        deposito_aprobado: montoExtra
      });
    }

    if (body.action === "rechazar_extension") {
      const extensionId = asTrimmedString(body.extension_id, 80);
      if (!extensionId) {
        return failure(400, "ExtensiÃ³n invÃ¡lida");
      }

      const extData = await airtableRequest(`SOLICITUDES_EXTENSION/${extensionId}`);
      if (normalizeKey(extData.fields.estado_extension) !== "solicitud") {
        return failure(409, "La extensiÃ³n ya fue procesada");
      }

      await airtableRequest(`SOLICITUDES_EXTENSION/${extensionId}`, {
        method: "PATCH",
        body: {
          fields: {
            estado_extension: "Rechazada"
          }
        }
      });

      return success({ success: true });
    }

    if (body.action === "convertir") {
      const reservaId = asTrimmedString(body.reserva_id, 80);
      if (!reservaId) {
        return failure(400, "Reserva inválida");
      }

      const reservaData = await airtableRequest(`RESERVAS/${reservaId}`);
      const reservaFields = reservaData.fields || {};
      const extensionRecords = await airtableList("SOLICITUDES_EXTENSION", {
        formula: buildReservaLinkFormula([reservaId])
      });
      const reservaSnapshot = getReservaSnapshot(reservaData, extensionRecords);

      if (!reservaSnapshot.canConvert) {
        return failure(409, reservaSnapshot.isExpired
          ? "La vigencia de la reserva ya venció y no puede convertirse"
          : "La reserva no está lista para convertirse a venta");
      }

      if (Array.isArray(reservaFields.venta) && reservaFields.venta.length > 0) {
        return failure(409, "Esta reserva ya fue convertida a venta");
      }

      const unidadId = Array.isArray(reservaFields.unidad) ? reservaFields.unidad[0] : "";
      if (!unidadId) {
        return failure(400, "La reserva no tiene una unidad asociada");
      }

      const precioBase = asNumber(reservaFields.precio_final || reservaFields.precio_lista_unidad, { min: 0 });
      if (precioBase <= 0) {
        return failure(400, "La reserva necesita un precio final válido antes de convertirse");
      }

      const ventaDraftFields = {
        cliente: reservaFields.cliente || "",
        unidad: [unidadId],
        reserva: [reservaId],
        precio_base: precioBase,
        monto_reserva: asNumber(reservaFields.monto_reserva, { min: 0 }),
        monto_inicial: asNumber(reservaFields.monto_inicial, { min: 0 }),
        tipo_venta: reservaFields.tipo_venta || "Reserva",
        fecha_venta: hoyISO,
        agente: reservaFields.agente || "",
        estado_venta: "Pendiente"
      };

      const ventaSnapshot = getVentaSnapshot(ventaDraftFields, []);
      ventaDraftFields.estado_venta = ventaSnapshot.estadoVenta;

      const ventaData = await createRecordWithOptionalAudit(
        "VENTAS",
        ventaDraftFields,
        {
          creado_por: auth.session.nombre || "",
          creado_por_rol: auth.session.rol || "",
          contexto_accion: "conversion_reserva",
          fecha_registro_sistema: new Date().toISOString()
        }
      );

      if (!ventaData.id) {
        return failure(500, "No se pudo crear la venta");
      }

      await airtableRequest(`RESERVAS/${reservaId}`, {
        method: "PATCH",
        body: {
          fields: {
            estado_reserva: "Convertida",
            venta: [ventaData.id]
          }
        }
      });

      await airtableRequest(`UNIDADES/${unidadId}`, {
        method: "PATCH",
        body: {
          fields: {
            estado_unidad: "Vendido"
          }
        }
      });
      invalidateUnitsListCache();

      return success({
        success: true,
        venta_id: ventaData.id,
        estado_venta: ventaDraftFields.estado_venta
      });
    }

    if (body.action === "registrar_pago") {
      const ventaId = asTrimmedString(body.venta_id, 80);
      const cuotaId = asTrimmedString(body.cuota_id, 80);
      const monto = asNumber(body.monto, { min: 0 });
      const metodo = asTrimmedString(body.metodo, 80);
      const fechaPago = asTrimmedString(body.fecha_pago, 30);
      const observacion = asTrimmedString(body.observacion, 500);

      if (!ventaId || !monto || !metodo || !fechaPago || !isIsoDate(fechaPago)) {
        return failure(400, "Datos de pago invÃƒÆ’Ã‚Â¡lidos");
      }

      const ventaData = await airtableRequest(`VENTAS/${ventaId}`);
      const cuotaRecords = await airtableList("CUOTAS", {
        formula: `FIND("${escapeFormulaValue(ventaId)}", ARRAYJOIN({venta})) > 0`,
        sort: [{ field: "numero_cuota", direction: "asc" }]
      });
      const ventaSnapshot = getVentaSnapshot(ventaData.fields, cuotaRecords);

      if (isVentaLockedStatus(ventaSnapshot.estadoVenta)) {
        return failure(409, `La venta se encuentra ${ventaSnapshot.estadoVenta.toLowerCase()} y no admite nuevos pagos`);
      }

      const cuotas = cuotaId
        ? [await airtableRequest(`CUOTAS/${cuotaId}`)]
        : cuotaRecords;

      if (!cuotas.length) {
        return failure(404, "No se encontraron cuotas para la venta");
      }

      const cuotasVenta = cuotas.filter((cuota) =>
        !cuotaId || (Array.isArray(cuota.fields.venta) && cuota.fields.venta.includes(ventaId))
      );

      if (!cuotasVenta.length) {
        return failure(400, "La cuota indicada no pertenece a la venta");
      }

      const saldoDisponible = cuotasVenta.reduce((sum, cuota) => {
        const programado = asNumber(cuota.fields.monto_programado, { min: 0 });
        const pagado = asNumber(cuota.fields.monto_pagado, { min: 0 });
        return sum + Math.max(0, programado - pagado);
      }, 0);

      if (saldoDisponible <= 0) {
        return failure(400, "La venta no tiene saldo pendiente en cuotas");
      }

      if (monto > saldoDisponible) {
        return failure(400, "El monto excede el saldo pendiente disponible");
      }

      let montoRestante = monto;
      const aplicaciones = [];

      for (const cuota of cuotasVenta) {
        if (montoRestante <= 0) break;

        const pagadoActual = asNumber(cuota.fields.monto_pagado, { min: 0 });
        const programado = asNumber(cuota.fields.monto_programado, { min: 0 });
        const saldoCuota = Math.max(0, programado - pagadoActual);

        if (saldoCuota <= 0) continue;

        const aplicar = cuotaId ? montoRestante : Math.min(montoRestante, saldoCuota);

        if (aplicar > saldoCuota) {
          return failure(400, "El monto excede el saldo pendiente de la cuota seleccionada");
        }

        const nuevoPagado = pagadoActual + aplicar;
        const nuevoEstado = nuevoPagado >= programado
          ? "Pagada"
          : nuevoPagado > 0
            ? "Parcial"
            : "Pendiente";

        await airtableRequest(`CUOTAS/${cuota.id}`, {
          method: "PATCH",
          body: {
            fields: {
              monto_pagado: nuevoPagado,
              estado_cuota: nuevoEstado
            }
          }
        });

        await createRecordWithOptionalAudit(
          "TRANSACCIONES",
          {
            venta: [ventaId],
            cuota: [cuota.id],
            monto: aplicar,
            metodo,
            fecha_pago: fechaPago,
            observacion: [observacion, buildAuditText(auth.session, "registro_pago", `cuota ${cuota.id}`)]
              .filter(Boolean)
              .join(" | ")
          },
          {
            registrado_por: auth.session.nombre || "",
            registrado_por_rol: auth.session.rol || "",
            contexto_accion: cuotaId ? "pago_cuota_dirigido" : "pago_distribuido",
            fecha_registro_sistema: new Date().toISOString()
          }
        );

        aplicaciones.push({ cuota_id: cuota.id, monto: aplicar });
        montoRestante -= aplicar;
      }

      if (montoRestante > 0) {
        return failure(400, "No se pudo distribuir completamente el pago");
      }

      const syncedVenta = await syncVentaFinancialState(ventaId);

      return success({
        success: true,
        venta_id: ventaId,
        aplicaciones,
        saldo_restante: syncedVenta.snapshot.saldoRestante,
        estado_venta: syncedVenta.snapshot.estadoVenta
      });
    }
  }
  const authHeader = event.headers.authorization;
  if (!authHeader) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "No autorizado" })
    };
  }

  const token = authHeader.split(" ")[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "Token invÃƒÆ’Ã‚Â¡lido" })
    };
  }

  const action = body.action;

  // ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ‚Â´ Acciones exclusivas admin
  const adminActions = [
    "validar",
    "rechazar",
    "convertir",
    "negociacion",
    "registrar_pago",
    "crear_cuota"
  ];

  if (adminActions.includes(action) && decoded.rol !== "admin") {
    return {
      statusCode: 403,
      body: JSON.stringify({ error: "Acceso restringido a administrador" })
    };
  }
    
if (body.action === "editar_unidad") {

  await fetch(
    `https://api.airtable.com/v0/${BASE_ID}/UNIDADES/${body.unidad_id}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        fields: {
          precio_lista: Number(body.precio),
          area_m2: Number(body.area),
          estado_unidad: body.estado
        }
      })
    }
  );

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true })
  };

}
<<<<<<< HEAD
  // 🔓 Aquí sigue tu lógica normal de PATCH
// ==============================
// APROBAR EXTENSION
// ==============================

=======

  // ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ¢â‚¬Å“ AquÃƒÆ’Ã‚Â­ sigue tu lÃƒÆ’Ã‚Â³gica normal de PATCH
// ==============================
// APROBAR EXTENSION
// ==============================

>>>>>>> 5cc9890 (deploy)
if (body.action === "aprobar_extension") {

  const extensionId = body.extension_id;

  const extRes = await fetch(
    `https://api.airtable.com/v0/${BASE_ID}/SOLICITUDES_EXTENSION/${extensionId}`,
    { headers }
  );

  const extData = await extRes.json();

  const reservaId = extData.fields.reserva_record_id;
  const montoExtra = extData.fields.monto_adicional || 0;

  const reservaRes = await fetch(
    `https://api.airtable.com/v0/${BASE_ID}/RESERVAS/${reservaId}`,
    { headers }
  );

  const reservaData = await reservaRes.json();

  const montoActual = reservaData.fields.monto_reserva || 0;

  const nuevoMonto = montoActual + montoExtra;

  const fechaFin = new Date(reservaData.fields.fecha_vigencia_fin);
  fechaFin.setDate(fechaFin.getDate() + 15);
  const nuevaFecha = fechaFin.toISOString().split("T")[0];

  await fetch(
    `https://api.airtable.com/v0/${BASE_ID}/RESERVAS/${reservaId}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        fields: {
          monto_reserva: nuevoMonto,
          fecha_vigencia_fin: nuevaFecha
        }
      })
    }
  );

  await fetch(
    `https://api.airtable.com/v0/${BASE_ID}/SOLICITUDES_EXTENSION/${extensionId}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        fields: {
          estado_extension: "Aprobada"
        }
      })
    }
  );

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true })
  };
}
// ==============================
// RECHAZAR EXTENSION
// ==============================

if (body.action === "rechazar_extension") {

  await fetch(
    `https://api.airtable.com/v0/${BASE_ID}/SOLICITUDES_EXTENSION/${body.extension_id}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        fields: {
          estado_extension: "Rechazada"
        }
      })
    }
  );

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true })
  };
}
<<<<<<< HEAD
      // NEGOCIACIÓN
=======
      // NEGOCIACIÃƒÆ’Ã¢â‚¬Å“N
>>>>>>> 5cc9890 (deploy)
      if (body.action === "negociacion") {

        await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/RESERVAS/${body.reserva_id}`,
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              fields: {
                precio_final: Number(body.precio_final || 0),
                tipo_venta: body.tipo_venta,
                monto_inicial: Number(body.monto_inicial || 0),
                numero_cuotas: Number(body.numero_cuotas || 0),
                fecha_inicio_pagos: body.fecha_inicio_pagos || null,
                observaciones_negociacion: body.observaciones || ""
              }
            })
          }
        );

        return { statusCode: 200, body: JSON.stringify({ success: true }) };
      }

      // VALIDAR
      if (body.action === "validar") {

        // obtener reserva
const reservaRes = await fetch(
  `https://api.airtable.com/v0/${BASE_ID}/RESERVAS/${body.reserva_id}`,
  { headers }
);

const reservaData = await reservaRes.json();

const monto = reservaData.fields.monto_reserva || 0;

let dias = 15;

if (monto >= 1000) {
  dias = 30;
}

const fechaFin = new Date();
fechaFin.setDate(fechaFin.getDate() + dias);
        const fechaFinISO = fechaFin.toISOString().split("T")[0];

        await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/RESERVAS/${body.reserva_id}`,
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              fields: {
                estado_reserva: "Confirmada",
                fecha_validacion: hoyISO,
                fecha_vigencia_fin: fechaFinISO
              }
            })
          }
        );

        return { statusCode: 200, body: JSON.stringify({ success: true }) };
      }

      // RECHAZAR
      if (body.action === "rechazar") {

        await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/RESERVAS/${body.reserva_id}`,
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              fields: { estado_reserva: "Rechazada" }
            })
          }
        );

        await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/UNIDADES/${body.unidad_record_id}`,
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              fields: { estado_unidad: "Disponible" }
            })
          }
        );

        return { statusCode: 200, body: JSON.stringify({ success: true }) };
      }

      // CONVERTIR (versiÃƒÆ’Ã‚Â³n limpia y segura)
      if (body.action === "convertir") {

        const reservaRes = await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/RESERVAS/${body.reserva_id}`,
          { headers }
        );

        const reservaData = await reservaRes.json();

        if (!reservaData.id) {
          return { statusCode: 400, body: JSON.stringify({ error: "Reserva no encontrada" }) };
        }

        if (reservaData.fields.estado_reserva !== "Confirmada") {
          return { statusCode: 400, body: JSON.stringify({ error: "La reserva no estÃƒÆ’Ã‚Â¡ confirmada" }) };
        }

        if (reservaData.fields.venta && reservaData.fields.venta.length > 0) {
          return { statusCode: 400, body: JSON.stringify({ error: "Esta reserva ya fue convertida." }) };
        }

        const unidadId = reservaData.fields.unidad[0];

        const ventaRes = await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/VENTAS`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              fields: {
                cliente: reservaData.fields.cliente,
                unidad: [unidadId],
                reserva: [body.reserva_id],
                precio_base: reservaData.fields.precio_final,
                monto_reserva: reservaData.fields.monto_reserva,
                monto_inicial: reservaData.fields.monto_inicial || 0,
                tipo_venta: reservaData.fields.tipo_venta,
                fecha_venta: hoyISO,
                estado_venta: "Activa"
              }
            })
          }
        );

        const ventaData = await ventaRes.json();

        await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/RESERVAS/${body.reserva_id}`,
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              fields: {
                estado_reserva: "Convertida",
                venta: [ventaData.id]
              }
            })
          }
        );

        await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/UNIDADES/${unidadId}`,
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              fields: { estado_unidad: "Vendido" }
            })
          }
        );

        return {
          statusCode: 200,
          body: JSON.stringify({ success: true, venta_id: ventaData.id })
        };
      }

    // REGISTRAR PAGO (CORREGIDO Y SEGURO)
    if (body.action === "registrar_pago") {

        const { venta_id, monto, metodo, fecha_pago, observacion } = body;
        let montoRestante = Number(monto);

        if (!venta_id || !montoRestante || montoRestante <= 0) {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: "Datos de pago invÃƒÆ’Ã‚Â¡lidos" })
          };
        }

        // 1ÃƒÂ¯Ã‚Â¸Ã‚ÂÃƒÂ¢Ã†â€™Ã‚Â£ Obtener todas las cuotas y filtrar en JS
        const cuotasRes = await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/CUOTAS`,
          { headers }
        );

        if (!cuotasRes.ok) throw new Error("Error obteniendo cuotas");

        const cuotasData = await cuotasRes.json();

        const cuotas = cuotasData.records
          .filter(r => r.fields.venta && r.fields.venta.includes(venta_id))
          .sort((a, b) =>
            (a.fields.numero_cuota || 0) - (b.fields.numero_cuota || 0)
          );

        for (const cuota of cuotas) {

          if (montoRestante <= 0) break;

          const pagadoActual = cuota.fields.monto_pagado || 0;
          const programado = cuota.fields.monto_programado || 0;
          const saldoCuota = programado - pagadoActual;

          if (saldoCuota <= 0) continue;

          const aplicar = Math.min(montoRestante, saldoCuota);
          const nuevoPagado = pagadoActual + aplicar;

          let nuevoEstado = "Pendiente";
          if (nuevoPagado === 0) nuevoEstado = "Pendiente";
          else if (nuevoPagado < programado) nuevoEstado = "Parcial";
          else nuevoEstado = "Pagada";

          // Actualizar cuota
          await fetch(
            `https://api.airtable.com/v0/${BASE_ID}/CUOTAS/${cuota.id}`,
            {
              method: "PATCH",
              headers,
              body: JSON.stringify({
                fields: {
                  monto_pagado: nuevoPagado,
                  estado_cuota: nuevoEstado
                }
              })
            }
          );

          // Crear transacciÃƒÆ’Ã‚Â³n
          await fetch(
            `https://api.airtable.com/v0/${BASE_ID}/TRANSACCIONES`,
            {
              method: "POST",
              headers,
              body: JSON.stringify({
                fields: {
                  venta: [venta_id],
                  cuota: [cuota.id],
                  monto: aplicar,
                  metodo,
                  fecha_pago,
                  observacion: observacion || ""
                }
              })
            }
          );

          montoRestante -= aplicar;
        }

        // 2ÃƒÂ¯Ã‚Â¸Ã‚ÂÃƒÂ¢Ã†â€™Ã‚Â£ Recalcular saldo SOLO con cuotas de esta venta
        const cuotasFinalRes = await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/CUOTAS`,
          { headers }
        );

        const cuotasFinalData = await cuotasFinalRes.json();

        const cuotasVenta = cuotasFinalData.records.filter(
          r => r.fields.venta && r.fields.venta.includes(venta_id)
        );

        const totalPagadoCuotas = cuotasVenta.reduce(
          (sum, c) => sum + (c.fields.monto_pagado || 0),
          0
        );

        const ventaRes = await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/VENTAS/${venta_id}`,
          { headers }
        );

        const ventaData = await ventaRes.json();
        const precio = ventaData.fields.precio_base || 0;
        const reserva = ventaData.fields.monto_reserva || 0;
        const inicial = ventaData.fields.monto_inicial || 0;

        const saldoVenta = precio - reserva - inicial - totalPagadoCuotas;

        const nuevoEstadoVenta = saldoVenta <= 0 ? "Pagada" : "Activa";

        await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/VENTAS/${venta_id}`,
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              fields: {
                estado_venta: nuevoEstadoVenta
              }
            })
          }
        );

        return {
          statusCode: 200,
          body: JSON.stringify({ success: true })
        };
      }

      return {
        statusCode: 400,
        body: JSON.stringify({ error: "AcciÃƒÆ’Ã‚Â³n PATCH invÃƒÆ’Ã‚Â¡lida" })
      };
    }

    // ======================================================
    // ======================= POST ==========================
    // ======================================================

    if (event.httpMethod === "POST") {

      const authHeader = event.headers.authorization;

if (!authHeader) {
  return {
    statusCode: 401,
    body: JSON.stringify({ error: "No autorizado" })
  };
}

const token = authHeader.split(" ")[1];

let decoded;

try {
  decoded = jwt.verify(token, JWT_SECRET);
} catch (err) {
  return {
    statusCode: 401,
    body: JSON.stringify({ error: "Token invÃƒÆ’Ã‚Â¡lido o expirado" })
  };
}

const agenteCodigo = decoded.codigo;
const agenteNombre = decoded.nombre;
      const body = JSON.parse(event.body || "{}");

      if (!body.action) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Action requerida" })
        };
      }

      if (["crear_cuota", "obtener_reserva", "emitir_boleta"].includes(body.action)) {
        const adminAuth = requireSession(event, ["admin"]);
        if (adminAuth.error) return adminAuth.error;

        if (body.action === "crear_cuota") {
          const ventaId = asTrimmedString(body.venta_id, 80);
          const numero = asNumber(body.numero, { min: 1 });
          const monto = asNumber(body.monto, { min: 0 });
          const fecha = asTrimmedString(body.fecha, 30);

          if (!ventaId || !numero || !monto || !fecha || !isIsoDate(fecha)) {
            return failure(400, "Datos de cuota invÃƒÆ’Ã‚Â¡lidos");
          }

          const ventaData = await airtableRequest(`VENTAS/${ventaId}`);
          const cuotasExistentes = await airtableList("CUOTAS", {
            formula: `FIND("${escapeFormulaValue(ventaId)}", ARRAYJOIN({venta})) > 0`,
            sort: [{ field: "numero_cuota", direction: "asc" }]
          });
          const snapshot = getVentaSnapshot(ventaData.fields, cuotasExistentes);

          if (isVentaLockedStatus(snapshot.estadoVenta)) {
            return failure(409, `La venta se encuentra ${snapshot.estadoVenta.toLowerCase()} y no admite nuevas cuotas`);
          }

          if (cuotasExistentes.some((cuota) => asNumber(cuota.fields.numero_cuota, { min: 0 }) === numero)) {
            return failure(409, "Ya existe una cuota con ese nÃƒÆ’Ã‚Âºmero para esta venta");
          }

          const saldoFinanciable = Math.max(0, snapshot.totalFinanciado - snapshot.totalProgramadoCuotas);
          if (monto > saldoFinanciable) {
            return failure(400, "El monto de la cuota excede el saldo financiable disponible");
          }

          const data = await createRecordWithOptionalAudit(
            "CUOTAS",
            {
              venta: [ventaId],
              numero_cuota: numero,
              monto_programado: monto,
              fecha_vencimiento: fecha,
              estado_cuota: getCuotaState({ monto_programado: monto, monto_pagado: 0, fecha_vencimiento: fecha }).estado
            },
            {
              creado_por: adminAuth.session.nombre || "",
              creado_por_rol: adminAuth.session.rol || "",
              contexto_accion: "crear_cuota",
              fecha_registro_sistema: new Date().toISOString()
            }
          );

          if (!data.id) {
            return failure(500, "No se pudo crear cuota");
          }

          const syncedVenta = await syncVentaFinancialState(ventaId);

          return success({
            success: true,
            venta_id: ventaId,
            saldo_restante: syncedVenta.snapshot.saldoRestante,
            estado_venta: syncedVenta.snapshot.estadoVenta
          });
        }

        if (body.action === "obtener_reserva") {
          const reservaId = asTrimmedString(body.id, 80);
          if (!reservaId) {
            return failure(400, "Reserva invÃƒÆ’Ã‚Â¡lida");
          }

          const data = await airtableRequest(`RESERVAS/${reservaId}`);

          return success({
            cliente: data.fields.cliente || "",
            dni: data.fields.dni_cliente || "",
            monto_reserva: data.fields.monto_reserva || 0
          });
        }

        if (body.action === "emitir_boleta") {
          const reservaId = asTrimmedString(body.reservaId, 80);
          const cliente = asTrimmedString(body.cliente, 200);
          const dni = asTrimmedString(body.dni, 20);
          const descripcion = asTrimmedString(body.descripcion, 250);
          const montoNumero = asNumber(body.monto, { min: 0 });

          if (!reservaId || !cliente || !dni || !descripcion || !montoNumero) {
            return failure(400, "Datos de boleta invÃƒÆ’Ã‚Â¡lidos");
          }

          const response = await fetch(NUBEFACT_URL,{
            method:"POST",
            headers:{
              "Content-Type":"application/json",
              Authorization:`Token ${NUBEFACT_TOKEN}`
            },
            body: JSON.stringify({
              operacion:"generar_comprobante",
              tipo_de_comprobante:2,
              serie:"BBB1",
              numero:"",
              sunat_transaction:1,
              cliente_tipo_de_documento:1,
              cliente_numero_de_documento:dni,
              cliente_denominacion:cliente,
              cliente_direccion:"CUSCO",
              fecha_de_emision:new Date().toISOString().split("T")[0],
              moneda:1,
              porcentaje_de_igv:0,
              total_gravada:0,
              total_exonerada:montoNumero,
              total_inafecta:0,
              total_igv:0,
              total:montoNumero,
              detraccion:false,
              items:[
                {
                  unidad_de_medida:"NIU",
                  codigo:"001",
                  descripcion,
                  cantidad:1,
                  valor_unitario:montoNumero,
                  precio_unitario:montoNumero,
                  subtotal:montoNumero,
                  tipo_de_igv:"20",
                  igv:0,
                  total:montoNumero,
                  valor_total:montoNumero
                }
              ]
            })
          });

          const nubefact = await response.json();
          if (!response.ok || !nubefact) {
            return failure(502, "No se pudo emitir la boleta");
          }

          await airtableRequest(`RESERVAS/${reservaId}`, {
            method:"PATCH",
            body: {
              fields:{
                boleta_emitida: true,
                serie_boleta: nubefact.serie,
                numero_boleta: nubefact.numero
              }
            }
          });

          return success({
            serie:nubefact.serie,
            numero:nubefact.numero,
            pdf:nubefact.enlace_del_pdf,
            xml:nubefact.enlace_del_xml,
            cdr:nubefact.enlace_del_cdr
          });
        }
      }

      // ==============================
      // CREAR RESERVA
      // ==============================
      if (body.action === "crear_reserva") {
        const unidadRecordId = asTrimmedString(body.unidad_record_id, 80);
        const clienteActual = asTrimmedString(body.cliente_actual, 200);
        const dniCliente = asTrimmedString(body.dni_cliente, 20);
        const telefonoCliente = asTrimmedString(body.telefono_cliente, 20);
        const montoReserva = asNumber(body.monto_reserva, { min: 0 });
        const descuentoSolicitado = asNumber(body.descuento_solicitado, { min: 0 });
        const sobreprecio = asNumber(body.sobreprecio, { min: 0 });
        const motivoDescuento = asTrimmedString(body.motivo_descuento, 500);

        if (!unidadRecordId || !clienteActual || dniCliente.length < 6 || telefonoCliente.length < 6 || montoReserva <= 0) {
          return failure(400, "Datos de reserva invÃƒÆ’Ã‚Â¡lidos");
        }

        const hoy = new Date().toISOString().split("T")[0];

        // Consultar estado real de unidad y reservas activas
        const unidadCheck = await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/UNIDADES/${unidadRecordId}`,
          { headers }
        );

        const unidadData = await unidadCheck.json();
        const rawUnitState = normalizeKey(unidadData.fields?.estado_unidad);

        // Verificar reserva activa o extensión pendiente
        const reservaCheckData = await airtableList("RESERVAS", {
          formula: `FIND("${escapeFormulaValue(unidadRecordId)}", ARRAYJOIN({unidad})) > 0`
        });
        const reservaIds = reservaCheckData.map((record) => record.id).filter(Boolean);
        const extensionFormula = reservaIds.length
          ? `OR(${reservaIds.map((id) => `{reserva_record_id}="${escapeFormulaValue(id)}"`).join(",")},${reservaIds.map((id) => `{reserva_id}="${escapeFormulaValue(id)}"`).join(",")})`
          : "";
        const extensionRecords = reservaIds.length
          ? await airtableList("SOLICITUDES_EXTENSION", { formula: extensionFormula })
          : [];
        const extensionsByReserva = groupExtensionsByReserva(extensionRecords);
        const hasBlockingReservation = reservaCheckData.some((record) => {
          const snapshot = getReservaSnapshot(record, extensionsByReserva.get(record.id) || []);
          return isReservationBlockingUnit(snapshot);
        });

        if (!unidadData.fields || rawUnitState === "vendido" || (rawUnitState !== "disponible" && hasBlockingReservation)) {
          return {
            statusCode: 400,
            body: JSON.stringify({
              error: "La unidad ya no estÃƒÆ’Ã‚Â¡ disponible."
            })
          };
        }

        if (hasBlockingReservation) {
          return {
            statusCode: 400,
            body: JSON.stringify({
              error: "Ya existe una reserva activa para esta unidad."
            })
          };
        }

        if (rawUnitState === "reservado") {
          await airtableRequest(`UNIDADES/${unidadRecordId}`, {
            method: "PATCH",
            body: {
              fields: { estado_unidad: "Disponible" }
            }
          });
          invalidateUnitsListCache();
        }

        // Crear reserva
        const reservaRes = await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/RESERVAS`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              fields: {
                unidad: [unidadRecordId],
                cliente: clienteActual,
                dni_cliente: dniCliente,
                telefono_cliente: telefonoCliente,
                agente: agenteNombre,
<<<<<<< HEAD
                monto_reserva: Number(body.monto_reserva || 0),
                descuento_solicitado: Number(body.descuento_solicitado || 0),
                sobreprecio: body.sobreprecio,
                motivo_descuento: body.motivo_descuento,
=======
                monto_reserva: montoReserva,
                descuento_solicitado: descuentoSolicitado,
                sobreprecio,
                motivo_descuento: motivoDescuento,
>>>>>>> 5cc9890 (deploy)
                estado_reserva: "Solicitud",
                fecha_inicio: hoy
              }
            })
          }
        );

        const reservaData = await reservaRes.json();
        if (!reservaData.id) throw new Error("Error creando reserva");

        // Bloquear unidad
        await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/UNIDADES/${unidadRecordId}`,
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              fields: { estado_unidad: "Reservado" }
            })
          }
        );
        invalidateUnitsListCache();

        return {
          statusCode: 200,
          body: JSON.stringify({
            success: true,
            reserva_id: reservaData.id
          })
        };
      }

      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Action POST invÃƒÆ’Ã‚Â¡lida" })
      };
    }

    return { statusCode: 405, body: "Method not allowed" };

  } catch (error) {
    if (error?.status === 429) {
      return failure(429, "Airtable esta recibiendo demasiadas solicitudes. Intenta nuevamente en unos segundos.", {
        code: "airtable_rate_limited"
      });
    }

    return {
      statusCode: error?.status || 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

