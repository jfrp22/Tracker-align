document.addEventListener('DOMContentLoaded', function() {
    // Si ya está autenticado, redirigir a la página principal
    if (checkAuth()) {
        window.location.href = "main.html";
    }
    
    const loginForm = document.getElementById('loginForm');
    
    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();
        
        if (authenticate(username, password)) {
            document.getElementById('errorMsg').textContent = "Acceso concedido...";
            document.getElementById('errorMsg').style.color = "#2a9d8f";
            document.querySelector('button').style.backgroundColor = "#2a9d8f";
            
            setTimeout(() => {
                window.location.href = "main.html";
            }, 800);
        } else {
            document.getElementById('errorMsg').textContent = "Credenciales incorrectas";
            document.getElementById('errorMsg').style.color = "#e63946";
            this.classList.add('shake');
            setTimeout(() => this.classList.remove('shake'), 500);
        }
    });
});

function checkAuth() {
    const authTimestamp = localStorage.getItem('authTimestamp');
    const isAuthenticated = localStorage.getItem('authenticated') === 'true';
    
    // Verificar si la autenticación es reciente (menos de 8 horas)
    const isRecent = authTimestamp && (Date.now() - parseInt(authTimestamp)) < (8 * 60 * 60 * 1000);
    
    return isAuthenticated && isRecent;
}

function authenticate(username, password) {
    const hashedPassword = CryptoJS.SHA256(password).toString();
    const isValid = username === "admin" && 
                   hashedPassword === "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9";
    
    if(isValid) {
        localStorage.setItem('authenticated', 'true');
        localStorage.setItem('authTimestamp', Date.now());
    }
    return isValid;
}
