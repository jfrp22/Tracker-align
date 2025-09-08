// Configuración MQTT
const availableBrokers = [
    { url: "wss://test.mosquitto.org:8081/mqtt", name: "Mosquitto Público" },
    { url: "wss://broker.emqx.io:8084/mqtt", name: "EMQX Público" },
    { url: "wss://broker.hivemq.com:8884/mqtt", name: "HiveMQ Público" }
];

const mqttTopics = {
    nodesStatus: "iotlab/nodes/status",
    nodesConfig: "iotlab/nodes/config",
    servoControl: "iotlab/servo/control",
    sensorData: "iotlab/sensor/data"
};

// Variables globales
let client = null;
let currentBrokerIndex = 0;
let selectedNode = null;
const nodes = {};
let sensorUpdateInterval = null;

// Elementos del DOM
const statusElement = document.getElementById('connection-status');
const nodeSelect = document.getElementById('node-select');
const selectedNodeElement = document.getElementById('selected-node');
const nodeStatusElement = document.getElementById('node-status');
const nodeRoleElement = document.getElementById('node-role');

// Conectar al broker MQTT
function connectToBroker() {
    statusElement.className = 'status-indicator connecting';
    statusElement.innerHTML = '<i class="fas fa-plug"></i> Conectando al servidor MQTT...';
    
    const broker = availableBrokers[currentBrokerIndex];
    
    client = mqtt.connect(broker.url, {
        clientId: 'web_servo_control_' + Math.random().toString(16).substr(2, 8),
        clean: true,
        keepalive: 60,
        reconnectPeriod: 1000
    });
    
    client.on('connect', function() {
        statusElement.className = 'status-indicator connected';
        statusElement.innerHTML = `<i class="fas fa-plug"></i> Conectado a ${broker.name}`;
        
        // Suscribirse a los topics necesarios
        client.subscribe(mqttTopics.nodesStatus, { qos: 1 });
        client.subscribe(mqttTopics.sensorData, { qos: 1 });
        
        // Solicitar lista de nodos
        discoverNodes();
    });
    
    client.on('error', function(error) {
        statusElement.className = 'status-indicator disconnected';
        statusElement.innerHTML = `<i class="fas fa-plug"></i> Error de conexión: ${error.message}`;
        console.error('Error MQTT:', error);
        
        // Intentar con el siguiente broker después de 5 segundos
        setTimeout(() => {
            currentBrokerIndex = (currentBrokerIndex + 1) % availableBrokers.length;
            connectToBroker();
        }, 5000);
    });
    
    client.on('message', function(topic, message) {
        const data = JSON.parse(message.toString());
        
        if (topic === mqttTopics.nodesStatus) {
            updateNodeList(data);
        }
        
        if (topic === mqttTopics.sensorData && selectedNode && data.mac === selectedNode) {
            updateSensorData(data);
        }
    });
    
    client.on('reconnect', function() {
        statusElement.className = 'status-indicator connecting';
        statusElement.innerHTML = '<i class="fas fa-plug"></i> Reconectando...';
    });
    
    client.on('offline', function() {
        statusElement.className = 'status-indicator disconnected';
        statusElement.innerHTML = '<i class="fas fa-plug"></i> Desconectado del servidor MQTT';
    });
}

// Descubrir nodos en la red
function discoverNodes() {
    // Los nodos publican automáticamente su estado, no es necesario enviar un mensaje de descubrimiento
    console.log("Escuchando nodos...");
}

// Actualizar lista de nodos disponibles
function updateNodeList(nodeData) {
    const mac = nodeData.mac;
    nodes[mac] = {
        ...nodeData,
        lastSeen: new Date()
    };
    
    // Actualizar selector de nodos
    updateNodeSelector();
    
    // Si este nodo está seleccionado, actualizar su información
    if (selectedNode === mac) {
        updateSelectedNodeInfo();
    }
}

// Actualizar el selector de nodos
function updateNodeSelector() {
    // Guardar la selección actual
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
    
    // Restaurar selección si todavía existe
    if (nodes[currentSelection]) {
        nodeSelect.value = currentSelection;
    }
}

