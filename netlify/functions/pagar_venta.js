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
    const venta_id = event.queryStringParameters?.venta_id;
    const montoParam = event.queryStringParameters?.monto;

    if (!venta_id) {
      return { statusCode: 400, body: JSON.stringify({ error: "FALTA_VENTA_ID" }) };
    }

    const montoTotal = Number(montoParam);
    if (isNaN(montoTotal) || montoTotal <= 0) {
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

    const formula = encodeURIComponent(
      `AND({venta}="${venta_id}", {saldo_restante} > 0)`
    );

    const cuotasRes = await fetch(
      `https://api.airtable.com/v0/${BASE}/CUOTAS?filterByFormula=${formula}`,
      { headers }
    );

    const cuotasData = await cuotasRes.json();

    if (!cuotasData.records || cuotasData.records.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "NO_HAY_CUOTAS_PENDIENTES" })
      };
    }

    const cuotas = cuotasData.records.sort(
      (a, b) =>
        new Date(a.fields.fecha_vencimiento) -
        new Date(b.fields.fecha_vencimiento)
    );

    let montoRestante = montoTotal;
    let totalAplicado = 0;

    for (const cuota of cuotas) {
      if (montoRestante <= 0) break;

      // 🔁 Revalidación por seguridad
      const cuotaRecheck = await fetch(
        `https://api.airtable.com/v0/${BASE}/CUOTAS/${cuota.id}`,
        { headers }
      );

      const cuotaRecheckData = await cuotaRecheck.json();
      const saldoCuota = Number(cuotaRecheckData.fields.saldo_restante || 0);

      if (saldoCuota <= 0) continue;

      const aplicar = Math.min(montoRestante, saldoCuota);

      const fechaHoy = new Date().toISOString();

      await fetch(
        `https://api.airtable.com/v0/${BASE}/TRANSACCIONES`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            fields: {
              evento: "Pago global aplicado",
              cuota: [cuota.id],
              venta: [venta_id],
              unidad: cuota.fields.unidad || [],
              monto: aplicar,
              tipo_movimiento: "Ingreso",
              motivo: "Pago Global",
              fecha: fechaHoy
            }
          })
        }
      );

      montoRestante -= aplicar;
      totalAplicado += aplicar;
    }

    await logEvent(BASE, TOKEN, {
      modulo: "PAGAR_VENTA",
      evento: "PAGO_GLOBAL",
      referencia_id: venta_id,
      detalle: `Monto aplicado: ${totalAplicado}`
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        aplicado: totalAplicado,
        sobrante: montoRestante
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