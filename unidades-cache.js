
let unidadesMap = {};

async function cargarUnidades() {

  try {

    const res = await fetch('/.netlify/functions/airtable?unidades=1');
    const data = await res.json();

    data.forEach(u => {
      unidadesMap[u.codigo] = u;
    });

    completarPrecios();

  } catch (err) {
    console.error("Error cargando unidades", err);
  }

}

function completarPrecios() {

  // ===== DASHBOARD AGENTE =====
  const cards = document.querySelectorAll(".reserva-card");

  cards.forEach(card => {

    const body = card.querySelector(".reserva-body");

    if (!body) return;

    const texto = body.innerText;

    const match = texto.match(/Unidad:\s*(.*)/);

    if (!match) return;

    const codigoUnidad = match[1].trim();

    const unidad = unidadesMap[codigoUnidad];

    if (!unidad) return;

    const precio = unidad.precio || 0;

    body.querySelectorAll("div").forEach(div => {

      if (div.innerText.includes("Precio Lista")) {
        div.innerText = "Precio Lista: S/ " + precio.toLocaleString();
      }

    });

  });


  // ===== PANEL ADMIN =====
  const adminCards = document.querySelectorAll(".reserva-body-pro");

  adminCards.forEach(card => {

    const unidadDiv = card.querySelector(".reserva-item strong");

    if (!unidadDiv) return;

    const codigoUnidad = unidadDiv.innerText.trim();

    const unidad = unidadesMap[codigoUnidad];

    if (!unidad) return;

    const precio = unidad.precio || 0;

    const items = card.querySelectorAll(".reserva-item");

    items.forEach(item => {

      const label = item.querySelector("span");

      if (label && label.innerText.includes("Precio Lista")) {

        const strong = item.querySelector("strong");

        if (strong) {
          strong.innerText = "S/ " + precio.toLocaleString();
        }

      }

    });

  });

}

function iniciarFixPrecios() {

  setTimeout(() => {
    cargarUnidades();
  }, 800);

}

document.addEventListener("DOMContentLoaded", iniciarFixPrecios);