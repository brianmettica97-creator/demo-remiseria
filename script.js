/* =========================
   CONFIGURACIÓN
========================= */

// IMPORTANTE:
// Reemplazá este número por el WhatsApp real.
// Formato internacional SIN +, espacios ni guiones.

const WHATSAPP_NUMBER = "5491112345678";


/* =========================
   CARRUSEL
========================= */

const track = document.querySelector(".carousel-track");
const cards = document.querySelectorAll(".vehicle-card");

const prevButton = document.querySelector(".carousel-button.prev");
const nextButton = document.querySelector(".carousel-button.next");

const dotsContainer = document.querySelector(".carousel-dots");

let currentSlide = 0;

let autoplay;


/* Crear indicadores */

cards.forEach((card, index) => {

    const dot = document.createElement("button");

    dot.classList.add("carousel-dot");

    dot.setAttribute(
        "aria-label",
        `Ir al vehículo ${index + 1}`
    );

    dot.addEventListener("click", () => {

        currentSlide = index;

        updateCarousel();

        restartAutoplay();

    });

    dotsContainer.appendChild(dot);

});


const dots = document.querySelectorAll(".carousel-dot");


/* Actualizar carrusel */

function updateCarousel() {

    track.style.transform =
        `translateX(-${currentSlide * 100}%)`;

    dots.forEach((dot, index) => {

        dot.classList.toggle(
            "active",
            index === currentSlide
        );

    });

}


/* Siguiente */

function nextSlide() {

    currentSlide++;

    if (currentSlide >= cards.length) {
        currentSlide = 0;
    }

    updateCarousel();

}


/* Anterior */

function previousSlide() {

    currentSlide--;

    if (currentSlide < 0) {
        currentSlide = cards.length - 1;
    }

    updateCarousel();

}


/* Eventos */

nextButton.addEventListener(
    "click",
    () => {

        nextSlide();

        restartAutoplay();

    }
);


prevButton.addEventListener(
    "click",
    () => {

        previousSlide();

        restartAutoplay();

    }
);


/* Autoplay */

function startAutoplay() {

    autoplay = setInterval(
        nextSlide,
        5500
    );

}


function restartAutoplay() {

    clearInterval(autoplay);

    startAutoplay();

}


updateCarousel();

startAutoplay();


/* =========================
   PAUSAR AUTOPLAY
   AL PASAR EL MOUSE
========================= */

const carousel = document.querySelector(".carousel");

carousel.addEventListener(
    "mouseenter",
    () => clearInterval(autoplay)
);

carousel.addEventListener(
    "mouseleave",
    () => startAutoplay()
);


/* =========================
   BOTONES DE VEHÍCULOS
========================= */

const vehicleButtons =
    document.querySelectorAll(".vehicle-button");

const vehicleSelect =
    document.querySelector("#vehicle");


vehicleButtons.forEach(button => {

    button.addEventListener(
        "click",
        () => {

            const vehicle =
                button.dataset.vehicle;

            vehicleSelect.value = vehicle;

            document
                .querySelector("#cotizacion")
                .scrollIntoView({
                    behavior: "smooth"
                });

        }
    );

});


/* =========================
   FORMULARIO WHATSAPP
========================= */

const form =
    document.querySelector("#quoteForm");


form.addEventListener(
    "submit",
    function(event) {

        event.preventDefault();


        const name =
            document.querySelector("#name").value.trim();

        const phone =
            document.querySelector("#phone").value.trim();

        const origin =
            document.querySelector("#origin").value.trim();

        const destination =
            document.querySelector("#destination").value.trim();

        const date =
            document.querySelector("#date").value;

        const time =
            document.querySelector("#time").value;

        const passengers =
            document.querySelector("#passengers").value;

        const vehicle =
            document.querySelector("#vehicle").value;

        const trip =
            document.querySelector(
                'input[name="trip"]:checked'
            ).value;

        const comments =
            document.querySelector("#comments").value.trim();


        /* Convertir fecha */

        let formattedDate = date;

        if (date) {

            const parts = date.split("-");

            formattedDate =
                `${parts[2]}/${parts[1]}/${parts[0]}`;

        }


        /* Crear mensaje */

        let message = `Hola, quiero solicitar una cotización.

*DATOS DEL CLIENTE*

Nombre: ${name}
WhatsApp: ${phone}

*DATOS DEL VIAJE*

Origen: ${origin}
Destino: ${destination}

Fecha: ${formattedDate}
Hora: ${time}

Pasajeros: ${passengers}
Vehículo: ${vehicle}
Modalidad: ${trip}`;


        if (comments) {

            message += `

*COMENTARIOS*

${comments}`;

        }


        /* Crear URL */

        const whatsappURL =
            `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;


        /* Abrir WhatsApp */

        window.open(
            whatsappURL,
            "_blank"
        );

    }
);


/* =========================
   FECHA MÍNIMA
========================= */

const dateInput =
    document.querySelector("#date");


const today =
    new Date().toISOString().split("T")[0];


dateInput.min = today;


/* =========================
   MENÚ MOBILE
========================= */

const menuToggle =
    document.querySelector(".menu-toggle");

const menu =
    document.querySelector(".menu");


menuToggle.addEventListener(
    "click",
    () => {

        menu.classList.toggle("mobile-open");

    }
);