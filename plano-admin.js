const { AppCore, PlanoUtils } = window;
const isTouchDevice = PlanoUtils.isTouchDevice();
let mapaLotes = {};
let panzoom;
// 🔷 Leer parámetros de URL
const params = new URLSearchParams(window.location.search);
const proyecto = params.get("proyecto") || "VG";
const fase = params.get("fase") || "F1";

const vistas360Config = {
  "alp-f2": 1
};
// ===============================
// PROTECCIÓN DE ACCESO
// ===============================

const session = AppCore.requireSession({
  role: "admin",
  forbiddenRedirect: "/dashboard-agente.html"
});

if (!session) {
  throw new Error("Admin session required");
}

const decoded = session.decoded;

if (!proyecto || !fase) {
  document.getElementById("header").innerText = "Faltan parámetros proyecto y fase";
  throw new Error("Proyecto o fase no definidos");
}
const claveProyecto = `${proyecto.toLowerCase()}-${fase.toLowerCase()}`;
const h = AppCore.escapeHtml;
const sp = document.getElementById("selectProyecto");
const sf = document.getElementById("selectFase");

if (sp) sp.value = proyecto;
if (sf) sf.value = fase;
// Mostrar en header
const agenteNombre = decoded.nombre || "";

document.getElementById("header").innerText =
  `Proyecto: ${proyecto} | Fase: ${fase} | Agente: ${agenteNombre}`;

// Mini info compacta
function actualizarMiniInfo() {
  const resumenTexto = document.getElementById("resumen").innerText;
  document.getElementById("mini-info").innerText =
    `${proyecto} | ${fase}`;
}

actualizarMiniInfo();

// Toggle panel móvil
const toggleBtn = document.getElementById("toggle-panel");
const topContent = document.getElementById("top-content");

toggleBtn.addEventListener("click", () => {
  topContent.classList.toggle("active");

  toggleBtn.innerText =
    topContent.classList.contains("active") ? "▲" : "▼";
});
// 🔷 Cargar SVG dinámico según nombre
const nombreSVG = `${proyecto.toLowerCase()}-${fase.toLowerCase()}-ma.svg`;

fetch(`/planos/${nombreSVG}`)
  .then(res => {
    if (!res.ok) throw new Error("SVG no encontrado");
    return res.text();
  })
  .then(svg => {

    const planoContainer = document.getElementById("plano-container");
    planoContainer.innerHTML = svg;

    const element = PlanoUtils.getSvgElement();
    if (!element) {
      throw new Error("No se pudo inicializar el plano");
    }

panzoom = Panzoom(element, {

  maxScale: 12,
  minScale: 1,
  step: 0.3,

  contain: "outside",
pinchAndPan: true,
  canvas: true,

  animate: true,
  duration: 350
});
setTimeout(() => {

  panzoom.zoom(1.4, { animate:true });

},100);
let lastTap = 0;

element.addEventListener("touchend", function(e) {

  if(e.target.closest("path")) return;

  const now = Date.now();

  if (now - lastTap < 300) {
    panzoom.zoomIn();
  }

  lastTap = now;

});
element.addEventListener("panzoomchange", () => {
  PlanoUtils.updateSvgTextSize(element, panzoom);
});
    const wrapper = document.getElementById("plano-wrapper");

element.addEventListener('wheel', panzoom.zoomWithWheel);
element.parentElement.style.touchAction = "none";
    cargarEstados();
    simularPrecios();
actualizarPanelValorizacion();
  });

// 🔷 Cargar estados dinámicamente
function cargarEstados() {
  AppCore.apiRequest({
    query: { plano: 1, proyecto, fase },
    auth: true
  })
    .then(data => {

      mapaLotes = {};

      data.forEach(lote => {
        mapaLotes[lote.lote_id] = lote;

        const el = document.getElementById(lote.lote_id);
        if (!el) return;

        el.style.fill = PlanoUtils.getColorEstado(lote.estado) || "#cccccc";
      });

      activarEventos();
      aplicarFiltro();
      actualizarResumen(data);
      actualizarMiniInfo();
      actualizarPanelValorizacion();
    })
    .catch(error => {
      console.error("Error cargando estados del plano", error);
    });
}
function getColorEstado(estado) {
  return PlanoUtils.getColorEstado(estado);
}
const btnPresentacion = document.getElementById("btnPresentacion");
const modal360 = document.getElementById("modal360");
const cerrar360 = document.getElementById("cerrar360");

