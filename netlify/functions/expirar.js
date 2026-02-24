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
  const BASE = process.env.AIRTABLE_BASE;
  const TOKEN = process.env.AIRTABLE_TOKEN;

  try {
    const fetch = global.fetch;

    if (!BASE || !TOKEN) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "FALTAN_VARIABLES_ENTORNO" })
      };
    }

    // Fecha hace 48 horas (solo fecha, sin hora)
    const hace48h = new Date(Date.now() - 48 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const formula = encodeURIComponent(
      `AND({estado_reserva}="Activa",{fecha_inicio} <= "${hace48h}")`
    );

    const reservasRes = await fetch(
      `https://api.airtable.com/v0/${BASE}/RESERVAS?filterByFormula=${formula}`,
      {
        headers: { Authorization: `Bearer ${TOKEN}` }
      }
    );

    if (!reservasRes.ok) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "ERROR_BUSCANDO_RESERVAS" })
      };
    }

    const reservasData = await reservasRes.json();

    if (!reservasData.records || reservasData.records.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "No hay reservas por expirar" })
      };
    }

    let contador = 0;

    for (const reserva of reservasData.records) {

      const reservaId = reserva.id;
      const unidadId = reserva.fields.unidad?.[0];

      // 1️⃣ Cambiar reserva a Expirada
      await fetch(
        `https://api.airtable.com/v0/${BASE}/RESERVAS/${reservaId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            fields: { estado_reserva: "Expirada" }
          })
        }
      );

      // 2️⃣ Liberar unidad
      if (unidadId) {
        await fetch(
          `https://api.airtable.com/v0/${BASE}/UNIDADES/${unidadId}`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${TOKEN}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              fields: { estado_unidad: "Disponible" }
            })
          }
        );
      }

      await logEvent(BASE, TOKEN, {
        modulo: "EXPIRAR_RESERVA",
        evento: "RESERVA_EXPIRADA",
        referencia_id: reservaId,
        detalle: "Reserva expirada automáticamente por 48h"
      });

      contador++;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        reservas_expiradas: contador
      })
    };

  } catch (error) {

    await logEvent(process.env.AIRTABLE_BASE, process.env.AIRTABLE_TOKEN, {
      modulo: "EXPIRAR_RESERVA",
      evento: "ERROR",
      referencia_id: "",
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