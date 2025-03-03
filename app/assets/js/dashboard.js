const header = document.querySelector('#header');
const btn = document.querySelector('.btn-mobile');
const  menu = document.querySelector('#menu');

btn.addEventListener('click', ()=>{
    btn.classList.toggle('active');
    menu.classList.toggle('active');
})

window.addEventListener('scroll', ()=>{
    header.classList.toggle('sticky', window.scrollY > 0);
})