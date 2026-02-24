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

    if (!BASE || !TOKEN) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "FALTAN_VARIABLES_DE_ENTORNO" })
      };
    }

    // =========================
    // 1️⃣ OBTENER RESERVA
    // =========================
    const reservaRes = await fetch(
      `https://api.airtable.com/v0/${BASE}/RESERVAS/${reserva_id}`,
      {
        headers: { Authorization: `Bearer ${TOKEN}` }
      }
    );

    if (!reservaRes.ok) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "RESERVA_NO_ENCONTRADA" })
      };
    }

    const reservaData = await reservaRes.json();
    const reserva = reservaData.fields;

    if (!reserva) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "RESERVA_SIN_DATOS" })
      };
    }

    if (reserva.estado_reserva !== "Activa") {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "RESERVA_NO_ACTIVA" })
      };
    }

    if (!reserva.unidad || !reserva.unidad[0]) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "RESERVA_SIN_UNIDAD" })
      };
    }

    // =========================
    // 2️⃣ CREAR VENTA
    // =========================

    // Si fecha_venta es SOLO fecha:
    const fechaHoy = new Date().toISOString().split("T")[0];

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
            cliente: reserva.cliente || "",
            agente: reserva.agente || "",
            tipo_venta: reserva.tipo_venta || "Contado",
            estado_venta: "Activa",
            fecha_venta: fechaHoy
          }
        })
      }
    );

    const ventaData = await ventaRes.json();

    if (!ventaRes.ok || !ventaData.id) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "ERROR_CREANDO_VENTA",
          detail: ventaData
        })
      };
    }

    // =========================
    // 3️⃣ CAMBIAR UNIDAD A VENDIDO
    // =========================
    const unidadRes = await fetch(
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

    if (!unidadRes.ok) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "ERROR_ACTUALIZANDO_UNIDAD" })
      };
    }

    // =========================
    // 4️⃣ CAMBIAR RESERVA A CONFIRMADA
    // =========================
    const reservaUpdateRes = await fetch(
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

    if (!reservaUpdateRes.ok) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "ERROR_ACTUALIZANDO_RESERVA" })
      };
    }

    // =========================
    // ✅ TODO CORRECTO
    // =========================
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        venta_id: ventaData.id
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