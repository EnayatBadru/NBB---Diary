document.addEventListener("DOMContentLoaded", function () {
  const header = document.querySelector("#header");
  const btn = document.querySelector(".btn-mobile");
  const menu = document.querySelector("#menu");
  const body = document.querySelector("#body");

  if (btn && menu) {
    btn.addEventListener("click", active);
    menu.addEventListener("click", active);
  } else {
    console.error("Erro: .btn-mobile ou #menu não encontrados no HTML.");
  }

  function active() {
    if (btn && menu) {
      btn.classList.toggle("active");
      menu.classList.toggle("active");
    }
  }

  if (header && body) {
    window.addEventListener("scroll", () => {
      header.classList.toggle("sticky", window.scrollY > 0);
      body.classList.toggle("sticky", window.scrollY > 0);
    });
  } else {
    console.error("Erro: #header ou #body não encontrados no HTML.");
  }
});
