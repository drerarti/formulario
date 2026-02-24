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

    const reserva_id = event.queryStringParameters?.reserva_id;
    const tipo_venta_param = event.queryStringParameters?.tipo_venta;

    if (!reserva_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "FALTA_RESERVA_ID" })
      };
    }

    if (!tipo_venta_param) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "FALTA_TIPO_VENTA" })
      };
    }

    if (!BASE || !TOKEN) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "FALTAN_VARIABLES_DE_ENTORNO" })
      };
    }

    const tipoVenta = tipo_venta_param.toLowerCase();

    // =========================
    // 1️⃣ OBTENER RESERVA
    // =========================
    const reservaRes = await fetch(
      `https://api.airtable.com/v0/${BASE}/RESERVAS/${reserva_id}`,
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );

    if (!reservaRes.ok) {
      await logEvent(BASE, TOKEN, {
        modulo: "CONFIRMAR_VENTA",
        evento: "RESERVA_NO_ENCONTRADA",
        referencia_id: reserva_id,
        detalle: ""
      });

      return {
        statusCode: 404,
        body: JSON.stringify({ error: "RESERVA_NO_ENCONTRADA" })
      };
    }

    const reservaData = await reservaRes.json();
    const reserva = reservaData.fields;

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
            reserva: [reserva_id],
            unidad: reserva.unidad,
            cliente: reserva.cliente || "",
            agente: reserva.agente || "",
            tipo_venta: tipoVenta,
            estado_venta: "Activa",
            fecha_venta: fechaHoy
          }
        })
      }
    );

    const ventaData = await ventaRes.json();

    if (!ventaRes.ok || !ventaData.id) {
      await logEvent(BASE, TOKEN, {
        modulo: "CONFIRMAR_VENTA",
        evento: "ERROR_CREANDO_VENTA",
        referencia_id: reserva_id,
        detalle: JSON.stringify(ventaData)
      });

      return {
        statusCode: 500,
        body: JSON.stringify({ error: "ERROR_CREANDO_VENTA" })
      };
    }

    await logEvent(BASE, TOKEN, {
      modulo: "CONFIRMAR_VENTA",
      evento: "VENTA_CREADA",
      referencia_id: ventaData.id,
      detalle: `Tipo: ${tipoVenta}`
    });

    // =========================
    // 3️⃣ GENERAR CUOTAS (SI FINANCIAMIENTO)
    // =========================
    if (tipoVenta === "financiamiento") {

      const unidadRes = await fetch(
        `https://api.airtable.com/v0/${BASE}/UNIDADES/${reserva.unidad[0]}`,
        { headers: { Authorization: `Bearer ${TOKEN}` } }
      );

      const unidadData = await unidadRes.json();
      const unidad = unidadData.fields;

      const precioLista = Number(unidad.precio_lista || 0);
      const numeroCuotas = Number(unidad.numero_cuotas_default || 0);
      const montoReserva = Number(reserva.monto_reserva || 0);

      if (!numeroCuotas || numeroCuotas <= 0) {
        return {
          statusCode: 500,
          body: JSON.stringify({ error: "CUOTAS_NO_DEFINIDAS_EN_PROYECTO" })
        };
      }

      const saldo = precioLista - montoReserva;
      const montoCuota = saldo / numeroCuotas;

      for (let i = 1; i <= numeroCuotas; i++) {
        const fechaVenc = new Date();
        fechaVenc.setDate(fechaVenc.getDate() + (30 * i));
        const fechaSolo = fechaVenc.toISOString().split("T")[0];

        await fetch(
          `https://api.airtable.com/v0/${BASE}/CUOTAS`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${TOKEN}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              fields: {
                cuota_numero: i,
                venta: [ventaData.id],
                fecha_vencimiento: fechaSolo,
                monto_cuota: montoCuota,
                estado_cuota: "Pendiente"
              }
            })
          }
        );
      }

      await logEvent(BASE, TOKEN, {
        modulo: "CONFIRMAR_VENTA",
        evento: "CUOTAS_GENERADAS",
        referencia_id: ventaData.id,
        detalle: `Cantidad: ${numeroCuotas}`
      });
    }

    // =========================
    // 4️⃣ ACTUALIZAR UNIDAD Y RESERVA
    // =========================
    await fetch(
      `https://api.airtable.com/v0/${BASE}/UNIDADES/${reserva.unidad[0]}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fields: { estado_unidad: "Vendido" }
        })
      }
    );

    await fetch(
      `https://api.airtable.com/v0/${BASE}/RESERVAS/${reserva_id}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fields: { estado_reserva: "Confirmada" }
        })
      }
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        venta_id: ventaData.id
      })
    };

  } catch (error) {

    await logEvent(process.env.AIRTABLE_BASE, process.env.AIRTABLE_TOKEN, {
      modulo: "CONFIRMAR_VENTA",
      evento: "ERROR",
      referencia_id: event.queryStringParameters?.reserva_id || "",
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