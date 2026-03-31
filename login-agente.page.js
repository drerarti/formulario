const { AppCore } = window;

async function login() {
  const codigo = document
    .getElementById("codigo")
    .value
    .trim()
    .toLowerCase();

  if (!codigo) {
    alert("Ingrese codigo");
    return;
  }

  try {
    const data = await AppCore.apiRequest({
      query: {
        validar_agente: 1,
        codigo
      }
    });

    if (!data.valido || !data.token) {
      alert("Codigo invalido");
      return;
    }

    localStorage.setItem("auth_token", data.token);

    const decoded = AppCore.decodeToken(data.token);
    if (!decoded) {
      throw new Error("Token invalido");
    }

    window.location.href = AppCore.roleHome(decoded);
  } catch (error) {
    alert(AppCore.getErrorMessage(error, "No se pudo iniciar sesion."));
  }
}

window.login = login;
