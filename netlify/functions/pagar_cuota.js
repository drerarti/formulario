const fetch = global.fetch;

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
  try {
    const cuota_id = event.queryStringParameters?.cuota_id;
    const montoParam = event.queryStringParameters?.monto;

    if (!cuota_id) {
      return { statusCode: 400, body: JSON.stringify({ error: "FALTA_CUOTA_ID" }) };
    }

    const monto = Number(montoParam);
    if (isNaN(monto) || monto <= 0) {
      return { statusCode: 400, body: JSON.stringify({ error: "MONTO_INVALIDO" }) };
    }

    const BASE = process.env.AIRTABLE_BASE;
    const TOKEN = process.env.AIRTABLE_TOKEN;

    if (!BASE || !TOKEN) {
      return { statusCode: 500, body: JSON.stringify({ error: "CONFIG_ERROR" }) };
    }

    const headers = {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json"
    };

    // 🔁 Revalidación fuerte (anti doble clic)
    const cuotaRes = await fetch(
      `https://api.airtable.com/v0/${BASE}/CUOTAS/${cuota_id}`,
      { headers }
    );

    if (!cuotaRes.ok) {
      return { statusCode: 404, body: JSON.stringify({ error: "CUOTA_NO_ENCONTRADA" }) };
    }

    const cuotaData = await cuotaRes.json();
    const cuota = cuotaData.fields;

    const saldoActual = Number(cuota.saldo_restante || 0);

    if (saldoActual <= 0) {
      return { statusCode: 400, body: JSON.stringify({ error: "CUOTA_YA_PAGADA" }) };
    }

    if (monto > saldoActual) {
      return { statusCode: 400, body: JSON.stringify({ error: "MONTO_MAYOR_AL_SALDO" }) };
    }

    const fechaHoy = new Date().toISOString();

    // Crear transacción
    const transRes = await fetch(
      `https://api.airtable.com/v0/${BASE}/TRANSACCIONES`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          fields: {
            evento: "Pago de cuota",
            cuota: [cuota_id],
            venta: cuota.venta,
            unidad: cuota.unidad || [],
            monto: monto,
            tipo_movimiento: "Ingreso",
            motivo: "Cuota",
            fecha: fechaHoy
          }
        })
      }
    );

    if (!transRes.ok) {
      return { statusCode: 500, body: JSON.stringify({ error: "ERROR_TRANSACCION" }) };
    }

    await logEvent(BASE, TOKEN, {
      modulo: "PAGAR_CUOTA",
      evento: "CUOTA_PAGADA",
      referencia_id: cuota_id,
      detalle: `Monto: ${monto}`
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        monto_pagado: monto
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