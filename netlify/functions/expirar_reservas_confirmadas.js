const fetch = global.fetch;

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = process.env.AIRTABLE_BASE;

exports.handler = async () => {

  const headers = {
    Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    "Content-Type": "application/json"
  };

  try {

    const hoy = new Date().toISOString().split("T")[0];

    // Buscar reservas confirmadas vencidas
    const formula = `
      AND(
        {estado_reserva}="Confirmada",
        {fecha_vigencia_fin} < "${hoy}"
      )
    `;

    const url = `https://api.airtable.com/v0/${BASE_ID}/RESERVAS?filterByFormula=${encodeURIComponent(formula)}`;

    const response = await fetch(url, { headers });
    const data = await response.json();

    for (const record of data.records) {

      const reservaId = record.id;
      const unidadRecordId = record.fields.unidad ? record.fields.unidad[0] : null;

      // Cambiar estado a Vencida
      await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/RESERVAS/${reservaId}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            fields: {
              estado_reserva: "Vencida"
            }
          })
        }
      );

      // Liberar unidad
      if (unidadRecordId) {
        await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/UNIDADES/${unidadRecordId}`,
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
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, expiradas: data.records.length })
    };

  } catch (error) {

    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };

  }
};