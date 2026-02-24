const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = process.env.AIRTABLE_BASE;

const fetch = global.fetch;

// ==========================
// LOGGER
// ==========================
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

// ==========================
// HANDLER
// ==========================
exports.handler = async (event) => {

  const method = event.httpMethod;

  if (!AIRTABLE_TOKEN || !BASE_ID) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "CONFIG_ERROR",
        detail: "Faltan variables de entorno"
      })
    };
  }

  const headers = {
    Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    "Content-Type": "application/json"
  };

  // ====================================================
  // GET UNIDADES DISPONIBLES
  // ====================================================
  if (method === "GET") {
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

        if (data.error) {
          return {
            statusCode: 500,
            body: JSON.stringify({
              error: "AIRTABLE_ERROR",
              detail: data.error
            })
          };
        }

        allRecords = allRecords.concat(data.records);
        offset = data.offset;

      } while (offset);

      const results = allRecords.map(r => ({
        id: r.id,
        unidad_id: r.fields.unidad_id,
        proyecto: r.fields.proyecto,
        manzana: r.fields.manzana,
        precio: r.fields.precio_lista || 0
      }));

      return {
        statusCode: 200,
        body: JSON.stringify(results)
      };

    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "SERVER_ERROR",
          detail: error.message
        })
      };
    }
  }

  // ====================================================
  // CREAR RESERVA (SOLICITUD)
  // ====================================================
  if (method === "POST") {
    try {

      const body = JSON.parse(event.body);

      if (!body.unidad_record_id) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "UNIDAD_REQUERIDA" })
        };
      }

      // 1️⃣ Verificar unidad disponible
      const checkUnidad = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/UNIDADES/${body.unidad_record_id}`,
        { headers }
      );

      const unidadData = await checkUnidad.json();

      if (!checkUnidad.ok) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: "UNIDAD_NO_ENCONTRADA" })
        };
      }

      if (unidadData.fields.estado_unidad !== "Disponible") {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "UNIDAD_NO_DISPONIBLE" })
        };
      }

      const hoy = new Date().toISOString().split("T")[0];

      // 2️⃣ Crear RESERVA en estado SOLICITUD
      const reservaRes = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/RESERVAS`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            fields: {
              unidad: [body.unidad_record_id],
              cliente: body.cliente_actual || "",
              dni_cliente: body.dni_cliente || "",
              telefono_cliente: body.telefono_cliente || "",
              agente: body.agente || "",
              monto_reserva: Number(body.monto_reserva || 0),
              descuento_solicitado: Number(body.descuento_solicitado || 0),
              motivo_descuento: body.motivo_descuento || "",
              estado_reserva: "Solicitud",
              fecha_inicio: hoy
            }
          })
        }
      );

      const reservaData = await reservaRes.json();

      if (!reservaRes.ok) {
        return {
          statusCode: 500,
          body: JSON.stringify({
            error: "ERROR_CREANDO_RESERVA",
            detail: reservaData.error
          })
        };
      }

      // 3️⃣ Marcar unidad como Reservado
      await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/UNIDADES/${body.unidad_record_id}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            fields: {
              estado_unidad: "Reservado",
              fecha_reserva: hoy
            }
          })
        }
      );

      // 4️⃣ Registrar transacción de reserva
      if (Number(body.monto_reserva) > 0) {
        await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/TRANSACCIONES`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              fields: {
                evento: "Ingreso por Reserva",
                unidad: [body.unidad_record_id],
                reserva: [reservaData.id],
                monto: Number(body.monto_reserva),
                tipo_movimiento: "Ingreso",
                motivo: "Reserva",
                fecha: new Date().toISOString()
              }
            })
          }
        );
      }

      await logEvent(BASE_ID, AIRTABLE_TOKEN, {
        modulo: "CREAR_RESERVA",
        evento: "SOLICITUD_CREADA",
        referencia_id: reservaData.id,
        detalle: `Unidad: ${body.unidad_record_id}`
      });

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          reserva_id: reservaData.id
        })
      };

    } catch (error) {

      await logEvent(BASE_ID, AIRTABLE_TOKEN, {
        modulo: "CREAR_RESERVA",
        evento: "ERROR",
        detalle: error.message
      });

      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "SERVER_ERROR",
          detail: error.message
        })
      };
    }
  }

  return {
    statusCode: 405,
    body: "Method not allowed"
  };
};