// Lista de brokers disponibles
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
let currentDeviceMac = null;
const devices = {}; // Almacena dispositivos pan-tilt disponibles

// Tópicos MQTT
const controlTopicPrefix = "iotlab/pan-tilt/";
const statusTopicPrefix = "iotlab/pan-tilt/";
const discoveryTopic = "iotlab/devices/pan-tilt";

// Elementos del DOM
const connStatus = document.getElementById("connection-status");
const panValue = document.querySelector('.axis-group:nth-child(1) .axis-value');
const tiltValue = document.querySelector('.axis-group:nth-child(2) .axis-value');
const speedValue = document.querySelector('.speed-value');
const speedSlider = document.querySelector('.speed-slider');
const deviceSelect = document.getElementById("device-select");
const brokerSelect = document.getElementById("broker-select");

// Valores actuales
let currentPan = 0;
let currentTilt = 0;
let currentSpeed = 50;

// Conectar al broker MQTT
function connectToBroker(index) {
    if (client) {
        client.end();
    }
    
    currentBrokerIndex = index;
    const broker = availableBrokers[currentBrokerIndex];
    
    updateConnectionStatus('reconnecting', `Conectando a ${broker.name}...`);
    updateDeviceList([]); // Limpiar lista de dispositivos
    
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
        
        // Suscribirse a topics
        client.subscribe(discoveryTopic, { qos: 1 });
        if (currentDeviceMac) {
            subscribeToDevice(currentDeviceMac);
        }
        
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
        try {
            const data = JSON.parse(message.toString());
            
            if (topic === discoveryTopic) {
                // Mensaje de descubrimiento de dispositivos
                handleDeviceDiscovery(data);
            } else if (topic.startsWith(statusTopicPrefix)) {
                // Mensaje de estado de un dispositivo
                handleStatusMessage(topic, data);
            }
        } catch (e) {
            console.error("Error al procesar mensaje:", e);
        }
    });
}

// Manejar descubrimiento de dispositivos
function handleDeviceDiscovery(data) {
    const mac = data.mac;
    if (!mac) return;
    
    // Registrar/actualizar dispositivo
    devices[mac] = {
        name: data.name || `Pan-Tilt ${mac.substring(0, 6)}`,
        lastSeen: new Date(),
        broker: availableBrokers[currentBrokerIndex].name
    };
    
    // Actualizar lista de dispositivos en UI
    updateDeviceList(Object.values(devices));
    
    // Auto-seleccionar si es el único dispositivo
    if (Object.keys(devices).length === 1) {
        selectDevice(mac);
    }
}

// Manejar mensajes de estado
function handleStatusMessage(topic, data) {
    const mac = topic.split('/')[2]; // Extraer MAC del topic
    if (mac !== currentDeviceMac) return;
    
    console.log("Estado recibido de", mac, ":", data);
    
    // Actualizar UI con los valores del dispositivo
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
}

// Suscribirse a los topics de un dispositivo específico
function subscribeToDevice(mac) {
    if (!client || !client.connected) return;
    
    const statusTopic = `${statusTopicPrefix}${mac}/status`;
    client.subscribe(statusTopic, { qos: 1 }, (err) => {
        if (err) {
            console.error("Error al suscribirse a", statusTopic, ":", err);
        } else {
            console.log("Suscrito a", statusTopic);
        }
    });
}

// Seleccionar un dispositivo
function selectDevice(mac) {
    if (!devices[mac]) return;
    
    currentDeviceMac = mac;
    
    // Actualizar UI
    deviceSelect.value = mac;
    
    // Suscribirse a los topics del dispositivo
    if (client && client.connected) {
        subscribeToDevice(mac);
    }
    
    // Solicitar estado actual
    sendCommand('get_status');
}

// Enviar comando al dispositivo actual
function sendCommand(command, data = {}) {
    if (!client || !client.connected || !currentDeviceMac) {
        alert("No hay conexión activa o dispositivo seleccionado");
        return;
    }
    
    const topic = `${controlTopicPrefix}${currentDeviceMac}/control`;
    const message = {
        ...data,
        command: command,
        timestamp: new Date().toISOString()
    };
    
    client.publish(topic, JSON.stringify(message), { qos: 1 }, (err) => {
        if (err) {
            console.error("Error al enviar comando:", err);
        } else {
            console.log("Comando enviado a", currentDeviceMac, ":", message);
        }
    });
}

// Actualizar lista de dispositivos en el selector
function updateDeviceList(deviceList) {
    deviceSelect.innerHTML = '<option value="">Seleccione un dispositivo</option>';
    
    deviceList.forEach(device => {
        const option = document.createElement('option');
        option.value = device.mac;
        option.textContent = `${device.name} (${device.mac}) - ${device.broker}`;
        deviceSelect.appendChild(option);
    });
}

// Actualizar estado de conexión en la UI
function updateConnectionStatus(status, text) {
    connStatus.className = status;
    connStatus.innerHTML = `<i class="fas fa-plug"></i> ${text}`;
    
    // Actualizar selector de brokers
    brokerSelect.innerHTML = availableBrokers.map((broker, index) => `
        <option value="${index}" ${index === currentBrokerIndex ? 'selected' : ''}>
            ${broker.name}
        </option>
    `).join('');
}

// Cambiar de broker manualmente
function switchBroker(index) {
    if (index >= 0 && index < availableBrokers.length) {
        autoReconnectEnabled = false;
        connectToBroker(index);
        
        setTimeout(() => {
            autoReconnectEnabled = true;
        }, 30000);
    }
}

// Enviar comando de movimiento
function sendMoveCommand(axis, direction) {
    if (!currentDeviceMac) {
        alert("Seleccione un dispositivo primero");
        return;
    }
    
    const step = currentSpeed / 10;
    let value;
    
    if (axis === 'pan') {
        value = currentPan + (direction === 'left' ? -step : step);
        value = Math.max(-90, Math.min(90, value));
    } else {
        value = currentTilt + (direction === 'down' ? -step : step);
        value = Math.max(-30, Math.min(45, value));
    }
    
    sendCommand('move', {
        axis: axis,
        value: Math.round(value),
        speed: currentSpeed
    });
}

// Enviar comando de acción
function sendActionCommand(action) {
    if (!currentDeviceMac) {
        alert("Seleccione un dispositivo primero");
        return;
    }
    
    sendCommand(action, { speed: currentSpeed });
}

// Manejar cambio de velocidad
function handleSpeedChange() {
    currentSpeed = parseInt(speedSlider.value);
    speedValue.textContent = `${currentSpeed}%`;
    
    if (currentDeviceMac) {
        sendCommand('set_speed', { speed: currentSpeed });
    }
}

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    // Configurar selectores
    brokerSelect.innerHTML = availableBrokers.map((broker, index) => `
        <option value="${index}">${broker.name}</option>
    `).join('');
    
    brokerSelect.addEventListener('change', () => {
        switchBroker(parseInt(brokerSelect.value));
    });
    
    deviceSelect.addEventListener('change', () => {
        if (deviceSelect.value) {
            selectDevice(deviceSelect.value);
        } else {
            currentDeviceMac = null;
        }
    });
    
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
        const preset = prompt("Seleccione preset (1-5):");
        if (preset) sendActionCommand(`preset_${preset}`);
    });
    
    // Control de velocidad
    speedSlider.addEventListener('input', handleSpeedChange);
    
    // Conectar al primer broker al cargar
    connectToBroker(0);
});
