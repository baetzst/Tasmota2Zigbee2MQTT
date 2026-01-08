/*
 * Tasmota to Zigbee2MQTT Bridge for Matterbridge
 *
 * Copyright (c) 2026 <DEIN NAME ODER GITHUB USERNAME>
 *
 * Licensed under the MIT License.
 * You may obtain a copy of the License at:
 * https://opensource.org/licenses/MIT
 *
 * This script emulates Zigbee2MQTT MQTT topics for Tasmota devices
 * so they can be discovered and controlled via matterbridge-zigbee2mqtt plugin
 *
 * Requirements:
 * • ioBroker MQTT Client adapter (mqtt.x)
 * • Tasmota publishes discovery messages (SetOption19 0)
 *
 */

// ==================== KONFIGURATION ====================

const CONFIG = {
    // MQTT Topics
    mqttAdapter: 'mqtt.0',              // MQTT Client Adapter Instanz (ANPASSEN!)
    tasmotaBaseTopic: 'tasmota',        // Tasmota Base Topic
    z2mBaseTopic: 'zigbee2mqtt',        // Emuliertes Zigbee2MQTT Base Topic
    
    // Bridge Einstellungen
    bridgeVersion: '1.39.0',            // Emulierte Z2M Version
    bridgeCommit: 'tasmota-bridge',     // Commit Hash
    refreshInterval: 60,                // Wie oft bridge/devices info republished werden in Sekunden

    // Fake coordinator Informationen
    coordinatorIeee: '0x00dead0beef0babe',
    coordinatormodel: 'Tasmota Bridge',
    coordinatorvendor: 'Tasmota',
    coordinatordescription: 'Tasmota to Zigbee2MQTT Virtual Bridge Coordinator',

    // Logging
    debug: false,                       // Debug-Ausgaben aktivieren
};

														 

// ==================== GLOBALE VARIABLEN ====================
															   

let tasmotaDevices = new Map(); // Map<MAC, DeviceInfo>
let initialized = false;

// ==================== HILFSFUNKTIONEN ====================

/**
 * Logging-Funktionen
 */
function logDebug(msg) {
    if (CONFIG.debug) console.log(`[DEBUG] ${msg}`);
}

   
							 
   
function logInfo(msg) {
    console.log(`[INFO] ${msg}`);
}

   
				
   
function logError(msg) {
    console.error(`[ERROR] ${msg}`);
}

/**
 * Konvertiert Tasmota MAC zu Zigbee IEEE Address
 * Beispiel: "600194CC5E44" -> "0x0000600194cc5e44"
 */
function macToIeee(mac) {
    return `0x0000${mac.toLowerCase()}`;
}

/**
 * Erstellt eine Zigbee2MQTT Device Definition für einen Tasmota Switch
																	  
  
																   
														
 */
function createZ2MDeviceDefinition(tasmotaConfig) {
    const mac = tasmotaConfig.mac;
    const ieee = macToIeee(mac);
    const friendlyName = tasmotaConfig.dn || tasmotaConfig.t || `Tasmota_${mac}`;
    
    // Prüfe welche Features das Gerät hat
    const hasRelay = tasmotaConfig.rl && tasmotaConfig.rl.some(r => r === 1);
    
    const exposes = [];
    
    // Switch oder Light Expose
    if (hasRelay) {
        exposes.push({
            type: "switch",
            features: [
                {
                    access: 7,                      // read/write/publish
                    description: "On/off state of this switch",
                    label: "State",
                    name: "state",
                    property: "state",
                    type: "binary",
                    value_off: "OFF",
                    value_on: "ON",
                    value_toggle: "TOGGLE"
                }
            ]
        });
    }
    
    // Linkquality
    exposes.push({
        access: 1,
        category: "diagnostic",
        description: "Link quality (signal strength)",
        label: "Linkquality",
        name: "linkquality",
        property: "linkquality",
        type: "numeric",
        unit: "lqi",
        value_max: 255,
        value_min: 0
    });
    
    return {
        ieee_address: ieee,
        type: 'Router',
        network_address: parseInt(mac.substring(8), 16),
        supported: true,
        friendly_name: friendlyName,
        disabled: false,
        definition: {
            model: tasmotaConfig.md || 'Generic',
            vendor: 'Tasmota',
            description: `Tasmota ${tasmotaConfig.md || 'Device'}`,
            exposes: exposes,
            options: [],
            supports_ota: false,
            source: "native"
        },
        power_source: 'Mains (single phase)',
        model_id: tasmotaConfig.md || 'Generic',
        manufacturer: 'Tasmota',
        endpoints: {
            '1': {
                bindings: [],
                clusters: {
                    input: ['genBasic', 'genIdentify', 'genOnOff'],
                    output: []
                },
                configured_reportings: [],
                scenes: []
            }
        },
        interview_completed: true,
        interviewing: false,
        interview_state: "SUCCESSFUL",
        software_build_id: tasmotaConfig.sw || '1.0.0',
        date_code: new Date().toISOString().split('T')[0].replace(/-/g, '')
    };
}