// Actualizar información del nodo seleccionado
function updateSelectedNodeInfo() {
    if (!selectedNode || !nodes[selectedNode]) {
        selectedNodeElement.textContent = 'Ninguno';
        nodeStatusElement.innerHTML = '<span class="badge badge-offline">Offline</span>';
        nodeRoleElement.textContent = 'Desconocido';
        return;
    }
    
    const node = nodes[selectedNode];
    selectedNodeElement.textContent = selectedNode;
    nodeRoleElement.textContent = node.role;
    
    // Verificar si el nodo está online (última actualización hace menos de 2 minutos)
    const isOnline = (new Date() - node.lastSeen) < 120000;
    
    if (isOnline) {
        nodeStatusElement.innerHTML = '<span class="badge badge-online">Online</span>';
        
        // Solicitar datos del sensor si no estamos ya recibiendo updates
        if (!sensorUpdateInterval) {
            requestSensorData();
            sensorUpdateInterval = setInterval(requestSensorData, 5000);
        }
    } else {
        nodeStatusElement.innerHTML = '<span class="badge badge-offline">Offline</span>';
        
        // Detener solicitud de datos del sensor
        if (sensorUpdateInterval) {
            clearInterval(sensorUpdateInterval);
            sensorUpdateInterval = null;
        }
    }
}

// Solicitar datos del sensor al nodo seleccionado
function requestSensorData() {
    if (!selectedNode) return;
    
    // No es necesario enviar una solicitud explícita porque los nodos
    // publican automáticamente sus datos cada 10 segundos (statusInterval)
    // y datos del sensor cada 5 segundos (gpsInterval)
}

// Actualizar la interfaz con los datos del sensor
function updateSensorData(data) {
    document.getElementById('heading-value').textContent = data.heading !== undefined ? 
        data.heading.toFixed(1) + '°' : '0.0°';
        
    document.getElementById('pitch-value').textContent = data.pitch !== undefined ? 
        data.pitch.toFixed(1) + '°' : '0.0°';
        
    document.getElementById('roll-value').textContent = data.roll !== undefined ? 
        data.roll.toFixed(1) + '°' : '0.0°';
        
    document.getElementById('yaw-value').textContent = data.yaw !== undefined ? 
        data.yaw.toFixed(1) + '°' : '0.0°';
        
    document.getElementById('azimuth-enabled').textContent = data.azimuth_enabled ? 'Sí' : 'No';
    
    // Actualizar estados de los servos si están disponibles en los datos
    if (data.servoA_state) {
        document.getElementById('servoA-state').textContent = data.servoA_state;
    }
    
    if (data.servoB_state) {
        document.getElementById('servoB-state').textContent = data.servoB_state;
    }
}

// Controlar los servomotores
function controlServo(servo, action) {
    if (!selectedNode) {
        alert('Por favor, selecciona un nodo primero');
        return;
    }
    
    if (!client || !client.connected) {
        alert('No hay conexión MQTT activa');
        return;
    }
    
    const topic = `iotlab/nodes/${selectedNode}/servo`;
    const message = JSON.stringify({
        servo: servo,
        action: action,
        timestamp: Date.now()
    });
    
    client.publish(topic, message, { qos: 1 }, function(err) {
        if (err) {
            console.error('Error al enviar comando:', err);
            alert('Error al enviar comando al servomotor');
        } else {
            console.log('Comando enviado:', message);
        }
    });
}

// Calibrar heading inicial
function calibrateHeading() {
    if (!selectedNode) {
        alert('Por favor, selecciona un nodo primero');
        return;
    }
    
    if (!client || !client.connected) {
        alert('No hay conexión MQTT activa');
        return;
    }
    
    const topic = `iotlab/nodes/${selectedNode}/calibrate`;
    const message = JSON.stringify({
        command: "calibrate_heading",
        timestamp: Date.now()
    });
    
    client.publish(topic, message, { qos: 1 }, function(err) {
        if (err) {
            console.error('Error al enviar comando de calibración:', err);
            alert('Error al enviar comando de calibración');
        } else {
            console.log('Comando de calibración enviado');
            alert('Comando de calibración enviado. El heading actual se establecerá como heading inicial.');
        }
    });
}

// Refrescar lista de nodos
function refreshNodes() {
    // Limpiar lista actual
    for (const mac in nodes) {
        // Marcar todos los nodos como offline inicialmente
        nodes[mac].lastSeen = new Date(0);
    }
    
    // Actualizar UI
    updateNodeSelector();
    
    if (selectedNode) {
        updateSelectedNodeInfo();
    }
}

// Inicializar cuando el DOM esté cargado
document.addEventListener('DOMContentLoaded', function() {
    // Configurar evento de cambio en el selector de nodos
    nodeSelect.addEventListener('change', function() {
        selectedNode = this.value;
        updateSelectedNodeInfo();
        
        // Detener intervalo anterior si existe
        if (sensorUpdateInterval) {
            clearInterval(sensorUpdateInterval);
            sensorUpdateInterval = null;
        }
        
        // Si se seleccionó un nodo, comenzar a solicitar datos del sensor
        if (selectedNode) {
            requestSensorData();
            sensorUpdateInterval = setInterval(requestSensorData, 5000);
        }
    });
    
    // Conectar al broker MQTT
    connectToBroker();
});
