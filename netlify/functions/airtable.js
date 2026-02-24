const fetch = global.fetch;

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = process.env.AIRTABLE_BASE;

// ===============================
// HANDLER
// ===============================
exports.handler = async (event) => {

  // ================================
  // GET UNIDADES DISPONIBLES
  // ================================
  if (event.httpMethod === "GET") {
    try {
      const formula = `{estado_unidad}="Disponible"`;
      let allRecords = [];
      let offset = null;

      do {
        let url = `https://api.airtable.com/v0/${BASE_ID}/UNIDADES?filterByFormula=${encodeURIComponent(formula)}`;
        if (offset) url += `&offset=${offset}`;

        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${AIRTABLE_TOKEN}`
          }
        });

        const data = await response.json();
        allRecords = allRecords.concat(data.records);
        offset = data.offset;

      } while (offset);

      const results = allRecords.map(r => ({
        id: r.id,
        unidad_id: r.fields.unidad_id,
        proyecto: r.fields.proyecto,
        manzana: r.fields.Manzana,
        precio: r.fields.precio_lista || 0
      }));

      return {
        statusCode: 200,
        body: JSON.stringify(results)
      };

    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: error.message })
      };
    }
  }

  // ================================
  // POST CREAR RESERVA
  // ================================
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {

    const body = JSON.parse(event.body);
    const hoy = new Date().toISOString().split("T")[0];

    // 1️⃣ Crear reserva
    const reservaRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/RESERVAS`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${AIRTABLE_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fields: {
            unidad: [body.unidad_record_id],
            cliente: body.cliente_actual,
            dni_cliente: body.dni_cliente,
            telefono_cliente: body.telefono_cliente,
            agente: body.agente,
            monto_reserva: Number(body.monto_reserva || 0),
            descuento_solicitado: Number(body.descuento_solicitado || 0),
            motivo_descuento: body.motivo_descuento,
            estado_reserva: "Solicitud",
            fecha_inicio: hoy
          }
        })
      }
    );

    if (!reservaRes.ok) {
      const text = await reservaRes.text();
      throw new Error(text);
    }

    const reservaData = await reservaRes.json();

    // 2️⃣ Marcar unidad como Reservado
    await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/UNIDADES/${body.unidad_record_id}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${AIRTABLE_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fields: {
            estado_unidad: "Reservado",
            fecha_reserva: hoy
          }
        })
      }
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        reserva_id: reservaData.id
      })
    };

  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "SERVER_ERROR",
        detail: error.message
      })
    };
  }
};