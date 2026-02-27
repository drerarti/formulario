const fetch = global.fetch;

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = process.env.AIRTABLE_BASE;

exports.handler = async (event) => {

  const headers = {
    Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    "Content-Type": "application/json"
  };

  try {

    // ======================================================
    // ======================= GET ===========================
    // ======================================================

    if (event.httpMethod === "GET") {

      const qs = event.queryStringParameters || {};
      // ==============================
// VALIDAR AGENTE
// ==============================

if (qs.validar_agente === "1") {

  const codigo = qs.codigo;

  const formula = `{codigo_agente}="${codigo}"`;

  const url = `https://api.airtable.com/v0/${BASE_ID}/AGENTES?filterByFormula=${encodeURIComponent(formula)}`;

  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error("Error validando agente");

  const data = await response.json();

  if (data.records.length === 0) {
    return {
      statusCode: 200,
      body: JSON.stringify({ valido: false })
    };
  }

  const agente = data.records[0].fields;

  if (agente.estado !== "Activo") {
    return {
      statusCode: 200,
      body: JSON.stringify({ valido: false })
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      valido: true,
      nombre: agente.nombre,
      codigo: agente.codigo_agente
    })
  };
}
// ==============================
// GET ESTADO PARA PLANO
// ==============================
if (qs.plano === "1") {

  const proyecto = qs.proyecto;
  const fase = qs.fase;

  const formula = `
    AND(
      {proyecto}="${proyecto}",
      {Fase}="${fase}"
    )
  `;

  const url = `https://api.airtable.com/v0/${BASE_ID}/UNIDADES?filterByFormula=${encodeURIComponent(formula)}`;

  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error("Error obteniendo estado para plano");

  const data = await response.json();

const result = data.records.map(r => ({
  lote_id: r.fields.unidad_id,
  estado: (r.fields.estado_unidad || "").toLowerCase(),
  precio: r.fields.precio_lista || 0,
  manzana: r.fields.Manzana || "",
  lote: r.fields.Lote || ""
}));

  return { statusCode: 200, body: JSON.stringify(result) };
}
      // ==============================
      // GET ADMIN RESERVAS
      // ==============================
      if (qs.admin === "1") {

        const formula = `
          OR(
            {estado_reserva}="Solicitud",
            {estado_reserva}="Confirmada"
          )
        `;

        const url = `https://api.airtable.com/v0/${BASE_ID}/RESERVAS?filterByFormula=${encodeURIComponent(formula)}`;

        const response = await fetch(url, { headers });
        if (!response.ok) throw new Error("Error obteniendo reservas");

        const data = await response.json();

        const result = data.records.map(r => ({
          id: r.id,
          estado: r.fields.estado_reserva,
          cliente: r.fields.cliente,
          monto_reserva: r.fields.monto_reserva || 0,
          agente: r.fields.agente || "",
          unidad: Array.isArray(r.fields.unidad_codigo)
  ? r.fields.unidad_codigo[0]
  : (r.fields.unidad_codigo || ""),
          unidad_record_id: r.fields.unidad ? r.fields.unidad[0] : null,
          precio_lista: r.fields.precio_lista_unidad ? r.fields.precio_lista_unidad[0] : 0,
          precio_final: r.fields.precio_final || "",
          tipo_venta: r.fields.tipo_venta || "",
          numero_cuotas: r.fields.numero_cuotas || "",
          monto_inicial: r.fields.monto_inicial || "",
          fecha_inicio_pagos: r.fields.fecha_inicio_pagos || "",
          observaciones: r.fields.observaciones_negociacion || ""
        }));

        return { statusCode: 200, body: JSON.stringify(result) };
      }

      // ==============================
      // GET VENTAS
      // ==============================
      if (qs.ventas === "1") {

        const response = await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/VENTAS`,
          { headers }
        );

        if (!response.ok) throw new Error("Error obteniendo ventas");

        const data = await response.json();

        const result = data.records.map(r => {

          const precio = r.fields.precio_base || 0;
          const reserva = r.fields.monto_reserva || 0;
          const inicial = r.fields.monto_inicial || 0;
          const saldo = precio - reserva - inicial;

          return {
            id: r.id,
            cliente: r.fields.cliente || "",
            unidad: Array.isArray(r.fields.unidad)
              ? r.fields.unidad[0]
              : r.fields.unidad || "",
            agente: r.fields.agente || "",
            precio_base: precio,
            monto_reserva: reserva,
            monto_inicial: inicial,
            saldo_restante: saldo > 0 ? saldo : 0,
            tipo_venta: r.fields.tipo_venta || "",
            fecha_venta: r.fields.fecha_venta || "",
            estado_venta: r.fields.estado_venta || "Activa"
          };
        });

        return { statusCode: 200, body: JSON.stringify(result) };
      }

      // ==============================
      // GET DETALLE VENTA
      // ==============================
      if (qs.venta_id) {

        const ventaRes = await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/VENTAS/${qs.venta_id}`,
          { headers }
        );

        if (!ventaRes.ok) {
          return { statusCode: 404, body: JSON.stringify({ error: "Venta no encontrada" }) };
        }

        const ventaData = await ventaRes.json();
        const f = ventaData.fields;

        const precio = f.precio_base || 0;
        const reserva = f.monto_reserva || 0;
        const inicial = f.monto_inicial || 0;

        return {
          statusCode: 200,
          body: JSON.stringify({
            id: ventaData.id,
            cliente: f.cliente || "",
            unidad: Array.isArray(f.unidad) ? f.unidad[0] : f.unidad || "",
            agente: f.agente || "",
            precio_base: precio,
            monto_reserva: reserva,
            monto_inicial: inicial,
            saldo_restante: precio - reserva - inicial,
            tipo_venta: f.tipo_venta || "",
            fecha_venta: f.fecha_venta || "",
            estado_venta: f.estado_venta || "Activa"
          })
        };
      }

      // ==============================
      // GET CUOTAS POR VENTA (ROBUSTO)
      // ==============================
      if (qs.cuotas_venta) {

        const ventaId = qs.cuotas_venta;

        const response = await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/CUOTAS`,
          { headers }
        );

        if (!response.ok) throw new Error("Error obteniendo cuotas");

        const data = await response.json();

        const filtradas = data.records
          .filter(r => r.fields.venta && r.fields.venta.includes(ventaId))
          .map(r => ({
            id: r.id,
            numero: r.fields.numero_cuota || "",
            monto: r.fields.monto_programado || 0,
            fecha: r.fields.fecha_vencimiento || "",
            estado: r.fields.estado_cuota || "Pendiente"
          }));

        return { statusCode: 200, body: JSON.stringify(filtradas) };
      }

      // ==============================
      // GET UNIDADES DISPONIBLES
      // ==============================

      const formula = `{estado_unidad}="Disponible"`;

      const url = `https://api.airtable.com/v0/${BASE_ID}/UNIDADES?filterByFormula=${encodeURIComponent(formula)}`;

      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error("Error obteniendo unidades");

      const data = await response.json();

      const results = data.records.map(r => ({
        id: r.id,
        unidad_id: r.fields.unidad_id,
        proyecto: r.fields.proyecto,
        manzana: r.fields.Manzana,
        precio: r.fields.precio_lista || 0
      }));

      return { statusCode: 200, body: JSON.stringify(results) };
    }

    // ======================================================
    // ======================= PATCH =========================
    // ======================================================

    if (event.httpMethod === "PATCH") {

      const body = JSON.parse(event.body || "{}");
      const hoyISO = new Date().toISOString().split("T")[0];

      // NEGOCIACIÓN
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

        await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/RESERVAS/${body.reserva_id}`,
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              fields: { estado_reserva: "Rechazada" }
            })
          }
        );

        await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/UNIDADES/${body.unidad_record_id}`,
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              fields: { estado_unidad: "Disponible" }
            })
          }
        );

        return { statusCode: 200, body: JSON.stringify({ success: true }) };
      }

      // CONVERTIR (versión limpia y segura)
      if (body.action === "convertir") {

        const reservaRes = await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/RESERVAS/${body.reserva_id}`,
          { headers }
        );

        const reservaData = await reservaRes.json();

        if (!reservaData.id) {
          return { statusCode: 400, body: JSON.stringify({ error: "Reserva no encontrada" }) };
        }

        if (reservaData.fields.estado_reserva !== "Confirmada") {
          return { statusCode: 400, body: JSON.stringify({ error: "La reserva no está confirmada" }) };
        }

        if (reservaData.fields.venta && reservaData.fields.venta.length > 0) {
          return { statusCode: 400, body: JSON.stringify({ error: "Esta reserva ya fue convertida." }) };
        }

        const unidadId = reservaData.fields.unidad[0];

        const ventaRes = await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/VENTAS`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              fields: {
                cliente: reservaData.fields.cliente,
                unidad: [unidadId],
                reserva: [body.reserva_id],
                precio_base: reservaData.fields.precio_final,
                monto_reserva: reservaData.fields.monto_reserva,
                monto_inicial: reservaData.fields.monto_inicial || 0,
                tipo_venta: reservaData.fields.tipo_venta,
                fecha_venta: hoyISO,
                estado_venta: "Activa"
              }
            })
          }
        );

        const ventaData = await ventaRes.json();

        await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/RESERVAS/${body.reserva_id}`,
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              fields: {
                estado_reserva: "Convertida",
                venta: [ventaData.id]
              }
            })
          }
        );

        await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/UNIDADES/${unidadId}`,
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              fields: { estado_unidad: "Vendido" }
            })
          }
        );

        return {
          statusCode: 200,
          body: JSON.stringify({ success: true, venta_id: ventaData.id })
        };
      }

    // REGISTRAR PAGO (CORREGIDO Y SEGURO)
    if (body.action === "registrar_pago") {

        const { venta_id, monto, metodo, fecha_pago, observacion } = body;
        let montoRestante = Number(monto);

        if (!venta_id || !montoRestante || montoRestante <= 0) {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: "Datos de pago inválidos" })
          };
        }

        // 1️⃣ Obtener todas las cuotas y filtrar en JS
        const cuotasRes = await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/CUOTAS`,
          { headers }
        );

        if (!cuotasRes.ok) throw new Error("Error obteniendo cuotas");

        const cuotasData = await cuotasRes.json();

        const cuotas = cuotasData.records
          .filter(r => r.fields.venta && r.fields.venta.includes(venta_id))
          .sort((a, b) =>
            (a.fields.numero_cuota || 0) - (b.fields.numero_cuota || 0)
          );

        for (const cuota of cuotas) {

          if (montoRestante <= 0) break;

          const pagadoActual = cuota.fields.monto_pagado || 0;
          const programado = cuota.fields.monto_programado || 0;
          const saldoCuota = programado - pagadoActual;

          if (saldoCuota <= 0) continue;

          const aplicar = Math.min(montoRestante, saldoCuota);
          const nuevoPagado = pagadoActual + aplicar;

          let nuevoEstado = "Pendiente";
          if (nuevoPagado === 0) nuevoEstado = "Pendiente";
          else if (nuevoPagado < programado) nuevoEstado = "Parcial";
          else nuevoEstado = "Pagada";

          // Actualizar cuota
          await fetch(
            `https://api.airtable.com/v0/${BASE_ID}/CUOTAS/${cuota.id}`,
            {
              method: "PATCH",
              headers,
              body: JSON.stringify({
                fields: {
                  monto_pagado: nuevoPagado,
                  estado_cuota: nuevoEstado
                }
              })
            }
          );

          // Crear transacción
          await fetch(
            `https://api.airtable.com/v0/${BASE_ID}/TRANSACCIONES`,
            {
              method: "POST",
              headers,
              body: JSON.stringify({
                fields: {
                  venta: [venta_id],
                  cuota: [cuota.id],
                  monto: aplicar,
                  metodo,
                  fecha_pago,
                  observacion: observacion || ""
                }
              })
            }
          );

          montoRestante -= aplicar;
        }

        // 2️⃣ Recalcular saldo SOLO con cuotas de esta venta
        const cuotasFinalRes = await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/CUOTAS`,
          { headers }
        );

        const cuotasFinalData = await cuotasFinalRes.json();

        const cuotasVenta = cuotasFinalData.records.filter(
          r => r.fields.venta && r.fields.venta.includes(venta_id)
        );

        const totalPagadoCuotas = cuotasVenta.reduce(
          (sum, c) => sum + (c.fields.monto_pagado || 0),
          0
        );

        const ventaRes = await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/VENTAS/${venta_id}`,
          { headers }
        );

        const ventaData = await ventaRes.json();
        const precio = ventaData.fields.precio_base || 0;
        const reserva = ventaData.fields.monto_reserva || 0;
        const inicial = ventaData.fields.monto_inicial || 0;

        const saldoVenta = precio - reserva - inicial - totalPagadoCuotas;

        const nuevoEstadoVenta = saldoVenta <= 0 ? "Pagada" : "Activa";

        await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/VENTAS/${venta_id}`,
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              fields: {
                estado_venta: nuevoEstadoVenta
              }
            })
          }
        );

        return {
          statusCode: 200,
          body: JSON.stringify({ success: true })
        };
      }

      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Acción PATCH inválida" })
      };
    }

    // ======================================================
    // ======================= POST ==========================
    // ======================================================

    if (event.httpMethod === "POST") {

      const body = JSON.parse(event.body || "{}");

      if (!body.action) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Action requerida" })
        };
      }

      // ==============================
      // CREAR CUOTA
      // ==============================
      if (body.action === "crear_cuota") {

        const res = await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/CUOTAS`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              fields: {
                venta: [body.venta_id],
                numero_cuota: Number(body.numero),
                monto_programado: Number(body.monto),
                fecha_vencimiento: body.fecha,
                estado_cuota: "Pendiente"
              }
            })
          }
        );

        const data = await res.json();
        if (!data.id) throw new Error("No se pudo crear cuota");

        return { statusCode: 200, body: JSON.stringify({ success: true }) };
      }

      // ==============================
      // CREAR RESERVA
      // ==============================
      if (body.action === "crear_reserva") {

        const hoy = new Date().toISOString().split("T")[0];

        // Validar unidad disponible
        const unidadCheck = await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/UNIDADES/${body.unidad_record_id}`,
          { headers }
        );

        const unidadData = await unidadCheck.json();

        if (!unidadData.fields || unidadData.fields.estado_unidad !== "Disponible") {
          return {
            statusCode: 400,
            body: JSON.stringify({
              error: "La unidad ya no está disponible."
            })
          };
        }

        // Verificar reserva activa
        const formula = `
          AND(
            FIND("${body.unidad_record_id}", ARRAYJOIN({unidad})) > 0,
            OR(
              {estado_reserva}="Solicitud",
              {estado_reserva}="Confirmada"
            )
          )
        `;

        const reservaCheckUrl =
          `https://api.airtable.com/v0/${BASE_ID}/RESERVAS?filterByFormula=${encodeURIComponent(formula)}`;

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

        // Crear reserva
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

        const reservaData = await reservaRes.json();
        if (!reservaData.id) throw new Error("Error creando reserva");

        // Bloquear unidad
        await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/UNIDADES/${body.unidad_record_id}`,
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              fields: { estado_unidad: "Reservado" }
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
      }

      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Action POST inválida" })
      };
    }

    return { statusCode: 405, body: "Method not allowed" };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};