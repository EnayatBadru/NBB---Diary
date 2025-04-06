import { auth } from "../firebaseConfig.js";
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

export function initForgotPassword() {
  const recoverForm = document.getElementById("recover-form");
  if (!recoverForm) {
    console.error("Formulário 'recover-form' não encontrado.");
    return;
  }

  recoverForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.getElementById("email").value.trim();

    try {
      await sendPasswordResetEmail(auth, email);
      showPopup("success", "Um email de recuperação foi enviado para " + email);
      setTimeout(() => {
        window.location.href = "in.html";
      }, 2000);
    } catch (error) {
      showPopup("error", "Erro ao enviar email de recuperação. Verifique o email e tente novamente.");
    }
  });
}

document.addEventListener("DOMContentLoaded", initForgotPassword);