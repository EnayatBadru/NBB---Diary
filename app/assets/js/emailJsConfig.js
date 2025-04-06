try {
  emailjs.init("JbA_G0oiFC5nNy-3K");
  console.log("iniciado o EmailJS com sucesso:");
} catch (error) {
  console.error("Erro ao inicializar o EmailJS:", error);
}

document.addEventListener("DOMContentLoaded", () => {
  const contactForm = document.getElementById("contact-form");
  if (contactForm) {
    contactForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const submitButton = contactForm.querySelector("#submit-button");
      submitButton.disabled = true;

      emailjs
        .sendForm("service_ek92wsg", "template_nlh8hkq", contactForm)
        .then(() => {
          showPopup("success", "Mensagem enviada com sucesso!");
          contactForm.reset();
          submitButton.disabled = false;
        })
        .catch((error) => {
          console.error("Erro ao enviar mensagem:", error);
          showPopup("error", "Erro ao enviar mensagem. Tente novamente mais tarde.");
          submitButton.disabled = false;
        });
    });
  }
});