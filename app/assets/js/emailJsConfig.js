try {
  emailjs.init("JbA_G0oiFC5nNy-3K");
  console.log("EmailJS inicializado com sucesso!");
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
          alert("Mensagem enviada com sucesso!");
          contactForm.reset();
          submitButton.disabled = false;
        })
        .catch((error) => {
          console.error("Erro ao enviar mensagem:", error);
          alert("Erro ao enviar mensagem. Tente novamente.");
          submitButton.disabled = false;
        });
    });
  }
});