if (btnPresentacion && modal360 && cerrar360) {

  btnPresentacion.addEventListener("click", () => {
    modal360.classList.remove("hidden");
    document.body.classList.add("no-scroll");
    vistaActual = 1;
    iniciarVisor360();
  });

  cerrar360.addEventListener("click", () => {
    modal360.classList.add("hidden");
    document.body.classList.remove("no-scroll");
    if (viewer) viewer.destroy();
  });

}
function activarEventos() {

  const svg = PlanoUtils.getSvgElement();
  const tooltip = document.getElementById("tooltip");

  svg.addEventListener("click", (e) => {

    const target = e.target.closest("path");
    if (!target) return;

    const lote = mapaLotes[target.id];
    if (!lote) return;
if (target.classList.contains("bloqueado")) return;
    document.querySelectorAll(".selected").forEach((path) => path.classList.remove("selected"));
    target.classList.add("selected");
    limpiarManzana();
resaltarManzana(target.id);
target.style.filter = "brightness(1.1)";

    const mobileCard = document.getElementById("mobile-card");

mobileCard.innerHTML = `
<div style="width:40px;height:4px;background:#ccc;border-radius:4px;margin:0 auto 12px;"></div>

<span class="close-card" role="button" tabindex="0">✕</span>

<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
<h3>${h(lote.lote_id)}</h3>
<span style="
padding:4px 8px;
border-radius:20px;
font-size:11px;
font-weight:bold;
background:${getColorEstado(lote.estado)};
color:white;">
${h(String(lote.estado || "").toUpperCase())}
</span>
</div>

<div style="background:#f7f7f7;padding:10px;border-radius:12px;margin-bottom:10px;">
<p><strong>Precio:</strong> S/ ${AppCore.safeNumber(lote.precio).toLocaleString()}</p>
<p><strong>Área:</strong> ${lote.area} m²</p>
</div>

${
lote.cliente ? `
<div style="background:#eef2ff;padding:10px;border-radius:12px;margin-bottom:10px;">
<p><strong>Cliente:</strong> ${h(lote.cliente)}</p>
<p><strong>Agente:</strong> ${h(lote.agente)}</p>
<p><strong>Reserva:</strong> S/ ${AppCore.safeNumber(lote.monto_reserva).toLocaleString()}</p>
</div>
` : ""
}

${
(lote.descuento_solicitado || lote.sobreprecio) ? `
<div style="background:#fff7ed;padding:10px;border-radius:12px;margin-bottom:10px;">
<p><strong>Descuento:</strong> S/ ${AppCore.safeNumber(lote.descuento_solicitado).toLocaleString()}</p>
<p><strong>Sobreprecio:</strong> S/ ${AppCore.safeNumber(lote.sobreprecio).toLocaleString()}</p>

${lote.motivo_descuento ? `<p><strong>Motivo:</strong> ${h(lote.motivo_descuento)}</p>` : ""}
</div>
` : ""
}
<div class="card-actions"></div>
`;

    const closeButton = mobileCard.querySelector(".close-card");
    if (closeButton) {
      closeButton.addEventListener("click", cerrarCard);
      closeButton.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          cerrarCard();
        }
      });
    }

    const actionsContainer = mobileCard.querySelector(".card-actions");
    AppCore.clearElement(actionsContainer);

    if (lote.estado === "disponible") {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn-reservar";
      button.textContent = "Reservar ahora";
      button.addEventListener("click", () => irAReserva(lote.lote_id));
      actionsContainer.appendChild(button);
    }

    if (lote.estado === "reservado" && lote.reserva_id) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn-reservar";
      button.textContent = "Ver reserva";
      button.addEventListener("click", () => abrirReserva(lote.reserva_id));
      actionsContainer.appendChild(button);
    }

    mobileCard.classList.add("active");
    document.getElementById("plano-wrapper").classList.add("blur-bg");
    document.body.classList.add("no-scroll");

    setTimeout(() => {
      document.addEventListener("click", cerrarSiFuera);
    }, 100);
  });

  if (!isTouchDevice) {
    svg.addEventListener("mousemove", (e) => {

      const target = e.target.closest("path");
      if (!target) {
        tooltip.style.display = "none";
        return;
      }

      const lote = mapaLotes[target.id];
      if (!lote) return;
if (target.classList.contains("bloqueado")) {
  tooltip.style.display = "none";
  return;
}
      tooltip.style.display = "block";
      tooltip.innerHTML = `
<strong>${h(lote.lote_id)}</strong><br>
Estado: ${h(lote.estado)}<br>
Precio: S/ ${AppCore.safeNumber(lote.precio).toLocaleString()}
${lote.cliente ? `<br>Cliente: ${h(lote.cliente)}` : ""}
${lote.agente ? `<br>Agente: ${h(lote.agente)}` : ""}
`;

      tooltip.style.left = e.pageX + 15 + "px";
      tooltip.style.top = e.pageY + 15 + "px";
    });

    svg.addEventListener("mouseleave", () => {
      tooltip.style.display = "none";
    });
  }
}
function aplicarFiltro() {

  const activos = Array.from(
    document.querySelectorAll('#filtros input:checked')
  ).map(i => i.value);

  Object.values(mapaLotes).forEach(lote => {

    const el = document.getElementById(lote.lote_id);
    if (!el) return;

    if (activos.includes(lote.estado)) {
      el.style.opacity = "1";
      el.classList.remove("bloqueado");
    } else {
      el.style.opacity = "0.15";
      el.classList.add("bloqueado");
    }

  });
}

