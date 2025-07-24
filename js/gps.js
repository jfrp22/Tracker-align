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
const devices = {};
let map;
let activeDevice = null;
let currentBrokerIndex = 0;
let client = null;
let brokerSwitchTimeout = null;
let autoReconnectEnabled = true;

// Tópicos MQTT
const gpsTopic = "iotlab/gps/data";
const macListTopic = "iotlab/nodes/status";

// Elementos del DOM
const connStatus = document.getElementById("connection-status");
const deviceButtonsContainer = document.getElementById("device-buttons");

// Inicializar mapa
function initMap() {
    map = L.map('map').setView([10.4806, -66.9036], 10); // Centro inicial en Venezuela

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19
    }).addTo(map);
    
    // Añadir control de escala
    L.control.scale({ imperial: false }).addTo(map);
}

// Conectar al broker MQTT
function connectToBroker(index) {
    // Limpiar conexión anterior si existe
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
        clientId: 'tracker_' + Math.random().toString(16).substr(2, 8)
    };
    
    client = mqtt.connect(broker.url, options);
    
    // Manejo de conexión MQTT
    client.on('connect', () => {
        console.log(`Conectado al broker ${broker.name}`);
        updateConnectionStatus('connected', `Conectado a ${broker.name}`);
        
        // Suscribirse a los topics necesarios
        client.subscribe(gpsTopic, { qos: 1 });
        client.subscribe(macListTopic, { qos: 1 });
        
        // Reiniciar el timeout de verificación
        if (brokerSwitchTimeout) {
            clearTimeout(brokerSwitchTimeout);
            brokerSwitchTimeout = null;
        }
    });
    
    client.on('error', (err) => {
        console.error(`Error con broker ${broker.name}:`, err);
        updateConnectionStatus('disconnected', `Error con ${broker.name}`);
        
        // Intentar conectar al siguiente broker si está habilitada la reconexión automática
        if (autoReconnectEnabled) {
            tryNextBroker();
        }
    });
    
    client.on('reconnect', () => {
        console.log("Intentando reconectar...");
        updateConnectionStatus('reconnecting', `Reconectando a ${broker.name}...`);
    });
    
    client.on('offline', () => {
        console.log(`Desconectado del broker ${broker.name}`);
        updateConnectionStatus('disconnected', `Desconectado de ${broker.name}`);
        
        // Intentar conectar al siguiente broker si está habilitada la reconexión automática
        if (autoReconnectEnabled) {
            tryNextBroker();
        }
    });
    
    // Procesar mensajes MQTT
    client.on('message', (topic, message) => {
        try {
            if (topic === macListTopic) {
                // Procesar mensaje de lista de dispositivos
                const data = JSON.parse(message.toString());
                
                // Extraer lista de MACs (ajustar según formato del mensaje)
                let macList = [];
                if (Array.isArray(data)) {
                    // Si el mensaje es un array directo de MACs
                    macList = data;
                } else if (data.devices) {
                    // Si el mensaje es un objeto con propiedad 'devices'
                    macList = data.devices;
                } else if (data.mac) {
                    // Si es un mensaje individual
                    macList = [data.mac];
                }
                
                console.log("Dispositivos conectados recibidos:", macList);
                
                // Actualizar indicadores de conexión
                Object.keys(devices).forEach(mac => {
                    const isConnected = macList.includes(mac);
                    devices[mac].button.innerHTML = `
                        <i class="fas fa-map-marker-alt" style="color: ${getColorForMac(mac)}"></i> 
                        ${mac.substring(0, 6)}...
                        ${isConnected ? '<i class="fas fa-circle" style="color: green; font-size: 0.6rem; margin-left: 5px;"></i>' : ''}
                    `;
                });
                
            } else if (topic === gpsTopic) {
                // Procesar datos GPS
                const data = JSON.parse(message.toString());
                
                // Extraer datos (ajustar según formato del mensaje)
                const mac = data.mac || data.deviceId;
                const gpsData = {
                    mac: mac,
                    lat: data.lat || data.latitude,
                    lng: data.lng || data.longitude,
                    alt: data.alt || data.altitude || 0,
                    sats: data.sats || data.satellites || 0
                };
                
                if (!mac) {
                    console.error("Mensaje sin identificador MAC");
                    return;
                }
                
                console.log("Datos GPS recibidos de:", mac, gpsData);
                updateDeviceMarker(mac, gpsData);
            }
        } catch (e) {
            console.error("Error al procesar mensaje:", e);
        }
    });
}

