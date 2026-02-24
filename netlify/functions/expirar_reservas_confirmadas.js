
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

exports.handler = async () => {
  try {

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

    const hoy = new Date().toISOString().split("T")[0];

    // Buscar reservas confirmadas vencidas
    const formula = encodeURIComponent(
      `AND({estado_reserva}="Confirmada",{fecha_vigencia_fin} < "${hoy}")`
    );

    const response = await fetch(
      `https://api.airtable.com/v0/${BASE}/RESERVAS?filterByFormula=${formula}`,
      { headers }
    );

    const data = await response.json();

    if (!data.records || data.records.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: "No hay reservas vencidas"
        })
      };
    }

    let procesadas = 0;

    for (const reserva of data.records) {

      const reservaId = reserva.id;
      const unidadId = reserva.fields.unidad?.[0];

      // 1️⃣ Cambiar estado reserva a Vencida
      await fetch(
        `https://api.airtable.com/v0/${BASE}/RESERVAS/${reservaId}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            fields: {
              estado_reserva: "Vencida"
            }
          })
        }
      );

      // 2️⃣ Liberar unidad
      if (unidadId) {
        await fetch(
          `https://api.airtable.com/v0/${BASE}/UNIDADES/${unidadId}`,
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              fields: {
                estado_unidad: "Disponible"
              }
            })
          }
        );
      }

      await logEvent(BASE, TOKEN, {
        modulo: "EXPIRAR_RESERVA",
        evento: "RESERVA_VENCIDA",
        referencia_id: reservaId,
        detalle: "Vigencia finalizada automáticamente"
      });

      procesadas++;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        reservas_vencidas: procesadas
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