function cerrarCard() {
  document.getElementById("mobile-card").classList.remove("active");
  document.body.classList.remove("no-scroll");
  document.getElementById("plano-wrapper").classList.remove("blur-bg");
  PlanoUtils.clearSelection(PlanoUtils.getSvgElement());
}

function cerrarSiFuera(e) {
  const card = document.getElementById("mobile-card");
  if (!card.contains(e.target)) {
    cerrarCard();
    document.removeEventListener("click", cerrarSiFuera);
  }
}
document.querySelectorAll('#filtros input')
  .forEach(input => {
    input.addEventListener('change', aplicarFiltro);
  });
  document.getElementById("selectProyecto")
  .addEventListener("change", actualizarPlano);

document.getElementById("selectFase")
  .addEventListener("change", actualizarPlano);

function actualizarPlano() {
  const nuevoProyecto = document.getElementById("selectProyecto").value;
  const nuevaFase = document.getElementById("selectFase").value;

  window.location.href =
    `plano-admin.html?proyecto=${nuevoProyecto}&fase=${nuevaFase}`;
}
function actualizarResumen(data) {

  const conteo = {
    disponible: 0,
    reservado: 0,
    vendido: 0,
    financiado: 0
  };

  data.forEach(lote => {
    if (conteo[lote.estado] !== undefined) {
      conteo[lote.estado]++;
    }
  });

  document.getElementById("resumen").innerHTML = `
    Disponibles: ${conteo.disponible} |
    Reservados: ${conteo.reservado} |
    Vendidos: ${conteo.vendido} |
    Financiados: ${conteo.financiado}
  `;
}
document.getElementById("btnBuscarLote")
.addEventListener("click", buscarLote);

document.getElementById("inputLote")
.addEventListener("keypress", function(e){
  if(e.key === "Enter") buscarLote();
});

function buscarLote(){

  const input = document.getElementById("inputLote")
    .value.trim()
    .toUpperCase();

  if(!input) return;

  let loteId = null;

  // buscar coincidencia parcial
 loteId = Object.keys(mapaLotes)
  .find(id => id.toUpperCase().endsWith(input));
if(!loteId){
  alert("Lote no encontrado");
  return;
}

const partes = loteId.split("-");
const manzana = partes[2];

zoomManzana(manzana);

  const el = document.getElementById(loteId);

  if(!el){
    alert("Lote no encontrado en el plano");
    return;
  }

  el.click();

}
const inputLote = document.getElementById("inputLote");
const sugerencias = document.getElementById("sugerencias-lotes");

inputLote.addEventListener("input", mostrarSugerencias);

function mostrarSugerencias(){

  const texto = inputLote.value.trim().toUpperCase();

  sugerencias.innerHTML = "";

  if(texto.length < 1) return;

  const resultados = Object.keys(mapaLotes)
    .filter(id => id.toUpperCase().includes(texto))
    .slice(0,8);

  resultados.forEach(id=>{

    const div = document.createElement("div");
    div.className = "sugerencia-item";
    div.innerText = id;

    div.onclick = ()=>{

      const el = document.getElementById(id);

     if(el){
  el.dispatchEvent(new Event("click",{bubbles:true}));
}

      sugerencias.innerHTML = "";
      inputLote.value = "";
inputLote.blur();
    };

    sugerencias.appendChild(div);

  });

}
function resaltarManzana(loteId){
  const svg = PlanoUtils.getSvgElement();
  PlanoUtils.highlightManzana(svg, loteId);
}
function zoomManzana(manzana){
  PlanoUtils.zoomManzana(
    panzoom,
    document.getElementById("plano-wrapper"),
    PlanoUtils.getSvgElement(),
    manzana
  );
}
function limpiarManzana(){
  PlanoUtils.clearHighlightedManzana(PlanoUtils.getSvgElement());
}
function irAReserva(unidadId) {
  window.location.href = `/index.html?unidad_id=${encodeURIComponent(unidadId)}`;
}
function abrirReserva(reservaId) {
  window.open(`/admin.html?reserva=${encodeURIComponent(reservaId)}`, "_blank");
}
function logout() {
  AppCore.logout();
}
let viewer = null;
let vistaActual = 1;

