// Lista de brokers disponibles (usando la misma del GPS)
const availableBrokers = [
    {
        url: "wss://test.mosquitto.org:8081/mqtt",
        name: "Mosquitto Público 1"
    },
    {
        url: "wss://broker.emqx.io:8084/mqtt",
        name: "EMQX Público"
    },
    {
        url: "ws://localhost:9001",
        name: "Broker Local"
    }
];

// Variables globales
let client = null;
let currentBrokerIndex = 0;
let autoReconnectEnabled = true;
let brokerSwitchTimeout = null;

// Tópicos MQTT
const controlTopic = "iotlab/pan-tilt/control";
const statusTopic = "iotlab/pan-tilt/status";

// Elementos del DOM
const connStatus = document.getElementById("connection-status");
const panValue = document.querySelector('.axis-group:nth-child(1) .axis-value');
const tiltValue = document.querySelector('.axis-group:nth-child(2) .axis-value');
const speedValue = document.querySelector('.speed-value');
const speedSlider = document.querySelector('.speed-slider');

// Valores actuales
let currentPan = 0; // -90 a +90 grados
let currentTilt = 0; // -30 a +45 grados
let currentSpeed = 50; // 1-100%

// Conectar al broker MQTT (similar al GPS pero simplificado)
function connectToBroker(index) {
    if (client) {
        client.end();
    }
    
    currentBrokerIndex = index;
    const broker = availableBrokers[currentBrokerIndex];
    
    updateConnectionStatus('reconnecting', `Conectando a ${broker.name}...`);
    
    const options = {
        keepalive: 60,
        clean: true,
        reconnectPeriod: 1000,
        connectTimeout: 30 * 1000,
        clientId: 'pan-tilt-control_' + Math.random().toString(16).substr(2, 8)
    };
    
    client = mqtt.connect(broker.url, options);
    
    client.on('connect', () => {
        console.log(`Conectado al broker ${broker.name}`);
        updateConnectionStatus('connected', `Conectado a ${broker.name}`);
        
        // Suscribirse al topic de estado
        client.subscribe(statusTopic, { qos: 1 });
        
        if (brokerSwitchTimeout) {
            clearTimeout(brokerSwitchTimeout);
            brokerSwitchTimeout = null;
        }
    });
    
    client.on('error', (err) => {
        console.error(`Error con broker ${broker.name}:`, err);
        updateConnectionStatus('disconnected', `Error con ${broker.name}`);
        tryNextBroker();
    });
    
    client.on('reconnect', () => {
        console.log("Intentando reconectar...");
        updateConnectionStatus('reconnecting', `Reconectando a ${broker.name}...`);
    });
    
    client.on('offline', () => {
        console.log(`Desconectado del broker ${broker.name}`);
        updateConnectionStatus('disconnected', `Desconectado de ${broker.name}`);
        tryNextBroker();
    });
    
    client.on('message', (topic, message) => {
        if (topic === statusTopic) {
            try {
                const data = JSON.parse(message.toString());
                console.log("Estado recibido:", data);
                
                // Actualizar UI con los valores actuales del dispositivo
                if (data.pan !== undefined) {
                    currentPan = data.pan;
                    panValue.textContent = `${currentPan}°`;
                }
                
                if (data.tilt !== undefined) {
                    currentTilt = data.tilt;
                    tiltValue.textContent = `${currentTilt}°`;
                }
                
                if (data.speed !== undefined) {
                    currentSpeed = data.speed;
                    speedSlider.value = currentSpeed;
                    speedValue.textContent = `${currentSpeed}%`;
                }
                
            } catch (e) {
                console.error("Error al procesar mensaje de estado:", e);
            }
        }
    });
}

// Intentar conectar al siguiente broker
function tryNextBroker() {
    if (!autoReconnectEnabled || brokerSwitchTimeout) return;
    
    brokerSwitchTimeout = setTimeout(() => {
        const nextIndex = (currentBrokerIndex + 1) % availableBrokers.length;
        console.log(`Intentando conectar al siguiente broker: ${availableBrokers[nextIndex].name}`);
        connectToBroker(nextIndex);
        brokerSwitchTimeout = null;
    }, 5000);
}

// Cambiar manualmente de broker
function switchBroker(index) {
    if (index >= 0 && index < availableBrokers.length) {
        autoReconnectEnabled = false;
        connectToBroker(index);
        
        setTimeout(() => {
            autoReconnectEnabled = true;
        }, 30000);
    }
}

