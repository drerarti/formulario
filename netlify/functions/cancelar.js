async function logEvent(BASE, TOKEN, data) {
  try {
    await fetch(`https://api.airtable.com/v0/${BASE}/AUTOMATION_LOGS`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        fields: {
          modulo: data.modulo,
          evento: data.evento,
          referencia_id: data.referencia_id || "",
          detalle: data.detalle || "",
          fecha: new Date().toISOString().split("T")[0]
        }
      })
    });
  } catch (e) {
    console.error("LOG_ERROR:", e.message);
  }
}

exports.handler = async (event) => {

  const BASE = process.env.AIRTABLE_BASE;
  const TOKEN = process.env.AIRTABLE_TOKEN;

  try {
    const fetch = global.fetch;

    if (!BASE || !TOKEN) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "FALTAN_VARIABLES_DE_ENTORNO" })
      };
    }

    const reserva_id = event.queryStringParameters?.reserva_id;
    const penalidadParam = event.queryStringParameters?.penalidad;

    if (!reserva_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "FALTA_RESERVA_ID" })
      };
    }

    const penalidad = Number(penalidadParam || 0);

    if (isNaN(penalidad) || penalidad < 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "PENALIDAD_INVALIDA" })
      };
    }

    const headers = {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json"
    };

    // 1️⃣ Obtener reserva
    const reservaRes = await fetch(
      `https://api.airtable.com/v0/${BASE}/RESERVAS/${reserva_id}`,
      { headers }
    );

    if (!reservaRes.ok) {
      await logEvent(BASE, TOKEN, {
        modulo: "CANCELAR_RESERVA",
        evento: "RESERVA_NO_ENCONTRADA",
        referencia_id: reserva_id,
        detalle: ""
      });

      return {
        statusCode: 404,
        body: JSON.stringify({ error: "RESERVA_NO_ENCONTRADA" })
      };
    }

    const reservaData = await reservaRes.json();
    const reserva = reservaData.fields;

    if (reserva.estado_reserva !== "Activa") {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "RESERVA_NO_ACTIVA" })
      };
    }

    const montoReserva = Number(reserva.monto_reserva || 0);

    if (penalidad > montoReserva) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "PENALIDAD_MAYOR_AL_MONTO" })
      };
    }

    const devolucion = montoReserva - penalidad;
    const fechaHoy = new Date().toISOString();
    const unidadId = reserva.unidad?.[0];

    // 2️⃣ Registrar penalidad (Ingreso)
    if (penalidad > 0) {
      await fetch(
        `https://api.airtable.com/v0/${BASE}/TRANSACCIONES`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            fields: {
              evento: "Cancelación con penalidad",
              unidad: reserva.unidad,
              reserva: [reserva_id],
              monto: penalidad,
              tipo_movimiento: "Ingreso",
              motivo: "Penalidad",
              fecha: fechaHoy
            }
          })
        }
      );
    }

    // 3️⃣ Registrar devolución (Egreso)
    if (devolucion > 0) {
      await fetch(
        `https://api.airtable.com/v0/${BASE}/TRANSACCIONES`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            fields: {
              evento: "Devolución de reserva",
              unidad: reserva.unidad,
              reserva: [reserva_id],
              monto: devolucion,
              tipo_movimiento: "Egreso",
              motivo: "Devolución",
              fecha: fechaHoy
            }
          })
        }
      );
    }

    // 4️⃣ Cambiar estado reserva
    await fetch(
      `https://api.airtable.com/v0/${BASE}/RESERVAS/${reserva_id}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          fields: { estado_reserva: "Cancelada" }
        })
      }
    );

    // 5️⃣ Liberar unidad
    if (unidadId) {
      await fetch(
        `https://api.airtable.com/v0/${BASE}/UNIDADES/${unidadId}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            fields: { estado_unidad: "Disponible" }
          })
        }
      );
    }

    await logEvent(BASE, TOKEN, {
      modulo: "CANCELAR_RESERVA",
      evento: "RESERVA_CANCELADA",
      referencia_id: reserva_id,
      detalle: `Penalidad: ${penalidad}, Devolución: ${devolucion}`
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        penalidad,
        devolucion
      })
    };

  } catch (error) {

    await logEvent(process.env.AIRTABLE_BASE, process.env.AIRTABLE_TOKEN, {
      modulo: "CANCELAR_RESERVA",
      evento: "ERROR",
      referencia_id: event.queryStringParameters?.reserva_id || "",
      detalle: error.message
    });

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "ERROR_GENERAL",
        detail: error.message
      })
    };
  }
};