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

exports.handler = async (event) => {
  const BASE = process.env.AIRTABLE_BASE;
  const TOKEN = process.env.AIRTABLE_TOKEN;

  try {
    const fetch = global.fetch;

    if (!BASE || !TOKEN) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "FALTAN_VARIABLES_DE_ENTORNO" })
      };
    }

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
      await logEvent(BASE, TOKEN, {
        modulo: "CANCELAR_VENTA",
        evento: "VENTA_NO_ENCONTRADA",
        referencia_id: venta_id,
        detalle: ""
      });

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

    await logEvent(BASE, TOKEN, {
      modulo: "CANCELAR_VENTA",
      evento: "VENTA_ENCONTRADA",
      referencia_id: venta_id,
      detalle: `Tipo: ${venta.tipo_venta}`
    });

    // 2️⃣ Obtener reserva
    const reservaRes = await fetch(
      `https://api.airtable.com/v0/${BASE}/RESERVAS/${reservaId}`,
      { headers }
    );

    if (!reservaRes.ok) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "ERROR_OBTENIENDO_RESERVA" })
      };
    }

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

    // 5️⃣ Anular cuotas si financiamiento
    if (venta.tipo_venta === "financiamiento") {

      const formula = encodeURIComponent(`{venta} = "${venta_id}"`);

      const cuotasRes = await fetch(
        `https://api.airtable.com/v0/${BASE}/CUOTAS?filterByFormula=${formula}`,
        { headers }
      );

      const cuotasData = await cuotasRes.json();

      if (cuotasData.records && cuotasData.records.length > 0) {

        for (const cuota of cuotasData.records) {
          await fetch(
            `https://api.airtable.com/v0/${BASE}/CUOTAS/${cuota.id}`,
            {
              method: "PATCH",
              headers,
              body: JSON.stringify({
                fields: { estado_cuota: "Anulada" }
              })
            }
          );
        }

        await logEvent(BASE, TOKEN, {
          modulo: "CANCELAR_VENTA",
          evento: "CUOTAS_ANULADAS",
          referencia_id: venta_id,
          detalle: `Cantidad: ${cuotasData.records.length}`
        });
      }
    }

    // 6️⃣ Cambiar estado venta
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

    // 7️⃣ Liberar unidad
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

    await logEvent(BASE, TOKEN, {
      modulo: "CANCELAR_VENTA",
      evento: "VENTA_CANCELADA",
      referencia_id: venta_id,
      detalle: `Penalidad: ${penalidad}, Devolución: ${devolucion}`
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        penalidad,
        devolucion
      })
    };

  } catch (error) {

    await logEvent(process.env.AIRTABLE_BASE, process.env.AIRTABLE_TOKEN, {
      modulo: "CANCELAR_VENTA",
      evento: "ERROR",
      referencia_id: event.queryStringParameters?.venta_id || "",
      detalle: error.message
    });

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "ERROR_GENERAL",
        detail: error.message
      })
    };
  }
};