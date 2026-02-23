const fetch = require("node-fetch");

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = process.env.AIRTABLE_BASE;

exports.handler = async (event) => {
  const method = event.httpMethod;

  // =====================
  // GET UNIDADES
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

    const url = `https://api.airtable.com/v0/${BASE_ID}/UNIDADES?filterByFormula=${encodeURIComponent(formula)}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      },
    });

    const data = await response.json();

    const results = data.records.map((r) => ({
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
  if (method === "POST") {
    const body = JSON.parse(event.body);

    const response = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/RESERVAS`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${AIRTABLE_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: {
            unidad: [body.unidad_id],
            cliente: body.cliente,
            agente: body.agente,
            estado_reserva: "Activa",
          },
        }),
      }
    );

    const data = await response.json();

    return {
      statusCode: 200,
      body: JSON.stringify(data),
    };
  }

  return {
    statusCode: 405,
    body: "Method not allowed",
  };
};