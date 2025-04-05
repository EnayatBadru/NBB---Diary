import { loginWithEmailAndPassword, loginWithGoogle } from "../models/userModel.js";

export function initSignIn() {
  const loginForm = document.querySelector("form");
  const emailInput = document.getElementById("user");
  const passwordInput = document.getElementById("password");
  const googleLoginButton = document.getElementById("google-login");

  // Verifica se os elementos do formulário existem
  if (!loginForm || !emailInput || !passwordInput || !googleLoginButton) {
    console.error("Elementos do formulário de login não encontrados.");
    return;
  }

  // Evento de envio do formulário para login com e-mail e senha
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    // Validação dos campos
    if (!email || !password) {
      alert("Por favor, preencha todos os campos.");
      return;
    }

    try {
      await loginWithEmailAndPassword(email, password);
      alert("Login efetuado com sucesso!");
      window.location.href = "../splash.html";
    } catch (error) {
      alert("Erro ao fazer login: " + error.message);
    }
  });

  // Evento de clique para login com Google
  googleLoginButton.addEventListener("click", async () => {
    try {
      await loginWithGoogle();
      alert("Login com Google efetuado com sucesso!");
      window.location.href = "../splash.html";
    } catch (error) {
      alert("Erro ao fazer login com Google: " + error.message);
    }
  });
}