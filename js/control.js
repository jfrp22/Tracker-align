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
        url: "wss://broker.hivemq.com:8884/mqtt",
        name: "Hivemq Público"
    }
];

// Variables globales
let client = null;
let currentBrokerIndex = 0;
let selectedNode = null;
let nodes = {};
let autoReconnectEnabled = true;
let brokerSwitchTimeout = null;

// Tópicos MQTT
const nodesStatusTopic = "iotlab/nodes/status";
const controlTopic = "iotlab/servo/control";
const sensorDataTopic = "iotlab/sensor/data";

// Elementos del DOM
const connStatus = document.getElementById("connection-status");
const nodeSelect = document.getElementById("node-select");
const selectedNodeSpan = document.getElementById("selected-node");
const nodeStatusSpan = document.getElementById("node-status");
const nodeRoleSpan = document.getElementById("node-role");
const headingValue = document.getElementById("heading-value");
const headingInicialValue = document.getElementById("heading-inicial-value");
const azimuthEnabled = document.getElementById("azimuth-enabled");
const pitchValue = document.getElementById("pitch-value");
const rollValue = document.getElementById("roll-value");
const yawValue = document.getElementById("yaw-value");
const servoAState = document.getElementById("servoA-state");
const servoBState = document.getElementById("servoB-state");
const servoSpeed = document.getElementById("servo-speed");
const servoRange = document.getElementById("servo-range");

