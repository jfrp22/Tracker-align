// Variables globales
const devices = {};
let currentEditingNode = null;
let currentBrokerIndex = 0;
let client = null;
let brokerSwitchTimeout = null;
let autoReconnectEnabled = true;

// Elementos del DOM
const statusElement = document.getElementById('connection-status');
const nodesBody = document.getElementById('nodes-body');
const configModal = document.getElementById('config-modal');
const modalTitle = document.getElementById('modal-title');
const nodeRoleSelect = document.getElementById('node-role');
const pairingGroup = document.getElementById('pairing-group');
const pairDeviceSelect = document.getElementById('pair-device');

// ==============================================
// Funciones principales
// ==============================================

// Función para solicitar desemparejamiento
function requestUnpair(nodeMac) {
    if (!confirm(`¿Estás seguro que deseas desemparejar el nodo ${nodeMac}?`)) {
        return;
    }

    const device = devices[nodeMac];
    
    if (!device.paired_with) {
        alert("Este nodo no está emparejado");
        return;
    }

    const unpairRequest = {
        master_mac: device.role === 'SLAVE' ? device.paired_with : nodeMac,
        slave_mac: device.role === 'SLAVE' ? nodeMac : device.paired_with
    };

    console.log("Enviando solicitud de desemparejamiento:", unpairRequest);
    client.publish(mqttTopics.unpairRequest, JSON.stringify(unpairRequest), { qos: 1 });
    
    alert("Solicitud de desemparejamiento enviada. Esperando confirmación...");
}

// Función para manejar confirmaciones de desemparejamiento
function handleUnpairConfirmation(message) {
    try {
        const data = JSON.parse(message);
        
        if (data.status === "OK" && data.slave_mac) {
            // Actualizar ambos dispositivos involucrados
            updateDevice({
                mac: data.slave_mac,
                paired_with: '',
                role: 'UNCONFIGURED'
            });
            
            // Buscar y actualizar el maestro también
            Object.keys(devices).forEach(mac => {
                if (devices[mac].paired_with === data.slave_mac) {
                    updateDevice({
                        mac: mac,
                        paired_with: devices[mac].paired_with.replace(data.slave_mac, '')
                            .replace(/^,|,$/g, '') // Limpiar comas sobrantes
                            .replace(/,,+/g, ',') // Limpiar comas duplicadas
                    });
                }
            });
            
            alert(`Desemparejamiento confirmado para nodo ${data.slave_mac}`);
        }
    } catch (e) {
        console.error("Error al procesar confirmación de desemparejamiento:", e);
    }
}

// Función para manejar solicitudes de desemparejamiento (para maestros)
function handleUnpairRequest(message) {
    try {
        const data = JSON.parse(message);
        
        // Verificar si este es el maestro al que se refiere la solicitud
        const device = devices[data.master_mac];
        if (device && device.role === 'MASTER' && device.paired_with.includes(data.slave_mac)) {
            // Enviar confirmación
            const confirmMsg = {
                status: "OK",
                slave_mac: data.slave_mac
            };
            
            client.publish(mqttTopics.unpairConfirm, JSON.stringify(confirmMsg), { qos: 1 });
            console.log("Confirmación de desemparejamiento enviada para:", data.slave_mac);
        }
    } catch (e) {
        console.error("Error al procesar solicitud de desemparejamiento:", e);
    }
}

