(function () {
  const controller = window.PlanoExperience?.create({
    role: "admin",
    defaultProject: "VG",
    defaultPhase: "F1",
    allowExport: false,
    sessionOptions: {
      role: "admin",
      forbiddenRedirect: "/dashboard-agente.html"
    }
  });

  if (!controller) return;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => controller.init(), { once: true });
  } else {
    controller.init();
  }
})();
