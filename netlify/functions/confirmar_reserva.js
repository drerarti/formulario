const fetch = global.fetch;

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
  try {
    const reserva_id = event.queryStringParameters?.reserva_id;

    if (!reserva_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "FALTA_RESERVA_ID" })
      };
    }

    const BASE = process.env.AIRTABLE_BASE;
    const TOKEN = process.env.AIRTABLE_TOKEN;

    if (!BASE || !TOKEN) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "CONFIG_ERROR" })
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
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "RESERVA_NO_ENCONTRADA" })
      };
    }

    const reservaData = await reservaRes.json();
    const reserva = reservaData.fields;

    // 2️⃣ Validar estado
    if (reserva.estado_reserva !== "Solicitud") {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "RESERVA_NO_EN_ESTADO_SOLICITUD" })
      };
    }

    // 3️⃣ Validar vigencia_dias
    const vigencia = Number(reserva.vigencia_dias);

    if (!vigencia || vigencia <= 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "VIGENCIA_INVALIDA" })
      };
    }

    // 4️⃣ Calcular fechas
    const hoy = new Date();
    const fechaValidacion = hoy.toISOString().split("T")[0];

    const fechaFin = new Date();
    fechaFin.setDate(fechaFin.getDate() + vigencia);
    const fechaVigenciaFin = fechaFin.toISOString().split("T")[0];

    // 5️⃣ Actualizar reserva
    const updateRes = await fetch(
      `https://api.airtable.com/v0/${BASE}/RESERVAS/${reserva_id}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          fields: {
            estado_reserva: "Confirmada",
            fecha_validacion: fechaValidacion,
            fecha_vigencia_fin: fechaVigenciaFin
          }
        })
      }
    );

    if (!updateRes.ok) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "ERROR_ACTUALIZANDO_RESERVA" })
      };
    }

    await logEvent(BASE, TOKEN, {
      modulo: "CONFIRMAR_RESERVA",
      evento: "RESERVA_CONFIRMADA",
      referencia_id: reserva_id,
      detalle: `Vigencia: ${vigencia} días`
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        vigencia_dias: vigencia,
        fecha_vigencia_fin: fechaVigenciaFin
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "ERROR_GENERAL",
        detail: error.message
      })
    };
  }
};