function iniciarVisor360() {

  const totalVistas = vistas360Config[claveProyecto] || 1;
  const ruta = `/assets/360/${claveProyecto}/0${vistaActual}.jpg`;

  if (viewer) {
    viewer.destroy();
  }

  viewer = pannellum.viewer('visor360', {
    type: 'equirectangular',
    panorama: ruta,
    autoLoad: true,
    showZoomCtrl: true,
    showFullscreenCtrl: false,
    compass: false
  });

  document.getElementById("contador360").innerText =
    `Vista ${vistaActual} de ${totalVistas}`;
}
function simularPrecios(){

  const valor = parseFloat(document.getElementById("variacionPrecio").value);
  const tipo = document.getElementById("tipoVariacion").value;

  let totalActual = 0;
  let totalProyectado = 0;

  let disponiblesActual = 0;
  let disponiblesProyectado = 0;

  Object.values(mapaLotes).forEach(lote=>{

    const precio = Number(lote.precio || 0);

    totalActual += precio;

    if(lote.estado === "disponible"){

      disponiblesActual += precio;

      let nuevoPrecio = precio;

      if(tipo === "porcentaje"){
        nuevoPrecio = precio * (1 + valor/100);
      }

      if(tipo === "monto"){
        nuevoPrecio = precio + valor;
      }

      nuevoPrecio = Math.round(nuevoPrecio);

      lote.precio_simulado = nuevoPrecio;

      disponiblesProyectado += nuevoPrecio;

      totalProyectado += nuevoPrecio;

    }else{

      totalProyectado += precio;

    }

  });

  mostrarResumenProyeccion(
    totalActual,
    totalProyectado,
    disponiblesActual,
    disponiblesProyectado
  );

}
function mostrarResumenProyeccion(actual,total,dispActual,dispProyectado){

  const diferencia = total - actual;

  document.getElementById("proyeccionResumen").innerHTML = `
  
  <b>Total proyecto actual:</b> S/ ${actual.toLocaleString()} <br>
  <b>Total proyecto proyectado:</b> S/ ${total.toLocaleString()} <br>
  
  <hr>
  
  <b>Disponibles actuales:</b> S/ ${dispActual.toLocaleString()} <br>
  <b>Disponibles proyectados:</b> S/ ${dispProyectado.toLocaleString()} <br>
  
  <hr>
  
  <b>Diferencia estimada:</b>
  <span style="color:${diferencia>=0?"green":"red"}">
  S/ ${diferencia.toLocaleString()}
  </span>
  
  `;
}
function actualizarPanelValorizacion(){

let totalActual = 0;
let totalProyectado = 0;
let areaTotal = 0;

let valorDisponible = 0;

let totalLotes = 0;
let lotesVendidos = 0;

Object.values(mapaLotes).forEach(lote=>{

const precio = Number(lote.precio || 0);
const area = Number(lote.area || 0);

totalActual += precio;

const precioSimulado = lote.precio_simulado || precio;

totalProyectado += precioSimulado;

areaTotal += area;

totalLotes++;

if(lote.estado === "vendido"){
  lotesVendidos++;
}

if(lote.estado === "disponible"){
  valorDisponible += precio;
}

});

const diferencia = totalProyectado - totalActual;

const promedioM2 = areaTotal ? totalProyectado / areaTotal : 0;

const porcentajeVendido = totalLotes
  ? (lotesVendidos / totalLotes) * 100
  : 0;

document.getElementById("valActual").innerText =
"S/ " + totalActual.toLocaleString();

document.getElementById("valProyectado").innerText =
"S/ " + totalProyectado.toLocaleString();

document.getElementById("valGanancia").innerText =
"S/ " + diferencia.toLocaleString();

document.getElementById("valPromedioM2").innerText =
"S/ " + promedioM2.toFixed(2);

document.getElementById("valDisponible").innerText =
"S/ " + valorDisponible.toLocaleString();

document.getElementById("valVendido").innerText =
porcentajeVendido.toFixed(1) + "%";

}
