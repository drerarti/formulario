const { google } = require("googleapis");

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = process.env.AIRTABLE_BASE;
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;
const GOOGLE_DRIVE_ROOT_ID = process.env.GOOGLE_DRIVE_ROOT_ID;

const fetch = global.fetch;

// ===============================
// AUTH GOOGLE
// ===============================
function getDrive() {
  const auth = new google.auth.JWT(
    GOOGLE_CLIENT_EMAIL,
    null,
    GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    ["https://www.googleapis.com/auth/drive"]
  );

  return google.drive({ version: "v3", auth });
}

// ===============================
// CREAR CARPETA
// ===============================
async function createFolder(drive, name, parentId) {
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId]
    },
    fields: "id"
  });
  return res.data.id;
}

// ===============================
// SUBIR ARCHIVO BASE64
// ===============================
async function uploadBase64File(drive, fileData, parentId) {
  if (!fileData) return;

  const buffer = Buffer.from(fileData.base64, "base64");

  await drive.files.create({
    requestBody: {
      name: fileData.filename,
      parents: [parentId]
    },
    media: {
      mimeType: fileData.mimeType,
      body: buffer
    }
  });
}

// ===============================
// HANDLER
// ===============================
exports.handler = async (event) => {

  // ================================
  // GET UNIDADES DISPONIBLES
  // ================================
  if (event.httpMethod === "GET") {
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
        allRecords = allRecords.concat(data.records);
        offset = data.offset;

      } while (offset);

      const results = allRecords.map(r => ({
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

  // ================================
  // POST CREAR RESERVA
  // ================================
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {

    const body = JSON.parse(event.body);
    const drive = getDrive();

    // 1️⃣ Crear carpeta de unidad
    const unidadFolder = await createFolder(
      drive,
      body.unidad_record_id,
      GOOGLE_DRIVE_ROOT_ID
    );

    // 2️⃣ Crear 01_RESERVAS
    const reservasFolder = await createFolder(
      drive,
      "01_RESERVAS",
      unidadFolder
    );

    // 3️⃣ Crear carpeta específica de reserva
    const reservaFolder = await createFolder(
      drive,
      `RES-${Date.now()}`,
      reservasFolder
    );

    // 4️⃣ Subir archivos
    await uploadBase64File(drive, body.files.dni_frontal, reservaFolder);
    await uploadBase64File(drive, body.files.dni_reverso, reservaFolder);
    await uploadBase64File(drive, body.files.voucher_reserva, reservaFolder);
    await uploadBase64File(drive, body.files.documento_adicional, reservaFolder);

    const hoy = new Date().toISOString().split("T")[0];

    // 5️⃣ Crear reserva en Airtable
    const reservaRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/RESERVAS`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${AIRTABLE_TOKEN}`,
          "Content-Type": "application/json"
        },
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
            fecha_inicio: hoy,
            carpeta_drive_id: reservaFolder
          }
        })
      }
    );

    if (!reservaRes.ok) {
      const text = await reservaRes.text();
      throw new Error(text);
    }

    // 6️⃣ Marcar unidad como Reservado
    await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/UNIDADES/${body.unidad_record_id}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${AIRTABLE_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fields: {
            estado_unidad: "Reservado",
            fecha_reserva: hoy
          }
        })
      }
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "SERVER_ERROR",
        detail: error.message
      })
    };
  }
};