// Intentar conectar al siguiente broker
function tryNextBroker() {
    if (brokerSwitchTimeout) return;
    
    brokerSwitchTimeout = setTimeout(() => {
        const nextIndex = (currentBrokerIndex + 1) % availableBrokers.length;
        console.log(`Intentando conectar al siguiente broker: ${availableBrokers[nextIndex].name}`);
        connectToBroker(nextIndex);
        brokerSwitchTimeout = null;
    }, 5000); // Esperar 5 segundos antes de cambiar de broker
}

// Cambiar manualmente de broker
function switchBroker(index) {
    if (index >= 0 && index < availableBrokers.length) {
        autoReconnectEnabled = false; // Deshabilitar auto-reconexión para cambios manuales
        connectToBroker(index);
        
        // Volver a habilitar auto-reconexión después de 30 segundos
        setTimeout(() => {
            autoReconnectEnabled = true;
        }, 30000);
    }
}

// Actualizar estado de conexión en la UI
function updateConnectionStatus(status, text) {
    connStatus.className = status;
    
    let statusHTML = `<i class="fas fa-plug"></i> ${text}`;
    
    // Mostrar selector de broker solo cuando esté conectado
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

// Crear o actualizar marcador para un dispositivo
function updateDeviceMarker(mac, data) {
    const now = new Date();
    
    if (!devices[mac]) {
        // Crear nuevo marcador con icono personalizado
        const icon = L.divIcon({
            className: 'custom-icon',
            html: `<div class="device-marker" style="background-color: ${getColorForMac(mac)}">
                     <i class="fas fa-map-marker-alt"></i>
                   </div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 30]
        });
        
        const marker = L.marker([data.lat, data.lng], {
            title: `Dispositivo: ${mac}`,
            icon: icon,
            riseOnHover: true
        }).addTo(map);
        
        // Crear botón para este dispositivo
        const btn = document.createElement('button');
        btn.className = 'device-btn';
        btn.innerHTML = `<i class="fas fa-map-marker-alt" style="color: ${getColorForMac(mac)}"></i> ${mac.substring(0, 6)}...`;
        btn.dataset.mac = mac;
        btn.onclick = () => focusDevice(mac);
        deviceButtonsContainer.appendChild(btn);
        
        devices[mac] = {
            marker: marker,
            button: btn,
            lastData: data,
            lastUpdate: now
        };
    } else {
        // Actualizar marcador existente
        devices[mac].marker.setLatLng([data.lat, data.lng]);
        devices[mac].lastData = data;
        devices[mac].lastUpdate = now;
    }
    
    // Actualizar popup con la información más reciente
    devices[mac].marker.bindPopup(`
        <div style="min-width: 200px;">
            <h4 style="margin: 0 0 5px 0; color: ${getColorForMac(mac)}">Dispositivo: ${mac}</h4>
            <p><b>Última actualización:</b> ${now.toLocaleTimeString()}</p>
            <p><b>Lat:</b> ${data.lat.toFixed(6)}</p>
            <p><b>Lng:</b> ${data.lng.toFixed(6)}</p>
            <p><b>Alt:</b> ${data.alt.toFixed(2)} m</p>
            <p><b>Satélites:</b> ${data.sats}</p>
        </div>
    `);
    
    // Si es el primer dispositivo o el dispositivo activo, enfocarlo
    if (Object.keys(devices).length === 1 || mac === activeDevice) {
        focusDevice(mac);
    }
}

// Enfocar un dispositivo específico en el mapa
function focusDevice(mac) {
    if (devices[mac]) {
        // Actualizar botones
        document.querySelectorAll('.device-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        devices[mac].button.classList.add('active');
        
        // Centrar mapa en este dispositivo
        map.setView(devices[mac].marker.getLatLng(), 15);
        devices[mac].marker.openPopup();
        activeDevice = mac;
    }
}

// Generar color único para cada MAC
function getColorForMac(mac) {
    const hash = mac.split('').reduce((acc, char) => {
        return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);
    
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 50%)`;
}

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    // Conectar al primer broker al cargar la página
    connectToBroker(0);
});
