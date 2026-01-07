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
 * • ioBroker MQTT Srever/Broker adapter (mqtt.x)
 * • Tasmota publishes discovery messages (SetOption19 0)
 *
 */

// ==================== CONFIGURATION ====================

const CONFIG = {
    // MQTT related settings
    mqttAdapter: 'mqtt.0',              // ← CHANGE THIS to your actual MQTT adapter instance!
    tasmotaBaseTopic: 'tasmota',        // Default Tasmota topic prefix
    z2mBaseTopic: 'zigbee2mqtt',        // Topic prefix we want to emulate

    // Emulated bridge information
    bridgeVersion: '2.7.1',             // Fake Zigbee2MQTT version
    bridgeCommit: 'tasmota-bridge',     // Fake commit hash
    refreshInterval: 60,                // How often to republish bridge/devices info (seconds)

    // Fake coordinator information (important for Zigbee2MQTT to accept the bridge)
    coordinatorIeee: '0x00dead0beef0babe',
    coordinatormodel: 'Tasmota Bridge',
    coordinatorvendor: 'Tasmota',
    coordinatordescription: 'Tasmota to Zigbee2MQTT Virtual Bridge Coordinator',

    // Debug & logging
    debug: false,                       // Set to true for detailed debug output
};

// ==================== GLOBAL STATE ====================

// Stores all known Tasmota to Zigbee2MQTT device mappings
let tasmotaDevices = new Map(); // Map<MAC-address, DeviceInfo>

let initialized = false;        // Prevents premature publishing during startup

// ==================== HELPER FUNCTIONS ====================

/**
 * Debug logging (only active when CONFIG.debug = true)
 */
function logDebug(msg) {
    if (CONFIG.debug) console.log(`[DEBUG] ${msg}`);
}

/**
 * Normal information logging
 */
function logInfo(msg) {
    console.log(`[INFO] ${msg}`);
}

/**
 * Error logging
 */
function logError(msg) {
    console.error(`[ERROR] ${msg}`);
}

/**
 * Converts Tasmota MAC address format to Zigbee IEEE address format
 * Example: "600194CC5E44" → "0x0000600194cc5e44"
 */
function macToIeee(mac) {
    return `0x0000${mac.toLowerCase()}`;
}

/**
 * Creates a Zigbee2MQTT compatible device definition from Tasmota discovery data
 * Currently supports only simple on/off relays (single/multi channel)
 *
 * @param {Object} tasmotaConfig - parsed Tasmota discovery payload
 * @returns {Object} Zigbee2MQTT style device definition
 */
