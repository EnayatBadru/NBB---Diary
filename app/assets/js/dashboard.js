document.addEventListener('DOMContentLoaded', function () {
    // Seleção dos elementos
    const header = document.querySelector('#header');
    const btn = document.querySelector('.btn-mobile');
    const menu = document.querySelector('#menu');
    const body = document.querySelector('#body');

    // Verificar se os elementos existem antes de adicionar eventos
    if (btn && menu) {
        btn.addEventListener('click', active);
        menu.addEventListener('click', active);
    } else {
        console.error('Erro: .btn-mobile ou #menu não encontrados no HTML.');
    }

    // Função para alternar classes
    function active() {
        if (btn && menu) {
            btn.classList.toggle('active');
            menu.classList.toggle('active');
        }
    }

    // Evento de scroll com verificação
    if (header && body) {
        window.addEventListener('scroll', () => {
            header.classList.toggle('sticky', window.scrollY > 0);
            body.classList.toggle('sticky', window.scrollY > 0);
        });
    } else {
        console.error('Erro: #header ou #body não encontrados no HTML.');
    }
});