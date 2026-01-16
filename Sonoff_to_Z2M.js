/*
 * Sonoff to Zigbee2MQTT Bridge for Matterbridge
 *
 * Copyright (c) 2026 baetzst
 *
 * Licensed under the MIT License.
 * You may obtain a copy of the License at:
 * https://opensource.org/licenses/MIT
 *
 * This script emulates Zigbee2MQTT topics for Sonoff devices,
 * so they can be made available via Matterbridge.
 *
 * Requirements:
 * - ioBroker Sonoff Adapter (sonoff.x)
 * - ioBroker MQTT Client Adapter (mqtt.x)
 *
 * MQTT Adapter settings to adjust:
 * Subscribe patterns:
 * zigbee2mqtt/#
 */
// ==================== CONFIGURATION ====================
const CONFIG = {
    // Adapter instances
    sonoffAdapter: 'sonoff.0',       // Sonoff Adapter instance (CHANGE THIS!)
    mqttAdapter: 'mqtt.4',           // MQTT Client Adapter instance (CHANGE THIS!)
    z2mBaseTopic: 'zigbee2mqtt',     // Emulated Zigbee2MQTT base topic
   
    // Bridge settings
    bridgeVersion: '1.39.0',         // Emulated Z2M version
    bridgeCommit: 'sonoff-bridge',   // Commit hash
    refreshInterval: 60,             // How often bridge/devices info should be republished (seconds)
    
    // Fake coordinator information
    coordinatorIeee: '0x00dead0beef0babe',
    coordinatormodel: 'Sonoff Bridge',
    coordinatorvendor: 'Sonoff',
    coordinatordescription: 'Sonoff to Zigbee2MQTT Virtual Bridge Coordinator',
    
    // Logging
    debug: false,                    // Enable debug output
};
// ==================== GLOBAL VARIABLES ====================
let sonoffDevices = new Map(); // Map<MAC, DeviceInfo>
let initialized = false;
// ==================== HELPER FUNCTIONS ====================
/**
 * Logging functions
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
 * Converts Sonoff MAC address to Zigbee IEEE address format
 * Example: "60:01:94:CC:5E:44" → "0x0000600194cc5e44"
 */
function macToIeee(mac) {
    const cleanMac = mac.replace(/:/g, '').toLowerCase();
    return `0x0000${cleanMac}`;
}
/**
 * Safely reads a state value
 */
function getStateValue(stateId) {
    const state = getState(stateId);
    return state ? state.val : null;
}
/**
 * Parses GPIO configuration and counts relays
 * Relay values: 224-251 (Relay1-28) and 256-283 (Relay_i1-28)
 */
function parseGPIOs(friendlyName) {
    let relayCount = 0;
    const relayGPIOs = [];
   
    // First check which GPIO states exist
    const gpioPattern = `${CONFIG.sonoffAdapter}.${friendlyName}.GPIO_*`;
    const gpioStates = $(gpioPattern);
   
    gpioStates.each((stateId) => {
        const value = getStateValue(stateId);
       
        if (value !== null) {
            // Relay1-28 (224-251) or Relay_i1-28 (256-283)
            if ((value >= 224 && value <= 251) || (value >= 256 && value <= 283)) {
                relayCount++;
                const gpioNum = stateId.split('.').pop().replace('GPIO_', '');
                relayGPIOs.push({gpio: gpioNum, value: value});
            }
        }
    });
   
    if (relayGPIOs.length > 0) {
        logDebug(`Found ${relayCount} relay(s) for ${friendlyName}: ${JSON.stringify(relayGPIOs)}`);
    }
   
    return relayCount;
}
/**
 * Creates a Zigbee2MQTT-style device definition for a Sonoff switch
 * CHANGED: Now supports multi-relay devices with endpoints
 */