function createZ2MDeviceDefinition(tasmotaConfig) {
    const mac = tasmotaConfig.mac;
    const ieee = macToIeee(mac);
    const friendlyName = tasmotaConfig.dn || tasmotaConfig.t || `Tasmota_${mac}`;

    const hasRelay = tasmotaConfig.rl && tasmotaConfig.rl.some(r => r === 1);

    const exposes = [];

    // Basic on/off switch functionality
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

    // Almost every Zigbee device publishes linkquality
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
 * Creates the bridge/info payload that Zigbee2MQTT expects
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
        // ... many more config fields that most integrations just ignore
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
 * Publishes a message to a Zigbee2MQTT-style topic using ioBroker states
 * (ioBroker MQTT adapter will translate it to real MQTT)
 */
function publishMqtt(topic, payload, retain = false) {
    const fullTopic = `${CONFIG.z2mBaseTopic}/${topic}`;
    const payloadStr = typeof payload === 'object' ? JSON.stringify(payload) : String(payload);

    const stateId = `${CONFIG.mqttAdapter}.${fullTopic.replace(/\//g, '.')}`;

    // Create state if it doesn't exist yet
    if (!existsObject(stateId)) {
        createState(stateId, payloadStr, {
            name: fullTopic,
            type: 'string',
            role: 'json',
            read: true,
            write: true
        });
    } else {

        setState(stateId, payloadStr, false);
    }

    logDebug(`Published: ${fullTopic} ${payloadStr.length > 120 ? '= ' + payloadStr.substring(0, 120) + '...' : '= ' + payloadStr}`);
}

/**
 * Sends POWER command to Tasmota device via ioBroker MQTT
 */
function sendTasmotaCommand(deviceTopic, command, value) {
    const stateId = `${CONFIG.mqttAdapter}.cmnd.${deviceTopic}.${command}`;

    let numericValue = value;
    if (value === 'ON') numericValue = 1;
    else if (value === 'OFF') numericValue = 0;

    setState(stateId, numericValue, false);
    logDebug(`Tasmota cmd ${deviceTopic}/${command} = ${value}`);
}

/**
 * Publishes all important bridge information topics that Zigbee2MQTT expects
 */
async function publishBridgeTopics() {
    publishMqtt('bridge/info', createBridgeInfo(), true);

    const devices = [
        // Virtual coordinator device
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
        // All discovered Tasmota  Z2M devices
        ...Array.from(tasmotaDevices.values()).map(dev => dev.z2mDevice)
    ];

    publishMqtt('bridge/devices', devices, true);
    publishMqtt('bridge/groups', [], true);
    publishMqtt('bridge/extensions', [], true);
    publishMqtt('bridge/state', { state: 'online' }, true);

    logDebug(`Bridge topics refreshed - ${devices.length} devices total (incl. coordinator)`);
}

/**
 * Publishes current device state + availability in Z2M format
 */
function publishDeviceState(mac, state) {
    const device = tasmotaDevices.get(mac);
    if (!device) return;

    const friendlyName = device.z2mDevice.friendly_name;

    const payload = {
        state: state ? 'ON' : 'OFF',
        linkquality: 255                     // We always pretend excellent signal
    };

    publishMqtt(friendlyName, payload);
    publishMqtt(`${friendlyName}/availability`, { state: 'online' });

    logDebug(`State published: ${friendlyName} ${JSON.stringify(payload)}`);
}

// ==================== TASMOTA DISCOVERY & STATUS ====================

function handleTasmotaDiscovery(stateId) {
    try {
        const state = getState(stateId);
        if (!state?.val) return;

        const config = JSON.parse(state.val);
        const mac = config.mac;

        if (!mac) {
            logError('Discovery payload without MAC address');
            return;
        }

        // Currently we only support devices with at least one relay
        const hasRelay = config.rl?.some(r => r === 1);
        if (!hasRelay) {
            logDebug(`Skipping ${config.dn || mac} - no relay found`);
            return;
        }

        if (tasmotaDevices.has(mac)) return; // already known

        const z2mDevice = createZ2MDeviceDefinition(config);

        tasmotaDevices.set(mac, {
            mac: mac,
            config: config,
            z2mDevice: z2mDevice,
            topic: config.t,
            lastState: null
        });

        logInfo(`New Tasmota device discovered: ${config.dn || 'unnamed'} (${mac})`);

        if (initialized) {
            publishBridgeTopics();
        }

        sendTasmotaCommand(config.t, 'POWER', null);

    } catch (e) {
        logError(`Discovery parsing error: ${e.message}`);
    }
}

function handleTasmotaStatus(mac, state) {
    const device = tasmotaDevices.get(mac);
    if (!device) return;

    const newState = state === 'ON';

    if (device.lastState !== newState) {
        device.lastState = newState;
        publishDeviceState(mac, newState);
    }
}

// ==================== ZIGBEE2MQTT to TASMOTA  (Set commands) ====================

function handleZ2MSetCommand(friendlyName, payload) {
    logDebug(`Z2M set command received for ${friendlyName}: ${payload}`);

    let targetDevice = null;
    for (const dev of tasmotaDevices.values()) {
        if (dev.z2mDevice.friendly_name === friendlyName) {
            targetDevice = dev;
            break;
        }
    }

    if (!targetDevice) {
        logError(`Device not found for set command: ${friendlyName}`);
        return;
    }

    try {
        const cmd = JSON.parse(payload);

        if ('state' in cmd) {
            const tasmotaValue = String(cmd.state).toUpperCase();
            if (['ON', 'OFF', 'TOGGLE'].includes(tasmotaValue)) {
                sendTasmotaCommand(targetDevice.topic, 'POWER', tasmotaValue);
                logDebug(`${targetDevice.topic} POWER ${tasmotaValue}`);
            }
        }
        // Future: can be extended for brightness, color etc.
    } catch (e) {
        logError(`Invalid set payload: ${e.message}`);
    }
}

// ==================== SUBSCRIPTIONS & STARTUP ====================

function setupSubscriptions() {
    // 1. Tasmota discovery messages
    const discoveryPattern = `${CONFIG.mqttAdapter}.${CONFIG.tasmotaBaseTopic}.discovery.*.config`;
    $(discoveryPattern).on(obj => handleTasmotaDiscovery(obj.id));
    logInfo(`Subscribed to discovery: ${discoveryPattern}`);

    // 2. Tasmota power state changes
    const statPattern = `${CONFIG.mqttAdapter}.stat.*.POWER`;
    $(statPattern).on(obj => {
        const state = obj.state.val;
        const parts = obj.id.split('.');
        const topic = parts[parts.length - 2];

        for (const [mac, dev] of tasmotaDevices) {
            if (dev.topic === topic) {
                handleTasmotaStatus(mac, state);
                break;
            }
        }
    });
    logInfo(`Subscribed to status: ${statPattern}`);

    // 3. Zigbee2MQTT set commands (someone wants to turn on/off device)
    const z2mSetPattern = `${CONFIG.mqttAdapter}.${CONFIG.z2mBaseTopic}.*.set`;
    $(z2mSetPattern).on(obj => {
        const payload = obj.state.val;
        const parts = obj.id.split('.');
        const friendlyName = parts[parts.length - 2];

        handleZ2MSetCommand(friendlyName, payload);
    });
    logInfo(`Subscribed to Z2M commands: ${z2mSetPattern}`);
}

function scanExistingDevices() {
    const pattern = `${CONFIG.mqttAdapter}.${CONFIG.tasmotaBaseTopic}.discovery.*.config`;
    logInfo('Scanning for already discovered Tasmota devices...');

    $(pattern).each(id => handleTasmotaDiscovery(id));

    logInfo(`Found ${tasmotaDevices.size} existing device(s)`);
}

async function initialize() {
    logInfo('═'.repeat(70));
    logInfo('Starting Tasmota to Zigbee2MQTT Bridge for Matterbridge');
    logInfo('═'.repeat(70));

    setupSubscriptions();
    scanExistingDevices();

    await publishBridgeTopics();

    initialized = true;

    // Keep bridge info fresh (some integrations periodically check)
    setInterval(() => {
        if (initialized) publishBridgeTopics();
    }, CONFIG.refreshInterval * 1000);

    logInfo('Bridge successfully initialized!');
    logInfo(`Zigbee2MQTT emulation on topic: ${CONFIG.z2mBaseTopic}`);
    logInfo(`Watching Tasmota devices on:    ${CONFIG.tasmotaBaseTopic}`);
    logInfo('═'.repeat(70));
}

onStop(() => {
    logInfo('Bridge shutting down...');

    publishMqtt('bridge/state', { state: 'offline' }, true);

    for (const dev of tasmotaDevices.values()) {
        const name = dev.z2mDevice.friendly_name;
        publishMqtt(`${name}/availability`, { state: 'offline' });
    }

    logInfo('Bridge stopped');
}, 1000);

// ==================== STARTUP ====================

setTimeout(initialize, 2000);
