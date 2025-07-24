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

// Configuración de temas MQTT
const mqttTopics = {
    discovery: "iotlab/discovery",
    nodesStatus: "iotlab/nodes/status",
    nodesConfig: "iotlab/nodes/config",
    pairingResponse: "iotlab/pairing/response",
    unpairRequest: "iotlab/pairing/unpair_request",
    unpairConfirm: "iotlab/pairing/unpair_confirm"
};

// Configuración de tiempo
const timeouts = {
    offlineThreshold: 120000, // 2 minutos
    brokerSwitchDelay: 5000,  // 5 segundos
    statusCheckInterval: 30000 // 30 segundos
};
