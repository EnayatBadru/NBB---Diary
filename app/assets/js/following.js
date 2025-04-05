document.addEventListener("DOMContentLoaded", () => {
  const spacingButton = document.querySelector(".spacing");
  if (spacingButton) {
    spacingButton.addEventListener("click", () => {
      window.location.href = "splash.html";
    });
  } else {
    console.error("Botão com classe 'spacing' não encontrado.");
  }
});