// Conectar al broker MQTT
function connectToBroker(index) {
    // Limpiar conexión anterior si existe
    if (client) {
        client.end();
    }
    
    currentBrokerIndex = index;
    const broker = availableBrokers[currentBrokerIndex];
    
    updateConnectionStatus('connecting', `Conectando a ${broker.name}...`);
    
    const options = {
        keepalive: 60,
        clean: true,
        reconnectPeriod: 1000,
        connectTimeout: 30 * 1000,
        clientId: 'control_' + Math.random().toString(16).substr(2, 8)
    };
    
    client = mqtt.connect(broker.url, options);
    
    // Manejo de conexión MQTT
    client.on('connect', () => {
        console.log(`Conectado al broker ${broker.name}`);
        updateConnectionStatus('connected', `Conectado a ${broker.name}`);
        
        // Suscribirse a los topics necesarios
        client.subscribe(nodesStatusTopic, { qos: 1 });
        client.subscribe(sensorDataTopic, { qos: 1 });
        
        // Reiniciar el timeout de verificación
        if (brokerSwitchTimeout) {
            clearTimeout(brokerSwitchTimeout);
            brokerSwitchTimeout = null;
        }
    });
    
    client.on('error', (err) => {
        console.error(`Error con broker ${broker.name}:`, err);
        updateConnectionStatus('error', `Error con ${broker.name}`);
        
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
            const data = JSON.parse(message.toString());
            
            if (topic === nodesStatusTopic) {
                processNodeStatus(data);
            } else if (topic === sensorDataTopic && selectedNode && data.mac === selectedNode) {
                updateSensorData(data);
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
    connStatus.className = `status-indicator ${status}`;
    
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

// Procesar estado de los nodos
function processNodeStatus(data) {
    const mac = data.mac;
    if (!mac) return;
    
    // Actualizar/agregar nodo
    nodes[mac] = {
        mac: mac,
        role: data.role || 'UNKNOWN',
        status: data.status || 'unknown',
        ip: data.ip || '',
        rssi: data.rssi || 0,
        paired: data.paired || '',
        lastSeen: Date.now()
    };
    
    // Actualizar selector de nodos
    updateNodeSelector();
    
    // Si hay un nodo seleccionado, actualizar su información
    if (selectedNode === mac) {
        updateNodeInfo(nodes[mac]);
    }
}

// Actualizar selector de nodos
function updateNodeSelector() {
    // Guardar selección actual
    const currentSelection = nodeSelect.value;
    
    // Limpiar selector
    nodeSelect.innerHTML = '<option value="">Seleccionar nodo...</option>';
    
    // Agregar nodos disponibles
    Object.keys(nodes).forEach(mac => {
        const node = nodes[mac];
        const option = document.createElement('option');
        option.value = mac;
        option.textContent = `${mac} (${node.role})`;
        nodeSelect.appendChild(option);
    });
    
    // Restaurar selección si aún existe
    if (currentSelection && nodes[currentSelection]) {
        nodeSelect.value = currentSelection;
    }
}

// Actualizar información del nodo seleccionado
function updateNodeInfo(node) {
    selectedNodeSpan.textContent = node.mac;
    nodeRoleSpan.textContent = node.role;
    
    // Actualizar estado
    let statusHTML = '';
    if (node.status === 'active') {
        statusHTML = '<span class="badge badge-online">Online</span>';
    } else {
        statusHTML = '<span class="badge badge-offline">Offline</span>';
    }
    nodeStatusSpan.innerHTML = statusHTML;
}

// Actualizar datos de sensores
function updateSensorData(data) {
    headingValue.textContent = data.heading !== undefined ? `${data.heading.toFixed(1)}°` : '0.0°';
    headingInicialValue.textContent = data.heading_inicial !== undefined ? `${data.heading_inicial.toFixed(1)}°` : '0.0°';
    pitchValue.textContent = data.pitch !== undefined ? `${data.pitch.toFixed(1)}°` : '0.0°';
    rollValue.textContent = data.roll !== undefined ? `${data.roll.toFixed(1)}°` : '0.0°';
    yawValue.textContent = data.yaw !== undefined ? `${data.yaw.toFixed(1)}°` : '0.0°';
    
    azimuthEnabled.textContent = data.azimuth_enabled ? 'Sí' : 'No';
    servoAState.textContent = getServoStateText(data.servoA_state);
    servoBState.textContent = getServoStateText(data.servoB_state);
    
    if (data.servo_speed !== undefined) {
        servoSpeed.textContent = data.servo_speed;
    }
    
    if (data.servo_range !== undefined) {
        servoRange.textContent = `${data.servo_range}°`;
    }
}

// Obtener texto del estado del servo
function getServoStateText(state) {
    switch(state) {
        case 0: return 'Detenido';
        case 1: return 'Izquierda/Arriba';
        case 2: return 'Derecha/Abajo';
        default: return 'Desconocido';
    }
}

// Controlar servomotor
function controlServo(servo, action) {
    if (!selectedNode || !client || !client.connected) {
        alert('Por favor, seleccione un nodo y asegúrese de estar conectado al broker MQTT');
        return;
    }
    
    const message = {
        target: selectedNode,
        command: 'servo_control',
        servo: servo,
        action: action
    };
    
    client.publish(controlTopic, JSON.stringify(message));
    console.log(`Comando enviado: ${servo} - ${action}`);
}

// Calibrar heading inicial
function calibrateHeading() {
    if (!selectedNode || !client || !client.connected) {
        alert('Por favor, seleccione un nodo y asegúrese de estar conectado al broker MQTT');
        return;
    }
    
    const message = {
        target: selectedNode,
        command: 'calibrate_heading'
    };
    
    client.publish(controlTopic, JSON.stringify(message));
    console.log('Solicitud de calibración enviada');
}

// Actualizar lista de nodos
function refreshNodes() {
    // Limpiar lista actual
    nodes = {};
    updateNodeSelector();
    selectedNode = null;
    selectedNodeSpan.textContent = 'Ninguno';
    nodeStatusSpan.innerHTML = '<span class="badge badge-offline">Offline</span>';
    nodeRoleSpan.textContent = 'Desconocido';
    
    console.log('Lista de nodos actualizada');
}

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    // Configurar evento de selección de nodo
    nodeSelect.addEventListener('change', () => {
        selectedNode = nodeSelect.value;
        if (selectedNode && nodes[selectedNode]) {
            updateNodeInfo(nodes[selectedNode]);
        } else {
            selectedNodeSpan.textContent = 'Ninguno';
            nodeStatusSpan.innerHTML = '<span class="badge badge-offline">Offline</span>';
            nodeRoleSpan.textContent = 'Desconocido';
        }
    });
    
    // Conectar al primer broker al cargar la página
    connectToBroker(0);
    
    // Actualizar periódicamente el estado de los nodos
    setInterval(() => {
        const now = Date.now();
        Object.keys(nodes).forEach(mac => {
            // Marcar como offline si no se ha visto en 30 segundos
            if (now - nodes[mac].lastSeen > 30000) {
                nodes[mac].status = 'offline';
                
                // Si es el nodo seleccionado, actualizar UI
                if (selectedNode === mac) {
                    nodeStatusSpan.innerHTML = '<span class="badge badge-offline">Offline</span>';
                }
            }
        });
    }, 10000); // Verificar cada 10 segundos
});
