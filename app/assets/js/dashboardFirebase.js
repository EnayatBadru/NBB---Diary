import { initDashboard } from "./controllers/dashboardController.js";

document.addEventListener("DOMContentLoaded", () => {
  // console.log("Iniciando dashboard...");
  try {
    initDashboard();
  } catch (error) {
    console.error("Erro ao iniciar dashboard:", error);
  }
});