/**
 * Erstellt die Zigbee2MQTT Bridge Info
 */
function createBridgeInfo() {
    return {
        version: CONFIG.bridgeVersion,
        commit: CONFIG.bridgeCommit,
        coordinator: {
            ieee_address: CONFIG.coordinatorIeee,
            type: 'tasmota-bridge',
            meta: {
                revision: 20230507,
                maintrel: 1,
                majorrel: 2,
                minorrel: 7,
                product: 1,
                transportrev: 2
            }
        },
        zigbee_herdsman: { version: "7.0.4" },
        zigbee_herdsman_converters: { version: "25.83.1" },
        network: {
            channel: 15,
            extended_pan_id: CONFIG.coordinatorIeee,
            pan_id: 0815
        },
        log_level: CONFIG.debug ? 'debug' : 'error',
        permit_join: false,
        restart_required: false,
																		 
        config: {
            advanced: {
                output: 'json',
                legacy_api: false,
                legacy_availability_payload: false,
                cache_state: true,
                cache_state_persistent: true,
                cache_state_send_on_startup: true,
                elapsed: false,
                log_level: CONFIG.debug ? 'debug' : 'error',
                pan_id: 6754,
                channel: 15,
                transmit_power: 20
            },
            availability: {
                active: { timeout: 10 },
                passive: { timeout: 1500 },
                enabled: true
            },
            devices: {},
            groups: {},
            homeassistant: { enabled: false },
            mqtt: {
                base_topic: CONFIG.z2mBaseTopic,
                server: 'mqtt://localhost',
                version: 4
            },
            serial: {
                adapter: 'tasmota-bridge',
                port: 'virtual'
            },
            frontend: {
                enabled: true,
                package: 'zigbee2mqtt-frontend',
                port: 8080
            }
        },
        mqtt: {
            server: 'mqtt://localhost',
            version: 4
        }
    };
}

/**
 * Publiziert eine MQTT Nachricht
														 
 */
function publishMqtt(topic, payload, retain = false) {
    const fullTopic = `${CONFIG.z2mBaseTopic}/${topic}`;
    const payloadStr = typeof payload === 'object' ? JSON.stringify(payload) : payload;
    
    sendTo(CONFIG.mqttAdapter, 'sendMessage2Client', {

										   
								 
										  
        topic: fullTopic,
        message: payloadStr
						 
					   
					   
    });
    

											 
	 

    logDebug(`Published: ${fullTopic} = ${payloadStr.substring(0, 100)}${payloadStr.length > 100 ? '...' : ''}`);
 

   
														  
   
														  
																		   

							 
										 
											   

										   
																 
}

/**
 * Publiziert alle Bridge-Topics mit Delays
 */
async function publishBridgeTopics() {
    // Bridge Info
    publishMqtt('bridge/info', createBridgeInfo(), true);
    
    // Bridge Devices
    const devices = [
									 
        {
            disabled: false,
            friendly_name: "Coordinator",
            ieee_address: CONFIG.coordinatorIeee,
            interview_completed: true,
            interview_state: "SUCCESSFUL",
            interviewing: false,
            network_address: 0,
            supported: true,
            type: "Coordinator",
            definition: {
                model: CONFIG.coordinatormodel,
                vendor: CONFIG.coordinatorvendor,
                description: CONFIG.coordinatordescription
            }
        },
        // alle Tasmota Geräte
        ...Array.from(tasmotaDevices.values()).map(dev => dev.z2mDevice)
    ];

    publishMqtt('bridge/devices', devices, true);
    
    // Bridge Groups
    publishMqtt('bridge/groups', [], true);
    
    // Bridge Extensions
    publishMqtt('bridge/extensions', [], true);
    
    // Bridge State
    publishMqtt('bridge/state', {state: 'online'}, true);
    
    logDebug(`Bridge topics published with ${devices.length} devices (including coordinator)`);
}