// Función para conectar al broker MQTT
function connectToBroker(index) {
    // Limpiar conexión anterior si existe
    if (client) {
        client.end();
    }
    
    currentBrokerIndex = index;
    const broker = availableBrokers[currentBrokerIndex];
    
    updateConnectionStatus('connecting', `Conectando a ${broker.name}...`);
    
    client = mqtt.connect(broker.url, {
        clientId: 'webclient_' + Math.random().toString(16).substr(2, 8),
        keepalive: 60,
        clean: true,
        reconnectPeriod: 1000
    });
    
    // Manejo de eventos MQTT
    client.on('connect', () => {
        console.log(`Conectado al broker ${broker.name}`);
        updateConnectionStatus('connected', `Conectado a ${broker.name}`);
        
        // Suscribirse a los topics necesarios
        client.subscribe(mqttTopics.nodesStatus, { qos: 1 });
        client.subscribe(mqttTopics.pairingResponse, { qos: 1 });
        client.subscribe(mqttTopics.unpairRequest, { qos: 1 });
        client.subscribe(mqttTopics.unpairConfirm, { qos: 1 });
        
        // Publicar mensaje de descubrimiento
        client.publish(mqttTopics.discovery, "DISCOVER_NODES", { qos: 1 });
        
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
        updateConnectionStatus('connecting', `Reconectando a ${broker.name}...`);
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
        console.log(`Mensaje recibido [${topic}]:`, message.toString());
        
        try {
            const data = JSON.parse(message.toString());
            
            if (topic === mqttTopics.nodesStatus) {
                updateDevice(data);
            }
            
            if (topic === mqttTopics.pairingResponse) {
                if (data.status === "PAIRED") {
                    updateDevice({
                        mac: data.slave_mac,
                        paired_with: data.master_mac,
                        status: "active"
                    });
                    updateDevice({
                        mac: data.master_mac,
                        paired_with: data.slave_mac,
                        status: "active"
                    });
                    alert(`Emparejamiento exitoso: ${data.slave_mac} → ${data.master_mac}`);
                }
            }

            if (topic === mqttTopics.unpairRequest) {
                handleUnpairRequest(message.toString());
            }

            if (topic === mqttTopics.unpairConfirm) {
                handleUnpairConfirmation(message.toString());
            }
        } catch (e) {
            console.error("Error al procesar mensaje:", e);
        }
    });
}

// Función para intentar conectar al siguiente broker
function tryNextBroker() {
    if (brokerSwitchTimeout) return;
    
    brokerSwitchTimeout = setTimeout(() => {
        const nextIndex = (currentBrokerIndex + 1) % availableBrokers.length;
        console.log(`Intentando conectar al siguiente broker: ${availableBrokers[nextIndex].name}`);
        connectToBroker(nextIndex);
        brokerSwitchTimeout = null;
    }, timeouts.brokerSwitchDelay);
}

// Función para cambiar manualmente de broker
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
    statusElement.className = `status-indicator ${status}`;
    
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
        
        statusHTML += ` 
            <button class="btn btn-sm" onclick="discoverNodes()" style="margin-left: 10px;">
                <i class="fas fa-sync-alt"></i> Buscar nodos
            </button>
        `;
    }
    
    statusElement.innerHTML = statusHTML;
}

// Actualizar/agregar dispositivo
function updateDevice(data) {
    if (!data.mac) {
        console.warn("Mensaje sin identificador MAC");
        return;
    }
    
    const now = new Date();
    if (!devices[data.mac]) {
        devices[data.mac] = {
            firstSeen: now,
            lastSeen: now,
            role: data.role || 'UNCONFIGURED',
            status: data.status || 'offline',
            paired_with: data.paired_with || '',
            ip: data.ip || 'N/A'
        };
    } else {
        devices[data.mac].lastSeen = now;
        if (data.role) devices[data.mac].role = data.role;
        if (data.status) devices[data.mac].status = data.status;
        if (data.paired_with !== undefined) devices[data.mac].paired_with = data.paired_with;
        if (data.ip) devices[data.mac].ip = data.ip;
    }
    
    updateTable();
}