function createZ2MDeviceDefinition(deviceInfo) {
    const mac = deviceInfo.mac;
    const ieee = macToIeee(mac);
    const friendlyName = deviceInfo.friendlyName;
   
    const exposes = [];
   
    // CHANGED: Create expose for each relay with endpoint
    if (deviceInfo.relayCount > 0) {
        for (let i = 1; i <= deviceInfo.relayCount; i++) {
            const endpoint = `l${i}`;
            const property = deviceInfo.relayCount === 1 ? 'state' : `state_l${i}`;
            
            exposes.push({
                endpoint: endpoint,
                type: "switch",
                features: [
                    {
                        access: 7, // read/write/publish
                        description: "On/off state of the switch",
                        endpoint: endpoint,
                        label: "State",
                        name: "state",
                        property: property,
                        type: "binary",
                        value_off: "OFF",
                        value_on: "ON",
                        value_toggle: "TOGGLE"
                    }
                ]
            });
        }
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
   
    // CHANGED: Create endpoints for each relay
    const endpoints = {};
    for (let i = 1; i <= deviceInfo.relayCount; i++) {
        endpoints[i.toString()] = {
            bindings: [],
            clusters: {
                input: ['genBasic', 'genIdentify', 'genOnOff'],
                output: []
            },
            configured_reportings: [],
            name: `l${i}`,
            scenes: []
        };
    }
   
    return {
        ieee_address: ieee,
        type: 'Router',
        network_address: parseInt(mac.replace(/:/g, '').substring(8), 16),
        supported: true,
        friendly_name: friendlyName,
        disabled: false,
        definition: {
            model: deviceInfo.model || 'Generic',
            vendor: 'Sonoff',
            description: `Sonoff ${deviceInfo.model || 'Device'}`,
            exposes: exposes,
            options: [],
            supports_ota: false,
            source: "native"
        },
        power_source: 'Mains (single phase)',
        model_id: deviceInfo.model || 'Generic',
        manufacturer: 'Sonoff',
        endpoints: endpoints,
        interview_completed: true,
        interviewing: false,
        interview_state: "SUCCESSFUL",
        software_build_id: deviceInfo.version || '1.0.0',
        date_code: new Date().toISOString().split('T')[0].replace(/-/g, '')
    };
}
/**
 * Creates the Zigbee2MQTT bridge information payload
 */
function createBridgeInfo() {
    return {
        version: CONFIG.bridgeVersion,
        commit: CONFIG.bridgeCommit,
        coordinator: {
            ieee_address: CONFIG.coordinatorIeee,
            type: 'sonoff-bridge',
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
                adapter: 'sonoff-bridge',
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
 * Publishes an MQTT message using the MQTT client adapter
 */
function publishMqtt(topic, payload, retain = false) {
    const fullTopic = `${CONFIG.z2mBaseTopic}/${topic}`;
    const payloadStr = typeof payload === 'object' ? JSON.stringify(payload) : payload;
   
    sendTo(CONFIG.mqttAdapter, 'sendMessage2Client', {
        topic: fullTopic,
        message: payloadStr
        // retain flag is currently not supported in this sendTo call
    });
   
    logDebug(`Published: ${fullTopic} = ${payloadStr.substring(0, 100)}${payloadStr.length > 100 ? '...' : ''}`);
}
/**
 * Publishes all important bridge information topics
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
        // all Sonoff devices
        ...Array.from(sonoffDevices.values()).map(dev => dev.z2mDevice)
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
 * Publishes device state and availability to Zigbee2MQTT topics
 * CHANGED: Now supports multi-relay devices with state_l1, state_l2, etc.
 */
function publishDeviceState(mac, states, available = true) {
    const device = sonoffDevices.get(mac);
    if (!device) return;
   
    const friendlyName = device.z2mDevice.friendly_name;
   
    // Build payload with all relay states
    const payload = {
        linkquality: 255
    };
    
    // CHANGED: Add state for each relay
    if (device.relayCount === 1) {
        // Single relay: use "state"
        payload.state = states[0] ? 'ON' : 'OFF';
    } else {
        // Multi relay: use "state_l1", "state_l2", etc.
        for (let i = 0; i < device.relayCount; i++) {
            payload[`state_l${i + 1}`] = states[i] ? 'ON' : 'OFF';
        }
    }
    
    publishMqtt(friendlyName, payload);
    publishMqtt(`${friendlyName}/availability`, { state: available ? 'online' : 'offline' });
   
    logDebug(`Published state for ${friendlyName}: ${JSON.stringify(payload)}, available: ${available}`);
}
// ==================== SONOFF DEVICE DISCOVERY ====================
/**
 * Scans for all Sonoff devices
 */
function scanSonoffDevices() {
    logInfo('Scanning for Sonoff devices...');
   
    // Search all objects under sonoff.0.*
    const pattern = `${CONFIG.sonoffAdapter}.*`;
    const allObjects = $(pattern);
   
    // Find all device folders (which contain a MacAddress)
    const deviceFolders = new Set();
   
    allObjects.each((id) => {
        if (id.includes('.STATUS.StatusNET_Mac')) {
            // Extract friendlyName
            const parts = id.split('.');
            if (parts.length >= 3) {
                const friendlyName = parts[2];
                deviceFolders.add(friendlyName);
            }
        }
    });
   
    logInfo(`Found ${deviceFolders.size} potential Sonoff device(s)`);
   
    // Process each found device
    deviceFolders.forEach(friendlyName => {
        processSonoffDevice(friendlyName);
    });
   
    logInfo(`Registered ${sonoffDevices.size} Sonoff device(s)`);
}
/**
 * Processes a single Sonoff device
 * CHANGED: Now supports multi-relay devices
 */
function processSonoffDevice(friendlyName) {
    try {
        // Read MAC address
        const macState = `${CONFIG.sonoffAdapter}.${friendlyName}.STATUS.StatusNET_Mac`;
        const mac = getStateValue(macState);
       
        if (!mac) {
            logDebug(`No MAC address found for ${friendlyName}`);
            return;
        }
       
        // Read model
        const modelState = `${CONFIG.sonoffAdapter}.${friendlyName}.INFO.Info1_Module`;
        const model = getStateValue(modelState);
       
        // Read firmware version
        const versionState = `${CONFIG.sonoffAdapter}.${friendlyName}.INFO.Info1_Version`;
        const version = getStateValue(versionState);
       
        // Parse GPIO configuration and count relays
        const relayCount = parseGPIOs(friendlyName);
       
        // Debug output for all discovered devices
        logDebug(`Device ${friendlyName}: MAC=${mac}, Model=${model}, Version=${version}, Relays=${relayCount}`);
       
        // CHANGED: Accept devices with any number of relays (1-28)
        if (relayCount === 0 || relayCount > 28) {
            logInfo(`Device ${friendlyName} has ${relayCount} relay(s), skipping (must have 1-28 relays)`);
            return;
        }
       
        // CHANGED: Collect device information including relay count
        const deviceInfo = {
            mac: mac,
            friendlyName: friendlyName,
            model: model,
            version: version,
            relayCount: relayCount,
            lastStates: new Array(relayCount).fill(null),  // CHANGED: Array of states
            lastAvailable: null
        };
       
        // Create Z2M device definition
        const z2mDevice = createZ2MDeviceDefinition(deviceInfo);
        deviceInfo.z2mDevice = z2mDevice;
       
        // Add to device map
        sonoffDevices.set(mac, deviceInfo);
       
        logInfo(`Discovered Sonoff device: ${friendlyName} (${mac}) - Model: ${model}, Version: ${version}, Relays: ${relayCount}`);
       
        // CHANGED: Read initial state for all relays
        const initialStates = [];
        for (let i = 1; i <= relayCount; i++) {
            const powerState = relayCount === 1 
                ? `${CONFIG.sonoffAdapter}.${friendlyName}.POWER`
                : `${CONFIG.sonoffAdapter}.${friendlyName}.POWER${i}`;
            const power = getStateValue(powerState);
            initialStates.push(power !== null ? power : false);
            if (power !== null) {
                deviceInfo.lastStates[i - 1] = power;
            }
        }
        
        const aliveState = `${CONFIG.sonoffAdapter}.${friendlyName}.alive`;
        const alive = getStateValue(aliveState);
       
        if (alive !== null) {
            deviceInfo.lastAvailable = alive;
        }
       
        // Publish initial state if we already finished initialization
        if (initialized && alive !== null) {
            publishDeviceState(mac, initialStates, alive);
        }
       
    } catch (e) {
        logError(`Error processing device ${friendlyName}: ${e.message}`);
    }
}
/**
 * Handles changes of Sonoff POWER state
 * CHANGED: Now handles POWERx for multi-relay devices
 */
function handleSonoffPowerChange(friendlyName, relayNum, state) {
    // Find device by friendlyName
    let device = null;
    for (const [mac, dev] of sonoffDevices) {
        if (dev.friendlyName === friendlyName) {
            device = dev;
            break;
        }
    }
   
    if (!device) {
        logDebug(`Device ${friendlyName} not found for power change`);
        return;
    }
   
    const newState = state === true || state === 'true' || state === 1;
    const relayIndex = relayNum - 1;
    
    // CHANGED: Update specific relay state
    if (relayIndex >= 0 && relayIndex < device.relayCount) {
        if (device.lastStates[relayIndex] !== newState) {
            device.lastStates[relayIndex] = newState;
            const available = device.lastAvailable !== false;
            publishDeviceState(device.mac, device.lastStates, available);
        }
    }
}
/**
 * Handles changes of Sonoff device availability (alive)
 */
function handleSonoffAliveChange(friendlyName, alive) {
    // Find device by friendlyName
    let device = null;
    for (const [mac, dev] of sonoffDevices) {
        if (dev.friendlyName === friendlyName) {
            device = dev;
            break;
        }
    }
   
    if (!device) {
        logDebug(`Device ${friendlyName} not found for alive change`);
        return;
    }
   
    const available = alive === true || alive === 'true' || alive === 1;
   
    if (device.lastAvailable !== available) {
        device.lastAvailable = available;
        publishDeviceState(device.mac, device.lastStates, available);
    }
}
// ==================== ZIGBEE2MQTT COMMAND HANDLER ====================
/**
 * Handles incoming Zigbee2MQTT set commands
 * CHANGED: Now handles state_l1, state_l2, etc. for multi-relay devices
 */
function handleZ2MSetCommand(friendlyName, payload) {
    logDebug(`Received Z2M command for ${friendlyName}: ${payload}`);
   
    // Find device by friendly_name
    let device = null;
    for (const [mac, dev] of sonoffDevices) {
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
       
        // CHANGED: Handle both single relay "state" and multi-relay "state_lX"
        
        // Single relay device: "state"
        if ('state' in cmd && device.relayCount === 1) {
            const stateCmd = cmd.state.toUpperCase();
            let newState;
           
            if (stateCmd === 'TOGGLE') {
                newState = !device.lastStates[0];
            } else {
                newState = stateCmd === 'ON';
            }
           
            const powerState = `${CONFIG.sonoffAdapter}.${device.friendlyName}.POWER`;
            setState(powerState, newState);
           
            logDebug(`Setting POWER for ${device.friendlyName} to ${newState}`);
        }
        
        // Multi-relay device: "state_l1", "state_l2", etc.
        for (let i = 1; i <= device.relayCount; i++) {
            const stateProperty = `state_l${i}`;
            if (stateProperty in cmd) {
                const stateCmd = cmd[stateProperty].toUpperCase();
                let newState;
                
                if (stateCmd === 'TOGGLE') {
                    newState = !device.lastStates[i - 1];
                } else {
                    newState = stateCmd === 'ON';
                }
                
                const powerState = device.relayCount === 1
                    ? `${CONFIG.sonoffAdapter}.${device.friendlyName}.POWER`
                    : `${CONFIG.sonoffAdapter}.${device.friendlyName}.POWER${i}`;
                setState(powerState, newState);
                
                logDebug(`Setting POWER${i} for ${device.friendlyName} to ${newState}`);
            }
        }
       
    } catch (e) {
        logError(`Error processing set command: ${e.message}`);
    }
}
// ==================== SUBSCRIPTIONS ====================
/**
 * Sets up all required state subscriptions
 * CHANGED: Now subscribes to POWERx for multi-relay support
 */
function setupSubscriptions() {
    // CHANGED: Watch both POWER and POWERx states (POWER1, POWER2, etc.)
    const powerPattern = `${CONFIG.sonoffAdapter}.*.POWER*`;
    $(powerPattern).on((obj) => {
        const parts = obj.id.split('.');
        if (parts.length >= 4) {
            const friendlyName = parts[2];
            const powerPart = parts[3];
            const state = obj.state.val;
            
            // Extract relay number (POWER = 1, POWER1 = 1, POWER2 = 2, etc.)
            let relayNum = 1;
            if (powerPart.length > 5) { // POWERx
                relayNum = parseInt(powerPart.substring(5));
            }
            
            handleSonoffPowerChange(friendlyName, relayNum, state);
        }
    });
    logInfo(`Subscribed to Sonoff power states: ${powerPattern}`);
   
    // Watch Sonoff alive states
    const alivePattern = `${CONFIG.sonoffAdapter}.*.alive`;
    $(alivePattern).on((obj) => {
        const parts = obj.id.split('.');
        if (parts.length >= 3) {
            const friendlyName = parts[2];
            const alive = obj.state.val;
            handleSonoffAliveChange(friendlyName, alive);
        }
    });
    logInfo(`Subscribed to Sonoff alive states: ${alivePattern}`);
   
    // Watch Zigbee2MQTT set commands
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
// ==================== INITIALIZATION ====================
/**
 * Initializes the whole bridge
 */
async function initialize() {
    logInfo('='.repeat(60));
    logInfo('Sonoff to Zigbee2MQTT Bridge starting...');
    logInfo('='.repeat(60));
   
    // Setup all subscriptions
    setupSubscriptions();
   
    // Discover Sonoff devices
    scanSonoffDevices();
   
    // Publish all bridge topics
    await publishBridgeTopics();
   
    // Mark initialization as complete
    initialized = true;
   
    // Periodic refresh of bridge information
    setInterval(() => {
        if (initialized) {
            publishBridgeTopics();
            logDebug('Periodic refresh of bridge topics');
        }
    }, CONFIG.refreshInterval * 1000);
   
    logInfo('='.repeat(60));
    logInfo('Bridge initialized successfully!');
    logInfo(`Emulating Zigbee2MQTT on topic: ${CONFIG.z2mBaseTopic}`);
    logInfo(`Monitoring Sonoff devices from adapter: ${CONFIG.sonoffAdapter}`);
    logInfo(`Total devices registered: ${sonoffDevices.size}`);
    logInfo('='.repeat(60));
}
/**
 * Cleanup when script is stopped
 */
onStop(() => {
    logInfo('Bridge stopping...');
   
    // Set bridge offline
    publishMqtt('bridge/state', {state: 'offline'}, true);
   
    // Set all devices offline
    for (const [mac, device] of sonoffDevices) {
        const friendlyName = device.z2mDevice.friendly_name;
        publishMqtt(`${friendlyName}/availability`, {state: 'offline'});
    }
   
    logInfo('Bridge stopped');
}, 1000);
// ==================== START ====================
// Give ioBroker a moment to load all states
setTimeout(initialize, 2000);
