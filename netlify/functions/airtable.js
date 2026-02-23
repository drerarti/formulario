
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = process.env.AIRTABLE_BASE;

exports.handler = async (event) => {
  const method = event.httpMethod;
// =====================
// GET UNIDADES (CON PAGINACIÓN)
// =====================
if (method === "GET") {
  const { project, manzana } = event.queryStringParameters || {};

  let formula = `{estado_unidad} = "Disponible"`;

  if (project) {
    formula += ` AND {proyecto} = "${project}"`;
  }

  if (manzana) {
    formula += ` AND {Manzana} = "${manzana}"`;
  }

  let allRecords = [];
  let offset = null;

  do {
    let url = `https://api.airtable.com/v0/${BASE_ID}/UNIDADES?filterByFormula=${encodeURIComponent(formula)}`;

    if (offset) {
      url += `&offset=${offset}`;
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      },
    });

    const data = await response.json();

    if (data.error) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "AIRTABLE_ERROR",
          detail: data.error
        }),
      };
    }

    allRecords = allRecords.concat(data.records);
    offset = data.offset;

  } while (offset);

  const results = allRecords.map((r) => ({
    id: r.id,
    unidad_id: r.fields.unidad_id,
    proyecto: r.fields.proyecto,
    manzana: r.fields.Manzana,
    precio: r.fields.precio_lista || 0,
  }));

  return {
    statusCode: 200,
    body: JSON.stringify(results),
  };
}

  // =====================
  // POST RESERVA
  // =====================
// =====================
// POST RESERVA PROFESIONAL
// =====================
if (method === "POST") {
  try {
    const body = JSON.parse(event.body);

    if (!body.unidad_record_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "UNIDAD_REQUERIDA" }),
      };
    }

    // 1️⃣ Verificar disponibilidad actual
    const checkResponse = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/UNIDADES/${body.unidad_record_id}`,
      {
        headers: {
          Authorization: `Bearer ${AIRTABLE_TOKEN}`,
        },
      }
    );

    const unidadData = await checkResponse.json();

    if (unidadData.fields.estado_unidad !== "Disponible") {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "UNIDAD_NO_DISPONIBLE" }),
      };
    }

    // 2️⃣ Crear RESERVA
    const reservaResponse = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/RESERVAS`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${AIRTABLE_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: {
            unidad: [body.unidad_record_id],
            cliente_contact_id: body.contact_id || "",
            estado_reserva: "Activa",
            tipo_venta: body.tipo_venta || "Contado",
            descuento_solicitado: Number(body.descuento_solicitado || 0),
          },
        }),
      }
    );

    const reservaData = await reservaResponse.json();

    if (reservaData.error) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "ERROR_CREANDO_RESERVA",
          detail: reservaData.error,
        }),
      };
    }

    // 3️⃣ Actualizar UNIDAD → Reservado
    await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/UNIDADES/${body.unidad_record_id}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${AIRTABLE_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: {
            estado_unidad: "Reservado",
          },
        }),
      }
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        reserva_id: reservaData.id,
      }),
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "SERVER_ERROR",
        detail: error.message,
      }),
    };
  }
}
  return {
    statusCode: 405,
    body: "Method not allowed",
  };
};