/**
 * Publiziert Device State und Availability
 */
function publishDeviceState(mac, state) {
    const device = tasmotaDevices.get(mac);
    if (!device) return;
    
    const friendlyName = device.z2mDevice.friendly_name;
    
    const payload = {
        state: state ? 'ON' : 'OFF',
        linkquality: 255
    };

    publishMqtt(friendlyName, payload);
    publishMqtt(`${friendlyName}/availability`, { state: 'online' });
    
    logDebug(`Published state for ${friendlyName}: ${JSON.stringify(payload)}`);
}

// ==================== TASMOTA DISCOVERY HANDLER ====================

/**
 * Verarbeitet Tasmota Discovery Nachrichten
 */
function handleTasmotaDiscovery(stateId) {
    try {
        const state = getState(stateId);
        if (!state || !state.val) {
            logError(`Discovery state not found or empty: ${stateId}`);
            return;
        }
        
        const config = JSON.parse(state.val);
        const mac = config.mac;
        
        if (!mac) {
            logError('Discovery message without MAC address');
            return;
        }
        
        // Prüfen ob Gerät Relais hat
        const hasRelay = config.rl?.some(r => r === 1);      
        if (!hasRelay) {
            logDebug(`Device ${config.dn} has no relay, skipping`);
            return;
        }
        
        // Gerät zur Map hinzufügen
        if (!tasmotaDevices.has(mac)) {

            const z2mDevice = createZ2MDeviceDefinition(config);

            tasmotaDevices.set(mac, {
                mac: mac,
                config: config,
                z2mDevice: z2mDevice,
                topic: config.t,
                lastState: null
            });
            
            logInfo(`Discovered Tasmota device: ${config.dn} (${mac}) - Type: ${z2mDevice.definition.exposes[0].type}`);
            
            // Bridge Topics aktualisieren
            if (initialized) {
                publishBridgeTopics();
            }
            
            // Initialen State abfragen
            sendTo(CONFIG.mqttAdapter, 'sendMessage2Client', {
                topic: `cmnd/${config.t}/POWER`,
                message: ''
            });
        }

													

    } catch (e) {
        logError(`Error processing discovery: ${e.message}`);
    }
}

/**
 * Verarbeitet Tasmota Status Nachrichten
 */
function handleTasmotaStatus(mac, state) {
    const device = tasmotaDevices.get(mac);
    if (!device) return;
    
    const newState = state === 'ON';

    if (device.lastState !== newState) {
        device.lastState = newState;
        publishDeviceState(mac, newState);
    }
}

// ==================== ZIGBEE2MQTT COMMAND HANDLER ====================

/**
 * Verarbeitet Zigbee2MQTT Set Commands
 */
function handleZ2MSetCommand(friendlyName, payload) {
    logDebug(`Received Z2M command for ${friendlyName}: ${payload}`);
    
    // Finde Gerät anhand friendly_name
    let device = null;
    for (const [mac, dev] of tasmotaDevices) {
        if (dev.z2mDevice.friendly_name === friendlyName) {
            device = dev;
            break;
        }
    }
    
    if (!device) {
        logError(`Device ${friendlyName} not found for set command`);
        return;
    }
    
    try {
        const cmd = JSON.parse(payload);
        
        // State (ON/OFF)
        if ('state' in cmd) {
            const tasmotaCmd = cmd.state.toUpperCase();
            sendTo(CONFIG.mqttAdapter, 'sendMessage2Client', {
                topic: `cmnd/${device.topic}/POWER`,
                message: tasmotaCmd
            });
            logDebug(`Sending POWER command to ${device.topic}: ${tasmotaCmd}`);
        }
															 
    } catch (e) {
        logError(`Error processing set command: ${e.message}`);
    }
}

