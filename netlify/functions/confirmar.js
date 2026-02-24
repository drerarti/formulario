exports.handler = async (event) => {
  try {
    const fetch = global.fetch;
    const reserva_id = event.queryStringParameters?.reserva_id;

    if (!reserva_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "FALTA_RESERVA_ID" })
      };
    }

    const BASE = process.env.AIRTABLE_BASE;
    const TOKEN = process.env.AIRTABLE_TOKEN;

    // 1️⃣ Obtener reserva
    const reservaRes = await fetch(
      `https://api.airtable.com/v0/${BASE}/RESERVAS/${reserva_id}`,
      {
        headers: { Authorization: `Bearer ${TOKEN}` }
      }
    );

    const reservaData = await reservaRes.json();

    if (!reservaData.fields) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "RESERVA_NO_ENCONTRADA" })
      };
    }

    const reserva = reservaData.fields;

    if (reserva.estado_reserva !== "Activa") {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "RESERVA_NO_ACTIVA" })
      };
    }

    // 2️⃣ Crear venta
    const ventaRes = await fetch(
      `https://api.airtable.com/v0/${BASE}/VENTAS`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fields: {
            unidad: reserva.unidad,
            cliente: reserva.cliente,
            agente: reserva.agente,
            tipo_venta: reserva.tipo_venta,
            estado_venta: "Activa",
            fecha_venta: new Date().toISOString()
          }
        })
      }
    );

    const ventaData = await ventaRes.json();

    if (!ventaData.id) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "ERROR_CREANDO_VENTA", detail: ventaData })
      };
    }

    // 3️⃣ Cambiar unidad a Vendido
    await fetch(
      `https://api.airtable.com/v0/${BASE}/UNIDADES/${reserva.unidad[0]}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fields: {
            estado_unidad: "Vendido"
          }
        })
      }
    );

    // 4️⃣ Cambiar reserva a Confirmada
    await fetch(
      `https://api.airtable.com/v0/${BASE}/RESERVAS/${reserva_id}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fields: {
            estado_reserva: "Confirmada"
          }
        })
      }
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "ERROR_GENERAL", detail: error.message })
    };
  }
};