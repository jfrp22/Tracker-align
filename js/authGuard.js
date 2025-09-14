class AuthGuard {
    static init() {
        // Configurar la protección de rutas
        this.setupNavigationGuard();
        
        // Verificar estado de autenticación al cargar
        this.checkAuthState();
    }
    
    static setupNavigationGuard() {
        // Interceptar cambios de hash (navegación)
        window.addEventListener('hashchange', () => {
            this.checkAccess();
        });
        
        // También verificar al cargar la página
        window.addEventListener('load', () => {
            this.checkAccess();
        });
    }
    
    static checkAccess() {
        const isAuthenticated = this.isAuthenticated();
        const hash = window.location.hash.substring(1) || 'login';
        
        // Si no está autenticado y trata de acceder a páginas protegidas
        if (!isAuthenticated && hash !== 'login') {
            window.location.hash = 'login';
            this.showPage('loginPage');
            return false;
        }
        
        // Si está autenticado y trata de acceder al login
        if (isAuthenticated && hash === 'login') {
            window.location.hash = 'dashboard';
            this.showPage('dashboardPage');
            return false;
        }
        
        // Mostrar la página correspondiente al hash
        if (isAuthenticated) {
            if (hash === 'dashboard') {
                this.showPage('dashboardPage');
            } else if (hash === 'profile') {
                this.showPage('profilePage');
                if (document.getElementById('lastAccess')) {
                    document.getElementById('lastAccess').textContent = new Date().toLocaleString();
                }
            }
        }
        
        // Actualizar la navegación
        this.updateNavigation();
        
        return true;
    }
    
    static showPage(pageId) {
        // Ocultar todas las páginas
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });
        
        // Mostrar la página solicitada
        const pageElement = document.getElementById(pageId);
        if (pageElement) {
            pageElement.classList.add('active');
        }
    }
    
    static isAuthenticated() {
        // Verificar si existe la bandera de autenticación en localStorage
        const authenticated = localStorage.getItem('authenticated');
        const authTimestamp = localStorage.getItem('authTimestamp');
        
        // Verificar también si la autenticación es reciente (menos de 8 horas)
        if (authTimestamp) {
            const now = Date.now();
            const eightHours = 8 * 60 * 60 * 1000;
            
            if (now - parseInt(authTimestamp) > eightHours) {
                // La autenticación ha expirado
                this.logout();
                return false;
            }
        }
        
        return authenticated === 'true';
    }
    
    static updateNavigation() {
        const isAuthenticated = this.isAuthenticated();
        const navigation = document.getElementById('navigation');
        const userInfo = document.getElementById('userInfo');
        
        if (!navigation || !userInfo) return;
        
        if (isAuthenticated) {
            // Mostrar navegación para usuarios autenticados
            navigation.innerHTML = `
                <ul>
                    <li><a href="#dashboard">Dashboard</a></li>
                    <li><a href="#profile">Perfil</a></li>
                    <li><a href="#" id="logoutLink">Cerrar Sesión</a></li>
                </ul>
            `;
            
            const username = localStorage.getItem('username') || 'Usuario';
            userInfo.innerHTML = `
                <i class="fas fa-user-circle"></i>
                <span>${username}</span>
            `;
            
            // Agregar evento para logout
            const logoutLink = document.getElementById('logoutLink');
            if (logoutLink) {
                logoutLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.logout();
                });
            }
        } else {
            // Mostrar solo login para usuarios no autenticados
            navigation.innerHTML = `
                <ul>
                    <li><a href="#login">Login</a></li>
                </ul>
            `;
            
            userInfo.innerHTML = '';
        }
    }
    
    static logout() {
        // Limpiar datos de autenticación
        localStorage.removeItem('authenticated');
        localStorage.removeItem('authTimestamp');
        localStorage.removeItem('username');
        
        // Redirigir al login
        window.location.hash = 'login';
        this.checkAccess();
    }
    
    static checkAuthState() {
        // Verificar el estado de autenticación al cargar
        const isAuthenticated = this.isAuthenticated();
        if (isAuthenticated) {
            this.updateNavigation();
        }
    }
}

// Inicializar el AuthGuard cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
    AuthGuard.init();
});
