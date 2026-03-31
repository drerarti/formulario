(function () {
  const controller = window.PlanoExperience?.create({
    role: "agente",
    defaultProject: "VG",
    defaultPhase: "F1",
    allowExport: true,
    sessionOptions: {}
  });

  if (!controller) return;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => controller.init(), { once: true });
  } else {
    controller.init();
  }
})();
