// Verificación de autenticación para todas las páginas
function checkAuth() {
    const authTimestamp = localStorage.getItem('authTimestamp');
    const isAuthenticated = localStorage.getItem('authenticated') === 'true';
    
    // Verificar si la autenticación es reciente (menos de 8 horas)
    const isRecent = authTimestamp && (Date.now() - parseInt(authTimestamp)) < (8 * 60 * 60 * 1000);
    
    return isAuthenticated && isRecent;
}

// Proteger página - redirige si no está autenticado
function protectPage() {
    // No proteger la página de login
    if (window.location.pathname.endsWith('login.html')) {
        // Si ya está autenticado y trata de acceder al login, redirigir al main
        if (checkAuth()) {
            window.location.href = "main.html";
        }
        return;
    }
    
    // Para todas las demás páginas, verificar autenticación
    if (!checkAuth()) {
        // Limpiar y redirigir si no está autenticado
        localStorage.removeItem('authenticated');
        localStorage.removeItem('authTimestamp');
        window.location.href = "login.html";
    }
}

// Ejecutar protección cuando se carga el DOM
document.addEventListener('DOMContentLoaded', protectPage);
