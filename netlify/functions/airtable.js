const { google } = require("googleapis");
const Busboy = require("busboy");

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
// SUBIR ARCHIVO
// ===============================
async function uploadFile(drive, name, buffer, mimeType, parentId) {
  await drive.files.create({
    requestBody: {
      name,
      parents: [parentId]
    },
    media: {
      mimeType,
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
  // POST (RESERVA CON DRIVE)
  // ================================
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const busboy = Busboy({ headers: event.headers });
  const fields = {};
  const files = [];

  return new Promise((resolve) => {

    busboy.on("field", (name, val) => {
      fields[name] = val;
    });

    busboy.on("file", (name, file, info) => {
      const { filename, mimeType } = info;
      const buffers = [];

      file.on("data", data => buffers.push(data));
      file.on("end", () => {
        files.push({
          fieldName: name,
          filename,
          mimeType,
          buffer: Buffer.concat(buffers)
        });
      });
    });

    busboy.on("finish", async () => {
      try {

        const drive = getDrive();

        // 1️⃣ Crear carpeta por unidad
        const unidadFolder = await createFolder(
          drive,
          fields.unidad_record_id,
          GOOGLE_DRIVE_ROOT_ID
        );

        const reservasFolder = await createFolder(
          drive,
          "01_RESERVAS",
          unidadFolder
        );

        const reservaFolder = await createFolder(
          drive,
          `RES-${Date.now()}`,
          reservasFolder
        );

        // 2️⃣ Subir archivos
        for (const file of files) {
          await uploadFile(
            drive,
            file.filename,
            file.buffer,
            file.mimeType,
            reservaFolder
          );
        }

        const hoy = new Date().toISOString().split("T")[0];

        // 3️⃣ Crear reserva en Airtable
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
                unidad: [fields.unidad_record_id],
                cliente: fields.cliente_actual,
                dni_cliente: fields.dni_cliente,
                telefono_cliente: fields.telefono_cliente,
                agente: fields.agente,
                monto_reserva: Number(fields.monto_reserva || 0),
                descuento_solicitado: Number(fields.descuento_solicitado || 0),
                motivo_descuento: fields.motivo_descuento,
                estado_reserva: "Solicitud",
                fecha_inicio: hoy,
                carpeta_drive_id: reservaFolder
              }
            })
          }
        );

        if (!reservaRes.ok) {
          const err = await reservaRes.text();
          throw new Error(err);
        }

        // 4️⃣ Marcar unidad como Reservado
        await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/UNIDADES/${fields.unidad_record_id}`,
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

        resolve({
          statusCode: 200,
          body: JSON.stringify({ success: true })
        });

      } catch (error) {
        console.error(error);
        resolve({
          statusCode: 500,
          body: JSON.stringify({
            error: "SERVER_ERROR",
            detail: error.message
          })
        });
      }
    });

    busboy.end(
      Buffer.from(
        event.body,
        event.isBase64Encoded ? "base64" : "binary"
      )
    );
  });
};