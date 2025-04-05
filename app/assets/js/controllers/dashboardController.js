import { subscribeToAuthChanges } from "../models/userModel.js";

export function initDashboard() {
  subscribeToAuthChanges((user) => {
    const signButton = document.getElementById("sign");
    const startButton = document.getElementById("start-button");

    if (!signButton || !startButton) {
      console.error("Botões 'sign' ou 'start-button' não encontrados.");
      return;
    }

    if (user) {
      signButton.textContent = "entrar";
      signButton.onclick = () => window.location.href = "splash.html";
      startButton.disabled = false;
      startButton.onclick = () => window.location.href = "splash.html";
    } else {
      signButton.textContent = "logar";
      signButton.onclick = () => window.location.href = "sign/in.html";
      startButton.disabled = false;
      startButton.onclick = () => window.location.href = "sign/in.html";
    }
  });
}