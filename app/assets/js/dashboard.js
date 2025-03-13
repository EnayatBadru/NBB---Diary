const header = document.querySelector('#header');
const btn = document.querySelector('.btn-mobile');
const  menu = document.querySelector('#menu');
const  body = document.querySelector('#body');

btn.addEventListener('click', active)
menu.addEventListener('click', active)

function active(){
    btn.classList.toggle('active');
    menu.classList.toggle('active');
}

window.addEventListener('scroll', ()=>{
    header.classList.toggle('sticky', window.scrollY > 0);
    body.classList.toggle('sticky', window.scrollY > 0);
})
