// Función mejorada para verificar autenticación
function checkAuth() {
    const authTimestamp = localStorage.getItem('authTimestamp');
    const isAuthenticated = localStorage.getItem('authenticated') === 'true';
    
    // Verificar si la autenticación es reciente (menos de 8 horas)
    const isRecent = authTimestamp && (Date.now() - parseInt(authTimestamp)) < (8 * 60 * 60 * 1000);
    
    return isAuthenticated && isRecent;
}

document.addEventListener('DOMContentLoaded', function() {
    if (!checkAuth()) {
        // Limpiar y redirigir si no está autenticado
        localStorage.removeItem('authenticated');
        localStorage.removeItem('authTimestamp');
        window.location.href = "login.html";
    }
    
    // Configurar el botón de logout
    document.getElementById('logoutBtn').addEventListener('click', logout);
});

function logout() {
    localStorage.removeItem('authenticated');
    localStorage.removeItem('authTimestamp');
    window.location.href = "login.html";
}