// Actualizar tabla de nodos
function updateTable() {
    nodesBody.innerHTML = '';
    
    // Marcar como offline si no hay señal en 2 minutos
    const now = new Date();
    Object.keys(devices).forEach(mac => {
        if ((now - new Date(devices[mac].lastSeen)) > timeouts.offlineThreshold) {
            devices[mac].status = 'offline';
        }
    });
    
    // Ordenar dispositivos por estado (online primero) y luego por MAC
    const sortedDevices = Object.entries(devices).sort((a, b) => {
        if (a[1].status === b[1].status) {
            return a[0].localeCompare(b[0]);
        }
        return a[1].status === 'active' ? -1 : 1;
    });
    
    // Generar filas de la tabla
    sortedDevices.forEach(([mac, device]) => {
        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td>${mac}</td>
            <td><span class="badge ${device.role === 'MASTER' ? 'badge-master' : 
                                  device.role === 'SLAVE' ? 'badge-slave' : 'badge-unconfigured'}">
                ${device.role}
            </span></td>
            <td><span class="badge ${device.status === 'active' ? 'badge-online' : 'badge-offline'}">
                ${device.status === 'active' ? 'Online' : 'Offline'}
            </span></td>
            <td>${device.paired_with || 'Ninguno'}</td>
            <td>${device.ip}</td>
            <td>${device.lastSeen.toLocaleTimeString()}</td>
            <td>
                <button class="btn btn-primary btn-sm" onclick="showConfigModal('${mac}')">
                    <i class="fas fa-cog"></i> Configurar
                </button>
                ${device.paired_with ? `
                <button class="btn btn-danger btn-sm" onclick="requestUnpair('${mac}')" style="margin-left: 5px;">
                    <i class="fas fa-unlink"></i> Desemparejar
                </button>
                ` : ''}
            </td>
        `;
        
        nodesBody.appendChild(row);
    });
}

// Mostrar modal de configuración
function showConfigModal(nodeMac) {
    currentEditingNode = nodeMac;
    const device = devices[nodeMac];
    
    modalTitle.textContent = `Configurar Nodo ${nodeMac}`;
    nodeRoleSelect.value = device.role || 'UNCONFIGURED';
    
    // Actualizar opciones de emparejamiento
    updatePairingOptions();
    
    configModal.classList.add('show');
}

// Ocultar modal
function hideModal() {
    configModal.classList.remove('show');
    currentEditingNode = null;
}

// Actualizar opciones de emparejamiento
function updatePairingOptions() {
    const selectedRole = nodeRoleSelect.value;
    pairDeviceSelect.innerHTML = '';
    pairingGroup.style.display = 'none';
    
    // Solo mostrar opciones de emparejamiento para esclavos
    if (selectedRole === 'SLAVE') {
        pairingGroup.style.display = 'block';
        
        // Obtener maestros disponibles
        const availableMasters = Object.entries(devices)
            .filter(([mac, device]) => 
                device.role === 'MASTER' && 
                device.status === 'active' &&
                mac !== currentEditingNode
            )
            .map(([mac]) => mac);
        
        if (availableMasters.length > 0) {
            availableMasters.forEach(mac => {
                const option = document.createElement('option');
                option.value = mac;
                option.textContent = mac;
                pairDeviceSelect.appendChild(option);
            });
            
            // Seleccionar maestro actual si existe
            if (devices[currentEditingNode]?.paired_with) {
                pairDeviceSelect.value = devices[currentEditingNode].paired_with;
            }
        } else {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No hay maestros disponibles';
            option.disabled = true;
            pairDeviceSelect.appendChild(option);
        }
    }
}

// Guardar configuración del nodo
function saveNodeConfig() {
    if (!currentEditingNode) return;
    
    const role = nodeRoleSelect.value;
    const pairWith = role === 'SLAVE' && pairDeviceSelect.value ? pairDeviceSelect.value : '';
    
    const config = {
        target: currentEditingNode,
        role: role
    };
    
    if (pairWith) {
        config.pair_with = pairWith;
    }
    
    console.log("Enviando configuración:", config);
    client.publish(mqttTopics.nodesConfig, JSON.stringify(config), { qos: 1 });
    
    hideModal();
}

// Función para descubrir nodos
function discoverNodes() {
    client.publish(mqttTopics.discovery, 'DISCOVER_NODES', { qos: 1 });
    alert("Solicitud de descubrimiento enviada");
}

// Inicializar la aplicación
window.addEventListener('DOMContentLoaded', () => {
    // Conectar al primer broker al cargar la página
    connectToBroker(0);
    
    updateTable();
    
    // Verificar nodos offline cada 30 segundos
    setInterval(() => {
        const now = new Date();
        let needUpdate = false;
        
        Object.keys(devices).forEach(mac => {
            if ((now - new Date(devices[mac].lastSeen)) > timeouts.offlineThreshold) {
                if (devices[mac].status !== 'offline') {
                    devices[mac].status = 'offline';
                    needUpdate = true;
                }
            }
        });
        
        if (needUpdate) updateTable();
    }, timeouts.statusCheckInterval);
});
