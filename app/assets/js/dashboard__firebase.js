import { initDashboard } from "./controllers/dashboardController.js";

// Tratamento global de erros
window.onerror = function (msg, url, lineNo, columnNo, error) {
  console.error(
    "Erro global:",
    msg,
    "em",
    url,
    "linha:",
    lineNo,
    "coluna:",
    columnNo,
    "erro:",
    error
  );
  return false;
};

document.addEventListener("DOMContentLoaded", function () {
  initDashboard();
});
