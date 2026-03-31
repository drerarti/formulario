const { AppCore } = window;
const session = AppCore.requireSession({ role: "admin", forbiddenRedirect: "/dashboard-agente.html" });

if (!session) {
  throw new Error("Admin session required");
}

const params = new URLSearchParams(window.location.search);
const reservaId = params.get("id") || "";

async function loadReserva() {
  if (!reservaId) {
    alert("No se encontro la reserva.");
    AppCore.logout("/admin.html");
    return;
  }

  try {
    const data = await AppCore.apiRequest({
      method: "POST",
      auth: true,
      body: {
        action: "obtener_reserva",
        id: reservaId
      }
    });

    document.getElementById("cliente").value = data.cliente || "";
    document.getElementById("dni").value = data.dni || "";
    document.getElementById("descripcion").value = "Separacion de lote";
    document.getElementById("monto").value = AppCore.safeNumber(data.monto_reserva);
  } catch (error) {
    alert(AppCore.getErrorMessage(error, "No se pudo cargar la reserva."));
  }
}

async function emitirBoleta() {
  const payload = {
    action: "emitir_boleta",
    reservaId,
    cliente: document.getElementById("cliente").value.trim(),
    dni: document.getElementById("dni").value.trim(),
    descripcion: document.getElementById("descripcion").value.trim(),
    monto: AppCore.safeNumber(document.getElementById("monto").value)
  };

  if (!payload.cliente || !payload.dni || !payload.descripcion || payload.monto <= 0) {
    alert("Completa todos los campos.");
    return;
  }

  try {
    const data = await AppCore.apiRequest({
      method: "POST",
      auth: true,
      body: payload
    });

    alert(`Boleta generada: ${data.serie || ""}-${data.numero || ""}`);
  } catch (error) {
    alert(AppCore.getErrorMessage(error, "No se pudo emitir la boleta."));
  }
}

function cancelar() {
  window.history.back();
}

window.emitirBoleta = emitirBoleta;
window.cancelar = cancelar;

loadReserva();
