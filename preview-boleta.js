const params = new URLSearchParams(window.location.search);
const reservaId = params.get("id");

async function cargarDatos(){

  const token = localStorage.getItem("auth_token");

const res = await fetch("/.netlify/functions/airtable",{
  method:"POST",
  headers:{
    "Content-Type":"application/json",
    "Authorization": "Bearer " + token
  },
  body: JSON.stringify({
    action:"obtener_reserva",
    id:reservaId
  })
});

  const data = await res.json();

  document.getElementById("cliente").value = data.cliente || "";
  document.getElementById("dni").value = data.dni || "";
  document.getElementById("descripcion").value = "Separación de lote";
  document.getElementById("monto").value = data.monto_reserva || 0;

}

cargarDatos();
async function emitirBoleta(){

const cliente = document.getElementById("cliente").value;
const dni = document.getElementById("dni").value;
const descripcion = document.getElementById("descripcion").value;
const monto = document.getElementById("monto").value;

const token = localStorage.getItem("auth_token");

const res = await fetch("/.netlify/functions/airtable",{
  method:"POST",
  headers:{
    "Content-Type":"application/json",
    "Authorization": "Bearer " + token
  },
  body: JSON.stringify({
    action:"emitir_boleta",
    reservaId,
    cliente,
    dni,
    descripcion,
    monto
  })
});
const data = await res.json();
console.log("RESPUESTA NUBEFACT:");
console.log(data);
alert("Boleta generada: " + data.serie + "-" + data.numero);

//window.location.href="admin.html";

}
function cancelar(){
window.history.back();
}