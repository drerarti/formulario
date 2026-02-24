exports.handler = async (event) => {
  try {
    const fetch = global.fetch;

    const venta_id = event.queryStringParameters?.venta_id;
    const penalidadParam = event.queryStringParameters?.penalidad;

    if (!venta_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "FALTA_VENTA_ID" })
      };
    }

    const penalidad = Number(penalidadParam || 0);

    if (isNaN(penalidad) || penalidad < 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "PENALIDAD_INVALIDA" })
      };
    }

    const BASE = process.env.AIRTABLE_BASE;
    const TOKEN = process.env.AIRTABLE_TOKEN;

    const headers = {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json"
    };

    // 1️⃣ Obtener venta
    const ventaRes = await fetch(
      `https://api.airtable.com/v0/${BASE}/VENTAS/${venta_id}`,
      { headers }
    );

    if (!ventaRes.ok) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "VENTA_NO_ENCONTRADA" })
      };
    }

    const ventaData = await ventaRes.json();
    const venta = ventaData.fields;

    if (venta.estado_venta !== "Activa") {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "VENTA_NO_ACTIVA" })
      };
    }

    const reservaId = venta.reserva?.[0];
    const unidadId = venta.unidad?.[0];

    if (!reservaId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "VENTA_SIN_RESERVA" })
      };
    }

    // 2️⃣ Obtener reserva para monto_reserva
    const reservaRes = await fetch(
      `https://api.airtable.com/v0/${BASE}/RESERVAS/${reservaId}`,
      { headers }
    );

    const reservaData = await reservaRes.json();
    const montoReserva = Number(reservaData.fields.monto_reserva || 0);

    if (penalidad > montoReserva) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "PENALIDAD_MAYOR_AL_MONTO" })
      };
    }

    const devolucion = montoReserva - penalidad;
    const fechaHoy = new Date().toISOString();

    // 3️⃣ Registrar penalidad
    if (penalidad > 0) {
      await fetch(
        `https://api.airtable.com/v0/${BASE}/TRANSACCIONES`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            fields: {
              evento: "Cancelación venta - penalidad",
              unidad: venta.unidad,
              reserva: [reservaId],
              venta: [venta_id],
              monto: penalidad,
              tipo_movimiento: "Ingreso",
              motivo: "Penalidad",
              fecha: fechaHoy
            }
          })
        }
      );
    }

    // 4️⃣ Registrar devolución
    if (devolucion > 0) {
      await fetch(
        `https://api.airtable.com/v0/${BASE}/TRANSACCIONES`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            fields: {
              evento: "Cancelación venta - devolución",
              unidad: venta.unidad,
              reserva: [reservaId],
              venta: [venta_id],
              monto: devolucion,
              tipo_movimiento: "Egreso",
              motivo: "Devolución",
              fecha: fechaHoy
            }
          })
        }
      );
    }

    // 5️⃣ Cambiar estado venta
    await fetch(
      `https://api.airtable.com/v0/${BASE}/VENTAS/${venta_id}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          fields: { estado_venta: "Cancelada" }
        })
      }
    );

    // 6️⃣ Liberar unidad
    if (unidadId) {
      await fetch(
        `https://api.airtable.com/v0/${BASE}/UNIDADES/${unidadId}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            fields: { estado_unidad: "Disponible" }
          })
        }
      );
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        penalidad,
        devolucion
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