exports.handler = async () => {
  try {
    const fetch = global.fetch;

    const BASE = process.env.AIRTABLE_BASE;
    const TOKEN = process.env.AIRTABLE_TOKEN;

    if (!BASE || !TOKEN) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "FALTAN_VARIABLES_ENTORNO" })
      };
    }

    // Fecha hace 48 horas
    const hace48h = new Date(Date.now() - 48 * 60 * 60 * 1000)
      .toISOString();

    // Buscar reservas activas vencidas
    const formula = encodeURIComponent(
      `AND({estado_reserva}="Activa",{fecha_inicio} <= "${hace48h}")`
    );

    const reservasRes = await fetch(
      `https://api.airtable.com/v0/${BASE}/RESERVAS?filterByFormula=${formula}`,
      {
        headers: { Authorization: `Bearer ${TOKEN}` }
      }
    );

    const reservasData = await reservasRes.json();

    if (!reservasData.records || reservasData.records.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "No hay reservas por expirar" })
      };
    }

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
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        reservas_expiradas: reservasData.records.length
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