// Actualizar estado de conexión en la UI
function updateConnectionStatus(status, text) {
    connStatus.className = status;
    
    let statusHTML = `<i class="fas fa-plug"></i> ${text}`;
    
    if (status === 'connected') {
        statusHTML += `
            <div style="display: inline-block; margin-left: 15px;">
                <select id="broker-select" onchange="switchBroker(this.selectedIndex)" 
                        style="padding: 4px 8px; border-radius: 4px; border: 1px solid #ddd;">
                    ${availableBrokers.map((broker, index) => `
                        <option value="${index}" ${index === currentBrokerIndex ? 'selected' : ''}>
                            ${broker.name}
                        </option>
                    `).join('')}
                </select>
            </div>
        `;
    }
    
    connStatus.innerHTML = statusHTML;
}

// Enviar comando de movimiento
function sendMoveCommand(axis, direction) {
    if (!client || !client.connected) {
        alert("No hay conexión MQTT activa");
        return;
    }
    
    // Calcular nuevo valor basado en dirección y velocidad
    let newValue;
    const step = currentSpeed / 10; // Paso basado en velocidad
    
    if (axis === 'pan') {
        newValue = currentPan + (direction === 'left' ? -step : step);
        newValue = Math.max(-90, Math.min(90, newValue)); // Limitar rango
    } else { // tilt
        newValue = currentTilt + (direction === 'down' ? -step : step);
        newValue = Math.max(-30, Math.min(45, newValue)); // Limitar rango
    }
    
    // Crear mensaje MQTT
    const message = {
        command: "move",
        axis: axis,
        value: Math.round(newValue),
        speed: currentSpeed
    };
    
    client.publish(controlTopic, JSON.stringify(message), { qos: 1 }, (err) => {
        if (err) {
            console.error("Error al enviar comando:", err);
        } else {
            console.log("Comando enviado:", message);
            
            // Actualizar UI localmente (el dispositivo confirmará con mensaje de estado)
            if (axis === 'pan') {
                currentPan = newValue;
                panValue.textContent = `${Math.round(newValue)}°`;
            } else {
                currentTilt = newValue;
                tiltValue.textContent = `${Math.round(newValue)}°`;
            }
        }
    });
}

// Enviar comando de acción (stop, home, etc.)
function sendActionCommand(action) {
    if (!client || !client.connected) {
        alert("No hay conexión MQTT activa");
        return;
    }
    
    const message = {
        command: action,
        speed: currentSpeed
    };
    
    client.publish(controlTopic, JSON.stringify(message), { qos: 1 }, (err) => {
        if (err) {
            console.error("Error al enviar comando:", err);
        } else {
            console.log("Comando enviado:", message);
        }
    });
}

// Manejar cambio de velocidad
function handleSpeedChange() {
    currentSpeed = parseInt(speedSlider.value);
    speedValue.textContent = `${currentSpeed}%`;
    
    // Opcional: enviar actualización de velocidad al dispositivo
    if (client && client.connected) {
        const message = {
            command: "set_speed",
            speed: currentSpeed
        };
        
        client.publish(controlTopic, JSON.stringify(message), { qos: 1 });
    }
}

// Asignar event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Botones de movimiento
    document.querySelectorAll('.axis-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const icon = this.querySelector('i');
            const axisGroup = this.closest('.axis-group');
            const axis = axisGroup.querySelector('label').textContent.toLowerCase().includes('pan') ? 'pan' : 'tilt';
            
            let direction;
            if (icon.classList.contains('fa-arrow-left')) direction = 'left';
            else if (icon.classList.contains('fa-arrow-right')) direction = 'right';
            else if (icon.classList.contains('fa-arrow-up')) direction = 'up';
            else if (icon.classList.contains('fa-arrow-down')) direction = 'down';
            
            if (direction) sendMoveCommand(axis, direction);
        });
    });
    
    // Botones de acción
    document.querySelector('.btn-danger').addEventListener('click', () => sendActionCommand('stop'));
    document.querySelector('.btn-primary').addEventListener('click', () => sendActionCommand('home'));
    document.querySelector('.btn-secondary').addEventListener('click', () => {
        // Menú de presets (simplificado)
        const preset = prompt("Seleccione preset (1-5):");
        if (preset) sendActionCommand(`preset_${preset}`);
    });
    
    // Control de velocidad
    speedSlider.addEventListener('input', handleSpeedChange);
    
    // Conectar al primer broker al cargar
    connectToBroker(0);
});
