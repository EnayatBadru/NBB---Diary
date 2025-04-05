import { signOutUser } from "../models/userModel.js";

export function initCustomerIndex() {
  const signOutBtn = document.querySelector(".sign-out");
  if (!signOutBtn) {
    console.error("Botão 'sign-out' não encontrado.");
    return;
  }

  signOutBtn.addEventListener("click", async () => {
    try {
      await signOutUser();
      window.location.href = "../splash.html";
    } catch (error) {
      alert("Erro ao fazer logout: " + error.message);
    }
  });
}

document.addEventListener("DOMContentLoaded", initCustomerIndex);