// ==================== SUBSCRIPTIONS ====================

/**
 * Richtet alle erforderlichen Subscriptions ein
 */
function setupSubscriptions() {
    // Tasmota Discovery überwachen
    const discoveryPattern = `${CONFIG.mqttAdapter}.${CONFIG.tasmotaBaseTopic}.discovery.*.config`;
    $(discoveryPattern).on((obj) => {
        handleTasmotaDiscovery(obj.id);
    });
    logInfo(`Subscribed to Tasmota discovery: ${discoveryPattern}`);
    
    // Tasmota Status überwachen (stat topics)
    const statPattern = `${CONFIG.mqttAdapter}.stat.*.POWER`;
    $(statPattern).on((obj) => {
        const state = obj.state.val;
        const parts = obj.id.split('.');
        const topic = parts[parts.length - 2];
        
        // MAC finden
        for (const [mac, device] of tasmotaDevices) {
            if (device.topic === topic) {
                handleTasmotaStatus(mac, state);
                break;
            }
        }
    });
    logInfo(`Subscribed to Tasmota status: ${statPattern}`);
    
    // Zigbee2MQTT Set Commands überwachen
    const z2mSetRegex = new RegExp(
        `^${CONFIG.mqttAdapter}\\.${CONFIG.z2mBaseTopic}\\.([^\\.]+)\\.set$`
    );

    on({ id: z2mSetRegex, change: 'any' }, (obj) => {
        const payload = obj.state.val;
        const parts = obj.id.split('.');
        const friendlyName = parts[parts.length - 2];

        handleZ2MSetCommand(friendlyName, payload);
    });

    logInfo(`Subscribed to Z2M commands: ${CONFIG.mqttAdapter}.${CONFIG.z2mBaseTopic}.*.set`);
}

/**
 * Scannt existierende Discovery Nachrichten
 */
function scanExistingDevices() {
    const discoveryPattern = `${CONFIG.mqttAdapter}.${CONFIG.tasmotaBaseTopic}.discovery.*.config`;
    const existingDevices = $(discoveryPattern);
    
    logInfo(`Scanning for existing Tasmota devices...`);
    existingDevices.each((id) => {
        handleTasmotaDiscovery(id);
    });
    
    logInfo(`Found ${tasmotaDevices.size} Tasmota device(s)`);
}

// ==================== INITIALISIERUNG ====================
							  
																	   
							  

/**
 * Initialisiert die Bridge
 */
async function initialize() {
    logInfo('='.repeat(60));
    logInfo('Tasmota to Zigbee2MQTT Bridge starting...');
    logInfo('='.repeat(60));
    
    // Subscriptions einrichten
    setupSubscriptions();
    
    // Existierende Geräte scannen
    scanExistingDevices();
    
    // Bridge Topics publizieren (mit Delays)
    await publishBridgeTopics();
    
    // Initialisierung abgeschlossen
    initialized = true;
    
    // Periodic refresh alle 60 Sekunden
    setInterval(() => {
        if (initialized) {
            publishBridgeTopics();
            logDebug('Periodic refresh of bridge topics');
        }
    }, CONFIG.refreshInterval * 1000);

    logInfo('='.repeat(60));
    logInfo('Bridge initialized successfully!');
    logInfo(`Emulating Zigbee2MQTT on topic: ${CONFIG.z2mBaseTopic}`);
    logInfo(`Monitoring Tasmota devices on topic: ${CONFIG.tasmotaBaseTopic}`);
    logInfo('='.repeat(60));
}

/**
 * Cleanup beim Stoppen
 */
onStop(() => {
    logInfo('Bridge stopping...');
    
    // Bridge offline setzen
    publishMqtt('bridge/state', {state: 'offline'}, true);
    
    // Alle Geräte offline setzen
    for (const [mac, device] of tasmotaDevices) {
        const friendlyName = device.z2mDevice.friendly_name;
        publishMqtt(`${friendlyName}/availability`, {state: 'offline'});
    }
    
    logInfo('Bridge stopped');
}, 1000);

// ==================== START ====================

// Warte kurz, damit ioBroker alle States geladen hat
setTimeout(initialize, 2000);
