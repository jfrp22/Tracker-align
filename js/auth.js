document.addEventListener('DOMContentLoaded', function() {
    // Inicializar el Auth Guard
    if (typeof AuthGuard !== 'undefined') {
        AuthGuard.init();
    }
    
    // Configurar el formulario de login
    const loginForm = document.getElementById('loginForm');
    
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const username = document.getElementById('username').value.trim();
            const password = document.getElementById('password').value.trim();
            
            if (authenticate(username, password)) {
                document.getElementById('errorMsg').textContent = "Acceso concedido...";
                document.getElementById('errorMsg').className = "success";
                if (document.querySelector('#loginForm button')) {
                    document.querySelector('#loginForm button').style.backgroundColor = "#2a9d8f";
                }
                
                setTimeout(() => {
                    window.location.hash = 'dashboard';
                    if (typeof AuthGuard !== 'undefined') {
                        AuthGuard.checkAccess();
                    }
                }, 800);
            } else {
                document.getElementById('errorMsg').textContent = "Credenciales incorrectas";
                document.getElementById('errorMsg').className = "error";
                this.classList.add('shake');
                setTimeout(() => this.classList.remove('shake'), 500);
            }
        });
    }
});

function authenticate(username, password) {
    // Contraseña: admin123 (hasheada con SHA-256)
    const hashedPassword = CryptoJS.SHA256(password).toString();
    const isValid = username === "admin" && 
                   hashedPassword === "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9";
    
    if(isValid) {
        localStorage.setItem('authenticated', 'true');
        localStorage.setItem('authTimestamp', Date.now());
        localStorage.setItem('username', username);
    }
    return isValid;
}
