const fetch = global.fetch;

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = process.env.AIRTABLE_BASE;

exports.handler = async (event) => {

  const headers = {
    Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    "Content-Type": "application/json"
  };

  // =========================================
  // ADMIN GET - Reservas en Solicitud
  // =========================================
  if (event.httpMethod === "GET" && event.queryStringParameters?.admin === "1") {

    try {

      const formula = `
  OR(
    {estado_reserva}="Solicitud",
    {estado_reserva}="Confirmada"
  )
`;
      const url = `https://api.airtable.com/v0/${BASE_ID}/RESERVAS?filterByFormula=${encodeURIComponent(formula)}`;

      const response = await fetch(url, { headers });
      const data = await response.json();

const result = data.records.map(r => ({
  id: r.id,
  estado: r.fields.estado_reserva,
  cliente: r.fields.cliente,
  monto_reserva: r.fields.monto_reserva || 0,
  unidad: r.fields.unidad_codigo ? r.fields.unidad_codigo[0] : "",
  unidad_record_id: r.fields.unidad ? r.fields.unidad[0] : null,
  precio_lista: r.fields.precio_lista_unidad ? r.fields.precio_lista_unidad[0] : 0,
  precio_final: r.fields.precio_final || "",
  tipo_venta: r.fields.tipo_venta || "",
  numero_cuotas: r.fields.numero_cuotas || "",
  monto_inicial: r.fields.monto_inicial || "",
  fecha_inicio_pagos: r.fields.fecha_inicio_pagos || "",
  observaciones: r.fields.observaciones_negociacion || ""
}));

      return {
        statusCode: 200,
        body: JSON.stringify(result)
      };

    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: error.message })
      };
    }
  }

  // =========================================
  // GET UNIDADES DISPONIBLES
  // =========================================
  if (event.httpMethod === "GET") {

    try {

      const formula = `{estado_unidad}="Disponible"`;
      const url = `https://api.airtable.com/v0/${BASE_ID}/UNIDADES?filterByFormula=${encodeURIComponent(formula)}`;

      const response = await fetch(url, { headers });
      const data = await response.json();

      const results = data.records.map(r => ({
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

  // =========================================
  // PATCH ADMIN (VALIDAR / RECHAZAR)
  // =========================================
  if (event.httpMethod === "PATCH") {

    try {

      const body = JSON.parse(event.body);
      const hoy = new Date();
      const hoyISO = hoy.toISOString().split("T")[0];
if (body.action === "negociacion") {

  await fetch(
    `https://api.airtable.com/v0/${BASE_ID}/RESERVAS/${body.reserva_id}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        fields: {
          precio_final: Number(body.precio_final || 0),
          tipo_venta: body.tipo_venta,
          monto_inicial: Number(body.monto_inicial || 0),
          numero_cuotas: Number(body.numero_cuotas || 0),
          fecha_inicio_pagos: body.fecha_inicio_pagos || null,
          observaciones_negociacion: body.observaciones || ""
        }
      })
    }
  );

  return { statusCode: 200, body: JSON.stringify({ success: true }) };
}
      // VALIDAR
      if (body.action === "validar") {

        const fechaFin = new Date();
        fechaFin.setDate(fechaFin.getDate() + 15);
        const fechaFinISO = fechaFin.toISOString().split("T")[0];

        await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/RESERVAS/${body.reserva_id}`,
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              fields: {
                estado_reserva: "Confirmada",
                fecha_validacion: hoyISO,
                fecha_vigencia_fin: fechaFinISO
              }
            })
          }
        );

        return { statusCode: 200, body: JSON.stringify({ success: true }) };
      }

      // RECHAZAR
      if (body.action === "rechazar") {

        // actualizar reserva
        await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/RESERVAS/${body.reserva_id}`,
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              fields: {
                estado_reserva: "Rechazada"
              }
            })
          }
        );

        // liberar unidad
        await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/UNIDADES/${body.unidad_record_id}`,
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

        return { statusCode: 200, body: JSON.stringify({ success: true }) };
      }

    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: error.message })
      };
    }
  }

  // =========================================
  // POST CREAR RESERVA
  // =========================================
if (event.httpMethod === "POST") {

  try {

    const body = JSON.parse(event.body);
    const hoy = new Date().toISOString().split("T")[0];

    // ================================
    // 1️⃣ VALIDAR ESTADO DE UNIDAD
    // ================================

    const unidadCheck = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/UNIDADES/${body.unidad_record_id}`,
      { headers }
    );

    const unidadData = await unidadCheck.json();

    if (!unidadData.fields || unidadData.fields.estado_unidad !== "Disponible") {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "La unidad ya no está disponible. Actualiza la página."
        })
      };
    }

    // ================================
    // 2️⃣ VALIDAR QUE NO EXISTA RESERVA ACTIVA
    // ================================

    const formula = `
      AND(
        FIND("${body.unidad_record_id}", ARRAYJOIN({unidad})) > 0,
        OR(
          {estado_reserva}="Solicitud",
          {estado_reserva}="Confirmada"
        )
      )
    `;

    const reservaCheckUrl = `https://api.airtable.com/v0/${BASE_ID}/RESERVAS?filterByFormula=${encodeURIComponent(formula)}`;

    const reservaCheck = await fetch(reservaCheckUrl, { headers });
    const reservaCheckData = await reservaCheck.json();

    if (reservaCheckData.records.length > 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Ya existe una reserva activa para esta unidad."
        })
      };
    }

    // ================================
    // 3️⃣ CREAR RESERVA
    // ================================

    const reservaRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/RESERVAS`,
      {
        method: "POST",
        headers,
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

    if (!reservaData.id) throw new Error("Error creando reserva");

    // ================================
    // 4️⃣ BLOQUEAR UNIDAD
    // ================================

    await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/UNIDADES/${body.unidad_record_id}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          fields: {
            estado_unidad: "Reservado"
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

    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };

  }
}

  return { statusCode: 405, body: "Method not allowed" };
};