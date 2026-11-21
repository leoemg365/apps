const versionActual = "1.5"; // Cambia esto cada vez que actualices tu web
const modal = document.getElementById("modalActualizaciones");
const btnCerrar = document.getElementById("cerrarActualizacion");

window.addEventListener("load", () => {
    if (!modal) return;
    // Verificamos si el usuario ya vio esta versión específica
    const ultimaVersionVista = localStorage.getItem("versionVista");

    if (ultimaVersionVista !== versionActual) {
        try { modal.showModal(); } catch (e) {}
    }
});

if (btnCerrar && modal) {
    btnCerrar.onclick = () => {
        modal.close(); // Cierra el modal
        localStorage.setItem("versionVista", versionActual); // Guarda que ya se vio
    };
}
