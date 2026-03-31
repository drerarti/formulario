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
    return (String(value || "").match(/[ÃÂâ€]/g) || []).length;
  }

  function repairTextEncoding(value) {
    const text = String(value ?? "");
    if (!text || !/[ÃÂâ€]/.test(text)) {
      return text;
    }

    try {
      const bytes = Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff);
      const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      if (decoded && countEncodingArtifacts(decoded) < countEncodingArtifacts(text)) {
        return decoded;
      }
    } catch (error) {
      // Keep the defensive replacements below.
    }

    return text
      .replace(/Â·/g, "·")
      .replace(/Â /g, " ")
      .replace(/Ã¡/g, "á")
      .replace(/Ã©/g, "é")
      .replace(/Ã­/g, "í")
      .replace(/Ã³/g, "ó")
      .replace(/Ãº/g, "ú")
      .replace(/Ã/g, "Á")
      .replace(/Ã‰/g, "É")
      .replace(/Ã/g, "Í")
      .replace(/Ã“/g, "Ó")
      .replace(/Ãš/g, "Ú")
      .replace(/Ã±/g, "ñ")
      .replace(/Ã‘/g, "Ñ");
  }

  function getReservationStatusMeta(status) {
    const normalized = String(status || "").trim().toLowerCase();
    const map = {
      solicitud: {
        label: "Pendiente de confirmación",
        tone: "pending",
        description: "Reserva creada y esperando validación comercial"
      },
      pendiente: {
        label: "Pendiente de confirmación",
        tone: "pending",
        description: "Reserva creada y esperando validación comercial"
      },
      "pendiente de confirmación": {
        label: "Pendiente de confirmación",
        tone: "pending",
        description: "Reserva creada y esperando validación comercial"
      },
      "pendiente de confirmacion": {
        label: "Pendiente de confirmación",
        tone: "pending",
        description: "Reserva creada y esperando validación comercial"
      },
      confirmada: {
        label: "Confirmada",
        tone: "confirmed",
        description: "Reserva validada y lista para negociación o conversión"
      },
      reservada: {
        label: "Reservada",
        tone: "confirmed",
        description: "Reserva tomada y en seguimiento comercial"
      },
      "en negociacion": {
        label: "En negociación",
        tone: "active",
        description: "Negociación comercial activa dentro de vigencia"
      },
      "negociacion extendida": {
        label: "Negociación extendida",
        tone: "premium",
        description: "Reserva con ampliación comercial vigente"
      },
      rechazada: {
        label: "Rechazada",
        tone: "rejected",
        description: "Operación no aprobada"
      },
      vencida: {
        label: "Vencida",
        tone: "expired",
        description: "La vigencia comercial expiró"
      },
      "en proceso": {
        label: "En proceso",
        tone: "active",
        description: "Operación en gestión"
      },
      proceso: {
        label: "En proceso",
        tone: "active",
        description: "Operación en gestión"
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
        description: "Operación completada sin saldo pendiente"
      },
      pagada: {
        label: "Cerrada",
        tone: "premium",
        description: "Operación completada sin saldo pendiente"
      },
      cancelada: {
        label: "Cancelada",
        tone: "rejected",
        description: "Operación cancelada"
      },
      bloqueada: {
        label: "Bloqueada",
        tone: "neutral",
        description: "Operación bloqueada para cambios"
      },
      "con pagos": {
        label: "Con pagos",
        tone: "active",
        description: "Operación con cobros registrados"
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
        description: "Operación en gestión"
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
      return JSON.parse(text);
    } catch (error) {
      return { raw: text };
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

  function getErrorMessage(error, fallback = "Ocurrió un error inesperado.") {
    if (!error) {
      return fallback;
    }

    if (isRateLimitError(error)) {
      return "El sistema está recibiendo demasiadas solicitudes. Intenta nuevamente en unos segundos.";
    }

    if (isValidationError(error)) {
      return "Se detectaron datos inconsistentes para esta consulta. Se mostrará la información disponible.";
    }

    if (error.data && (error.data.error || error.data.message)) {
      return error.data.error || error.data.message;
    }

    return error.message || fallback;
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
      element.textContent = text;
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

      element.appendChild(document.createTextNode(String(child)));
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
    repairTextEncoding,
    requireSession,
    roleHome,
    safeNumber,
    sanitizeUrl
  };
})();
