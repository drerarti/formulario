const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = process.env.AIRTABLE_BASE;

exports.handler = async (event) => {
  const method = event.httpMethod;

  if (!AIRTABLE_TOKEN || !BASE_ID) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "CONFIG_ERROR",
        detail: "Faltan variables de entorno AIRTABLE_TOKEN o AIRTABLE_BASE",
      }),
    };
  }

  // ==========================
  // GET UNIDADES DISPONIBLES
  // ==========================
  if (method === "GET") {
    try {
      let formula = `{estado_unidad} = "Disponible"`;
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
              detail: data.error,
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

  // ==========================
  // CREAR RESERVA
  // ==========================
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

      if (unidadData.error) {
        return {
          statusCode: 500,
          body: JSON.stringify({
            error: "ERROR_VERIFICANDO_UNIDAD",
            detail: unidadData.error,
          }),
        };
      }

      if (unidadData.fields.estado_unidad !== "Disponible") {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "UNIDAD_NO_DISPONIBLE" }),
        };
      }

      // 2️⃣ Calcular fechas (solo fecha, sin hora para evitar errores)
      const ahora = new Date();
      const vencimiento = new Date(ahora.getTime() + 48 * 60 * 60 * 1000);

      const fechaInicio = ahora.toISOString().split("T")[0];
      const fechaExpira = vencimiento.toISOString().split("T")[0];

      // 3️⃣ Crear RESERVA
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
              cliente: body.cliente_actual || "",
              dni_cliente: body.dni_cliente || "",
              telefono_cliente: body.telefono_cliente || "",
              agente: body.agente || "",
              tipo_venta: (body.tipo_venta || "contado").toLowerCase().replace(/"/g, ""),
              descuento_solicitado: Number(body.descuento_solicitado || 0),
              motivo_descuento: body.motivo_descuento || "",
              monto_reserva: Number(body.monto_reserva || 0),
              estado_reserva: "Activa",
              fecha_inicio: fechaInicio,
              fecha_expira: fechaExpira,
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

      // 4️⃣ Actualizar UNIDAD
      const updateUnidad = await fetch(
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
              fecha_reserva: fechaInicio,
              fecha_expira: fechaExpira,
            },
          }),
        }
      );

      const updateData = await updateUnidad.json();

      if (updateData.error) {
        return {
          statusCode: 500,
          body: JSON.stringify({
            error: "ERROR_ACTUALIZANDO_UNIDAD",
            detail: updateData.error,
          }),
        };
      }

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