(function () {
  const API_ENDPOINT = "/.netlify/functions/airtable";
  const TOKEN_KEY = "auth_token";
  const HTML_ESCAPE_MAP = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  };

  let unidadesPromise = null;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char]);
  }

  function sanitizeUrl(value) {
    if (!value) return "";
    try {
      const url = new URL(String(value), window.location.origin);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch (error) {
      return "";
    }
  }

  function isDebugApiEnabled() {
    try {
      return window.location.hostname === "localhost" || localStorage.getItem("debug_admin_api") === "1";
    } catch (error) {
      return false;
    }
  }

  function safeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function formatCurrency(value, currency = "PEN") {
    return new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency
    }).format(safeNumber(value));
  }

  function buildAbsoluteUrl(path = "/") {
    return new URL(String(path), window.location.origin).toString();
  }

  function buildQrUrl(data, size = 180) {
    const resolvedSize = Math.max(96, safeNumber(size, 180));
    return `https://api.qrserver.com/v1/create-qr-code/?size=${resolvedSize}x${resolvedSize}&margin=0&data=${encodeURIComponent(String(data || ""))}`;
  }

  function countEncodingArtifacts(value) {
    return (String(value || "").match(/[\u00C2\u00C3\u0192\u00E2\u20AC\u0153\uFFFD]/g) || []).length;
  }

  function countReplacementChars(value) {
    return (String(value || "").match(/\uFFFD/g) || []).length;
  }

  function applyEncodingReplacements(value) {
    return String(value ?? "")
      .replace(/\u00C3\u0192/g, "\u00C3")
      .replace(/\u00C2/g, "")
      .replace(/\u00C3\u00A1/g, "\u00E1")
      .replace(/\u00C3\u00A9/g, "\u00E9")
      .replace(/\u00C3\u00AD/g, "\u00ED")
      .replace(/\u00C3\u00B3/g, "\u00F3")
      .replace(/\u00C3\u00BA/g, "\u00FA")
      .replace(/\u00C3\u0081/g, "\u00C1")
      .replace(/\u00C3\u0089/g, "\u00C9")
      .replace(/\u00C3\u008D/g, "\u00CD")
      .replace(/\u00C3\u0093/g, "\u00D3")
      .replace(/\u00C3\u009A/g, "\u00DA")
      .replace(/\u00C3\u00B1/g, "\u00F1")
      .replace(/\u00C3\u0091/g, "\u00D1")
      .replace(/\u00E2\u20AC\u02DC/g, "\u2018")
      .replace(/\u00E2\u20AC\u2122/g, "\u2019")
      .replace(/\u00E2\u20AC\u0153/g, "\u201C")
      .replace(/\u00E2\u20AC\u009D/g, "\u201D")
      .replace(/\u00E2\u20AC\u00A6/g, "\u2026")
      .replace(/\u00E2\u20AC\u201C/g, "\u2013")
      .replace(/\u00E2\u20AC\u201D/g, "\u2014");
  }

  function decodeLatin1ToUtf8(value) {
    const text = String(value ?? "");
    if (!text) return text;

    try {
      const encoded = Array.from(text, (char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`).join("");
      return decodeURIComponent(encoded);
    } catch (error) {
      return "";
    }
  }

  function shouldUseDecodedText(current, candidate) {
    if (!candidate || candidate === current) {
      return false;
    }

    const currentScore = countEncodingArtifacts(current) + (countReplacementChars(current) * 4);
    const candidateScore = countEncodingArtifacts(candidate) + (countReplacementChars(candidate) * 4);
    return candidateScore <= currentScore;
  }

  function repairTextEncoding(value) {
    return repairTextEncodingNormalized(value);
  }

  function repairTextEncodingNormalized(value) {
    let text = String(value ?? "");
    if (!text || !/[\u00C2\u00C3\u0192\u00E2\u20AC]/.test(text)) {
      return text;
    }

    text = applyEncodingReplacements(text);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const decoded = applyEncodingReplacements(decodeLatin1ToUtf8(text));
      if (!shouldUseDecodedText(text, decoded)) {
        break;
      }
      text = decoded;
    }

    return applyEncodingReplacements(text);
  }
  function repairPayloadEncoding(value, depth = 0) {
    if (depth > 12 || value === null || value === undefined) {
      return value;
    }

    if (typeof value === "string") {
      return repairTextEncodingNormalized(value);
    }

    if (Array.isArray(value)) {
      return value.map((entry) => repairPayloadEncoding(entry, depth + 1));
    }

    if (typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, repairPayloadEncoding(entry, depth + 1)])
      );
    }

    return value;
  }

  function getReservationStatusMeta(status) {
    const normalized = String(status || "").trim().toLowerCase();
    const map = {
      solicitud: {
        label: "Pendiente de confirmaciÃƒÆ’Ã‚Â³n",
        tone: "pending",
        description: "Reserva creada y esperando validaciÃƒÆ’Ã‚Â³n comercial"
      },
      pendiente: {
        label: "Pendiente de confirmaciÃƒÆ’Ã‚Â³n",
        tone: "pending",
        description: "Reserva creada y esperando validaciÃƒÆ’Ã‚Â³n comercial"
      },
      "pendiente de confirmaciÃƒÆ’Ã‚Â³n": {
        label: "Pendiente de confirmaciÃƒÆ’Ã‚Â³n",
        tone: "pending",
        description: "Reserva creada y esperando validaciÃƒÆ’Ã‚Â³n comercial"
      },
      "pendiente de confirmacion": {
        label: "Pendiente de confirmaciÃƒÆ’Ã‚Â³n",
        tone: "pending",
        description: "Reserva creada y esperando validaciÃƒÆ’Ã‚Â³n comercial"
      },
      confirmada: {
        label: "Confirmada",
        tone: "confirmed",
        description: "Reserva validada y lista para negociaciÃƒÆ’Ã‚Â³n o conversiÃƒÆ’Ã‚Â³n"
      },
      reservada: {
        label: "Reservada",
        tone: "confirmed",
        description: "Reserva tomada y en seguimiento comercial"
      },
      "en negociacion": {
        label: "En negociaciÃƒÆ’Ã‚Â³n",
        tone: "active",
        description: "NegociaciÃƒÆ’Ã‚Â³n comercial activa dentro de vigencia"
      },
      "negociacion extendida": {
        label: "NegociaciÃƒÆ’Ã‚Â³n extendida",
        tone: "premium",
        description: "Reserva con ampliaciÃƒÆ’Ã‚Â³n comercial vigente"
      },
      rechazada: {
        label: "Rechazada",
        tone: "rejected",
        description: "OperaciÃƒÆ’Ã‚Â³n no aprobada"
      },
      vencida: {
        label: "Vencida",
        tone: "expired",
        description: "La vigencia comercial expirÃƒÆ’Ã‚Â³"
      },
      "en proceso": {
        label: "En proceso",
        tone: "active",
        description: "OperaciÃƒÆ’Ã‚Â³n en gestiÃƒÆ’Ã‚Â³n"
      },
      proceso: {
        label: "En proceso",
        tone: "active",
        description: "OperaciÃƒÆ’Ã‚Â³n en gestiÃƒÆ’Ã‚Â³n"
      },
      convertida: {
        label: "Convertida",
        tone: "premium",
        description: "Reserva ya transformada en venta"
      },
      "convertida a venta": {
        label: "Convertida",
        tone: "premium",
        description: "Reserva ya transformada en venta"
      },
      cerrada: {
        label: "Cerrada",
        tone: "premium",
        description: "OperaciÃƒÆ’Ã‚Â³n completada sin saldo pendiente"
      },
      pagada: {
        label: "Cerrada",
        tone: "premium",
        description: "OperaciÃƒÆ’Ã‚Â³n completada sin saldo pendiente"
      },
      cancelada: {
        label: "Cancelada",
        tone: "rejected",
        description: "OperaciÃƒÆ’Ã‚Â³n cancelada"
      },
      bloqueada: {
        label: "Bloqueada",
        tone: "neutral",
        description: "OperaciÃƒÆ’Ã‚Â³n bloqueada para cambios"
      },
      "con pagos": {
        label: "Con pagos",
        tone: "active",
        description: "OperaciÃƒÆ’Ã‚Â³n con cobros registrados"
      },
      morosa: {
        label: "Morosa",
        tone: "rejected",
        description: "Existen cuotas con atraso mayor"
      },
      parcial: {
        label: "Parcial",
        tone: "pending",
        description: "Pago parcial registrado"
      },
      activa: {
        label: "En proceso",
        tone: "active",
        description: "OperaciÃƒÆ’Ã‚Â³n en gestiÃƒÆ’Ã‚Â³n"
      }
    };

    return map[normalized] || {
      label: status || "Sin estado",
      tone: "neutral",
      description: "Estado operativo actual"
    };
  }
  function getStoredToken() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }

  function clearStoredToken() {
    localStorage.removeItem(TOKEN_KEY);
  }

  function parseJwt(token) {
    const parts = String(token || "").split(".");
    if (parts.length < 2) {
      throw new Error("Invalid token format");
    }

    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((char) => "%" + ("00" + char.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );

    return JSON.parse(jsonPayload);
  }

  function decodeToken(token) {
    try {
      return parseJwt(token);
    } catch (error) {
      return null;
    }
  }

  function isTokenExpired(decodedToken) {
    if (!decodedToken || !decodedToken.exp) {
      return false;
    }

    return Date.now() >= decodedToken.exp * 1000;
  }

  function getSession() {
    const token = getStoredToken();
    if (!token) {
      return null;
    }

    const decoded = decodeToken(token);
    if (!decoded || isTokenExpired(decoded)) {
      clearStoredToken();
      return null;
    }

    return { token, decoded };
  }

  function roleHome(decodedToken) {
    return decodedToken && decodedToken.rol === "admin"
      ? "/admin.html"
      : "/dashboard-agente.html";
  }

  function logout(redirectTo = "/login-agente.html") {
    clearStoredToken();
    window.location.href = redirectTo;
  }

  function requireSession(options = {}) {
    const {
      role,
      roles,
      redirectTo = "/login-agente.html",
      forbiddenRedirect = ""
    } = options;

    const session = getSession();
    if (!session) {
      if (redirectTo) {
        window.location.href = redirectTo;
      }
      return null;
    }

    const allowedRoles = Array.isArray(roles)
      ? roles
      : role
        ? [role]
        : null;

    if (allowedRoles && !allowedRoles.includes(session.decoded.rol)) {
      if (forbiddenRedirect) {
        window.location.href = forbiddenRedirect;
      } else if (redirectTo) {
        window.location.href = roleHome(session.decoded);
      }
      return null;
    }

    return session;
  }

  function buildQuery(query) {
    if (!query || typeof query !== "object") {
      return "";
    }

    const params = new URLSearchParams();

    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") {
        return;
      }

      params.set(key, String(value));
    });

    const queryString = params.toString();
    return queryString ? `?${queryString}` : "";
  }

  async function parseResponse(response) {
    const text = await response.text();
    if (!text) {
      return {};
    }

    try {
      return repairPayloadEncoding(JSON.parse(text));
    } catch (error) {
      return { raw: repairTextEncodingNormalized(text) };
    }
  }

  function createHttpError(response, data) {
    const error = new Error(
      (data && (data.error || data.message)) || `HTTP ${response.status}`
    );
    error.status = response.status;
    error.data = data;
    return error;
  }

  async function apiRequest(options = {}) {
    const {
      path = API_ENDPOINT,
      query,
      method = "GET",
      body,
      auth = false,
      token = "",
      headers = {},
      signal
    } = options;

    const requestHeaders = Object.assign({}, headers);

    if (body !== undefined && !requestHeaders["Content-Type"]) {
      requestHeaders["Content-Type"] = "application/json";
    }

    if (auth) {
      const authToken = token || getStoredToken();
      if (!authToken) {
        throw Object.assign(new Error("No autorizado"), { status: 401 });
      }
      requestHeaders.Authorization = `Bearer ${authToken}`;
    }

    if (!requestHeaders["X-Debug-Admin"] && isDebugApiEnabled()) {
      requestHeaders["X-Debug-Admin"] = "1";
    }

    const response = await fetch(`${path}${buildQuery(query)}`, {
      method,
      headers: requestHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal
    });

    const data = await parseResponse(response);

    if (!response.ok) {
      if (auth && response.status === 401) {
        clearStoredToken();
      }
      throw createHttpError(response, data);
    }

    return data;
  }

  function isRateLimitError(error) {
    return Number(error?.status) === 429 || error?.data?.code === "airtable_rate_limited";
  }

  function isValidationError(error) {
    return Number(error?.status) === 422;
  }

  function getErrorMessage(error, fallback = "Ocurrio un error inesperado.") {
    if (!error) {
      return repairTextEncodingNormalized(fallback);
    }

    if (error.data && (error.data.error || error.data.message)) {
      const detail = [error.data.error || error.data.message, error.data.details]
        .filter(Boolean)
        .join(" ");
      return repairTextEncodingNormalized(detail || fallback);
    }

    if (isRateLimitError(error)) {
      return repairTextEncodingNormalized("El sistema esta recibiendo demasiadas solicitudes. Intenta nuevamente en unos segundos.");
    }

    if (isValidationError(error)) {
      return repairTextEncodingNormalized("Se detectaron datos inconsistentes para esta consulta. Se mostrara la informacion disponible.");
    }

    return repairTextEncodingNormalized(error.message || fallback);
  }

  function invalidateUnidadesCache() {
    unidadesPromise = null;
  }

  function getUnidades(options = {}) {
    const { force = false } = options;

    if (unidadesPromise) {
      return unidadesPromise;
    }

    unidadesPromise = apiRequest({
      query: force ? { unidades: 1, force: 1 } : { unidades: 1 },
      auth: true
    }).catch((error) => {
      unidadesPromise = null;
      throw error;
    });

    return unidadesPromise;
  }

  function createElement(tagName, config = {}, children = []) {
    const element = document.createElement(tagName);
    const {
      className,
      text,
      html,
      attrs,
      dataset,
      events
    } = config;

    if (className) {
      element.className = className;
    }

    if (text !== undefined) {
      element.textContent = typeof text === "string" ? repairTextEncodingNormalized(text) : text;
    }

    if (html !== undefined) {
      element.innerHTML = html;
    }

    if (attrs) {
      Object.entries(attrs).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        element.setAttribute(key, String(value));
      });
    }

    if (dataset) {
      Object.entries(dataset).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        element.dataset[key] = String(value);
      });
    }

    if (events) {
      Object.entries(events).forEach(([eventName, handler]) => {
        if (typeof handler === "function") {
          element.addEventListener(eventName, handler);
        }
      });
    }

    appendChildren(element, children);
    return element;
  }

  function appendChildren(element, children) {
    const list = Array.isArray(children) ? children : [children];

    list.forEach((child) => {
      if (child === undefined || child === null || child === false) {
        return;
      }

      if (Array.isArray(child)) {
        appendChildren(element, child);
        return;
      }

      if (child instanceof Node) {
        element.appendChild(child);
        return;
      }

      element.appendChild(document.createTextNode(repairTextEncodingNormalized(String(child))));
    });
  }

  function clearElement(element) {
    if (!element) return;
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  window.AppCore = {
    API_ENDPOINT,
    appendChildren,
    apiRequest,
    buildQuery,
    clearElement,
    clearStoredToken,
    createElement,
    decodeToken,
    escapeHtml,
    buildAbsoluteUrl,
    buildQrUrl,
    formatCurrency,
    getErrorMessage,
    getReservationStatusMeta,
    getSession,
    getStoredToken,
    getUnidades,
    isRateLimitError,
    isValidationError,
    invalidateUnidadesCache,
    logout,
    parseJwt,
    repairTextEncoding: repairTextEncodingNormalized,
    requireSession,
    roleHome,
    safeNumber,
    sanitizeUrl
  };
})();

