import { showPopup } from "../popup.js";
import {
  loginWithEmailAndPassword,
  loginWithGoogle,
} from "../models/userModel.js";

export function initSignIn() {
  const loginForm = document.querySelector("form");
  const emailInput = document.getElementById("user");
  const passwordInput = document.getElementById("password");
  const googleLoginButton = document.getElementById("google-login");

  if (!loginForm || !emailInput || !passwordInput || !googleLoginButton) {
    console.error("Elementos do formulário de login não encontrados.");
    return;
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
      showPopup("error", "Por favor, preencha todos os campos.");
      return;
    }

    try {
      await loginWithEmailAndPassword(email, password);
      // showPopup("success", "Login efetuado com sucesso!");
      setTimeout(() => {
        window.location.href = "../splash.html";
      }, 2000);
    } catch (error) {
      console.error("Erro ao fazer login:", error);
      showPopup("error", "Erro ao fazer login. Verifique seu email e senha.");
    }
  });

  googleLoginButton.addEventListener("click", async () => {
    try {
      await loginWithGoogle();
      showPopup("success", "Login com Google efetuado com sucesso!");
      setTimeout(() => {
        window.location.href = "../splash.html";
      }, 2000);
    } catch (error) {
      console.error("Erro ao fazer login com Google:", error);
      showPopup("error", "Erro ao fazer login com Google. Tente novamente.");
    }
  });
}
