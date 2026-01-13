/*
 * Sonoff Data Updater
 *
 * Copyright (c) 2026 baetzst
 *
 * Licensed under the MIT License.
 * You may obtain a copy of the License at:
 * https://opensource.org/licenses/MIT
 *
 * This script checks all Sonoff devices and retrieves missing data:
 * - MAC address (via "status 5")
 * - GPIO configuration (via "Template")
 *
 * Requirements:
 * - ioBroker Sonoff Adapter (sonoff.x)
 */

// ==================== CONFIGURATION ====================

const CONFIG = {
    sonoffAdapter: 'sonoff.0',          // Sonoff Adapter instance (CHANGE THIS!)
    
    // Wait time after HTTP request (in milliseconds)
    waitAfterRequest: 1500,             // 1.5 seconds waiting for state updates
    
    // Logging
    debug: true,                        // Enable debug output
};

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
 * Safely reads a state value
 */
function getStateValue(stateId) {
    if (!existsState(stateId)) {
        return null;
    }
    const state = getState(stateId);
    return state ? state.val : null;
}

/**
 * Sends HTTP command to Tasmota device
 */
async function sendTasmotaCommand(ip, command) {
    return new Promise((resolve) => {
        try {
            const url = `http://${ip}/cm?cmnd=${encodeURIComponent(command)}`;
            logDebug(`Sending command to ${ip}: ${command}`);
            
            httpGet(url, { timeout: 5000 }, (err, response) => {
                if (err) {
                    logError(`HTTP request failed for ${ip}: ${err}`);
                    resolve(false);
                } else {
                    logDebug(`Command sent successfully to ${ip}`);
                    resolve(true);
                }
            });
        } catch (e) {
            logError(`Error sending command to ${ip}: ${e.message}`);
            resolve(false);
        }
    });
}

/**
 * Waits for a specified time (in milliseconds)
 */
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== DEVICE PROCESSING ====================

/**
 * Processes a single Sonoff device
 */
async function processDevice(friendlyName) {
    logInfo(`Processing device: ${friendlyName}`);
    
    try {
        // Check if device is online
        const aliveState = `${CONFIG.sonoffAdapter}.${friendlyName}.alive`;
        const alive = getStateValue(aliveState);
        
        if (!alive) {
            logInfo(`  Device ${friendlyName} is offline, skipping`);
            return { success: false, reason: 'offline' };
        }
        
        // Read IP address
        const ipState = `${CONFIG.sonoffAdapter}.${friendlyName}.INFO.Info2_IPAddress`;
        const ip = getStateValue(ipState);
        
        if (!ip) {
            logError(`  No IP address found for ${friendlyName}`);
            return { success: false, reason: 'no_ip' };
        }
        
        logDebug(`  Device IP: ${ip}`);
        
        let macRequested = false;
        let gpioRequested = false;
        
        // Check and request MAC address if missing
        const macState = `${CONFIG.sonoffAdapter}.${friendlyName}.STATUS.StatusNET_Mac`;
        let mac = getStateValue(macState);
        
        if (!mac) {
            logInfo(`  MAC address not found, requesting status 5...`);
            const success = await sendTasmotaCommand(ip, 'status 5');
            if (success) {
                macRequested = true;
                await wait(CONFIG.waitAfterRequest);
                mac = getStateValue(macState);
                
                if (mac) {
                    logInfo(`  ✓ MAC address retrieved: ${mac}`);
                } else {
                    logError(`  ✗ Failed to retrieve MAC address`);
                }
            }
        } else {
            logDebug(`  MAC already present: ${mac}`);
        }
        
        // Check and request GPIO configuration if missing
        const gpioPattern = `${CONFIG.sonoffAdapter}.${friendlyName}.GPIO_*`;
        let gpioStates = $(gpioPattern);
        
        if (gpioStates.length === 0) {
            logInfo(`  GPIO states not found, requesting Template...`);
            const success = await sendTasmotaCommand(ip, 'Template');
            if (success) {
                gpioRequested = true;
                await wait(CONFIG.waitAfterRequest);
                gpioStates = $(gpioPattern);
                
                if (gpioStates.length > 0) {
                    logInfo(`  ✓ GPIO states retrieved: ${gpioStates.length} GPIO(s)`);
                } else {
                    logError(`  ✗ Failed to retrieve GPIO states`);
                }
            }
        } else {
            logDebug(`  GPIO states already present: ${gpioStates.length} GPIO(s)`);
        }
        
        return {
            success: true,
            mac: mac,
            gpioCount: gpioStates.length,
            macRequested: macRequested,
            gpioRequested: gpioRequested
        };
        
    } catch (e) {
        logError(`  Error processing device ${friendlyName}: ${e.message}`);
        return { success: false, reason: 'error', error: e.message };
    }
}

/**
 * Scans and updates all Sonoff devices
 */
async function scanAndUpdateDevices() {
    logInfo('='.repeat(60));
    logInfo('Sonoff Data Updater starting...');
    logInfo('='.repeat(60));
    
    // Search all objects under sonoff.0.*
    const pattern = `${CONFIG.sonoffAdapter}.*`;
    const allObjects = $(pattern);
    
    // Find all device folders (containing Info2_IPAddress)
    const deviceFolders = new Set();
    
    allObjects.each((id) => {
        if (id.includes('.INFO.Info2_IPAddress')) {
            // Extract friendlyName
            const parts = id.split('.');
            if (parts.length >= 3) {
                const friendlyName = parts[2];
                deviceFolders.add(friendlyName);
            }
        }
    });
    
    logInfo(`Found ${deviceFolders.size} Sonoff device(s)`);
    logInfo('');
    
    const results = {
        total: deviceFolders.size,
        processed: 0,
        offline: 0,
        macRequested: 0,
        gpioRequested: 0,
        errors: 0
    };
    
    // Process each device sequentially
    for (const friendlyName of deviceFolders) {
        const result = await processDevice(friendlyName);
        
        results.processed++;
        
        if (!result.success) {
            if (result.reason === 'offline') {
                results.offline++;
            } else {
                results.errors++;
            }
        } else {
            if (result.macRequested) results.macRequested++;
            if (result.gpioRequested) results.gpioRequested++;
        }
        
        // Small pause between devices
        await wait(200);
    }
    
    logInfo('');
    logInfo('='.repeat(60));
    logInfo('Update completed!');
    logInfo(`Total devices: ${results.total}`);
    logInfo(`Processed: ${results.processed}`);
    logInfo(`Offline: ${results.offline}`);
    logInfo(`MAC addresses requested: ${results.macRequested}`);
    logInfo(`GPIO configs requested: ${results.gpioRequested}`);
    logInfo(`Errors: ${results.errors}`);
    logInfo('='.repeat(60));
}

// ==================== START ====================

// Give ioBroker a moment to load all states
setTimeout(() => {
    scanAndUpdateDevices();
}, 2000);
