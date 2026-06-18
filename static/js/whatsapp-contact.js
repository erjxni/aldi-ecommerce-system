const STORE_WHATSAPP_NUMBER = "491234567890";
const DEFAULT_MESSAGE = "Hello, I would like to ask about store updates.";

function buildWhatsAppLink() {
    const encodedMessage = encodeURIComponent(DEFAULT_MESSAGE);
    return `https://wa.me/${STORE_WHATSAPP_NUMBER}?text=${encodedMessage}`;
}

function createWhatsAppButton() {
    const existingButton = document.querySelector(".whatsapp-contact-button");

    if (existingButton) {
        return;
    }

    const button = document.createElement("a");
    button.className = "whatsapp-contact-button";
    button.href = buildWhatsAppLink();
    button.target = "_blank";
    button.rel = "noopener noreferrer";
    button.setAttribute("aria-label", "Contact the store on WhatsApp");

    button.innerHTML = `
        <span class="whatsapp-contact-icon" aria-hidden="true">💬</span>
        <span class="whatsapp-contact-text">WhatsApp</span>
    `;

    document.body.appendChild(button);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createWhatsAppButton);
} else {
    createWhatsAppButton();
}