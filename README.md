# Sonoff/Tasmota to Zigbee2MQTT Bridge for Matterbridge

This project emulates **Zigbee2MQTT-compatible MQTT topics** for **Sonoff/Tasmota devices**, allowing them to be discovered and (partially) controlled by the  
**matterbridge-zigbee2mqtt** plugin – without any real Zigbee hardware.

The solution consists of **two ioBroker JavaScript scripts**:

1. **Main Bridge Script**  
   → Emulates a complete Zigbee2MQTT bridge including fake coordinator  
   → Makes Sonoff devices appear as Zigbee devices

2. **Data Updater Script**  
   → Actively fetches missing information (MAC address via `status 5`, GPIO config via `Template`)  
   → Very important for reliable device detection

## Current Status (January 2026)

| Feature                              | Status    | Notes                                          |
|--------------------------------------|-----------|------------------------------------------------|
| Single-relay devices                 | ✓         | Full support                                   |
| Multi-relay devices (>1 channel)     | ✓         | Full support with endpoints (l1, l2, l3...)    |
| Automatic device discovery           | ✓         | Via Sonoff adapter + MAC address               |
| Missing MAC/GPIO auto-recovery       | ✓         | Handled by the Data Updater script             |
| Bi-directional control               | ✓         | For single and multi-relay devices             |
| Fake coordinator & bridge info       | ✓         | Very good compatibility with Matterbridge      |
| Sensors, dimmers, RGB, power metering| ✗ Not yet | No plans implemented yet                       |

## Requirements

- ioBroker
- JavaScript adapter
- **Sonoff adapter with MAC datapoint support** (sonoff.x)  
  ⚠️ **Important:** You need a special build from this fork:  
  → https://github.com/baetzst/ioBroker.sonoff/tree/feature/mac-datapoint
- **MQTT Client adapter** (mqtt.x)
- Sonoff/Tasmota devices with MQTT enabled
- matterbridge + matterbridge-zigbee2mqtt plugin

### Important Tasmota Settings
```bash
# Very important: Disable Home Assistant discovery!
SetOption19 0

# Optional: Give devices clean names
FriendlyName1 LivingRoomPlug
```

## Installation

### 1. Install Special Sonoff Adapter
```bash
# In ioBroker, install from GitHub URL:
https://github.com/baetzst/ioBroker.sonoff/tree/feature/mac-datapoint
```

**Why this special version?**  
The standard Sonoff adapter doesn't expose the MAC address as a datapoint. This fork adds `STATUS.StatusNET_Mac` which is essential for device identification.

### 2. Configure MQTT Adapter

In the MQTT adapter settings, add these subscription patterns:
```
zigbee2mqtt/#
```

### 3. Install Scripts

1. Create a new JavaScript in ioBroker
2. Copy the **Main Bridge Script** content
3. Adjust the configuration:
```javascript
   const CONFIG = {
       sonoffAdapter: 'sonoff.0',    // Your Sonoff adapter instance
       mqttAdapter: 'mqtt.4',         // Your MQTT adapter instance
       z2mBaseTopic: 'zigbee2mqtt',   // Default Zigbee2MQTT topic
       debug: false,                  // Set to true for troubleshooting
   };
```

4. Create a second JavaScript
5. Copy the **Data Updater Script** content
6. Adjust the configuration to match your Sonoff adapter instance

### 4. Run Data Updater (First Time)

1. Start the **Data Updater Script** once manually
2. It will fetch MAC addresses and GPIO configurations from all online devices
3. Wait until it completes (check the log)
4. You can run it periodically (e.g., daily at 3 AM) or manually when adding new devices

### 5. Start Main Bridge

1. Start the **Main Bridge Script**
2. Check logs for discovered devices
3. The bridge will publish to `zigbee2mqtt/#` topics

## Configuration

### Main Bridge Script
```javascript
const CONFIG = {
    sonoffAdapter: 'sonoff.0',       // Sonoff adapter instance
    mqttAdapter: 'mqtt.4',           // MQTT adapter instance
    z2mBaseTopic: 'zigbee2mqtt',     // Zigbee2MQTT base topic
    bridgeVersion: '1.39.0',         // Emulated Z2M version
    refreshInterval: 60,             // Bridge info refresh (seconds)
    debug: false,                    // Enable debug logging
};
```

### Data Updater Script
```javascript
const CONFIG = {
    sonoffAdapter: 'sonoff.0',       // Sonoff adapter instance
    waitAfterRequest: 1500,          // Wait time after HTTP request (ms)
    debug: true,                     // Enable debug logging
};
```

## How It Works

### Device Discovery Flow

1. **Sonoff Adapter** detects Tasmota devices via MQTT
2. **Data Updater Script** (if needed):
   - Checks for missing MAC addresses → sends `status 5` command
   - Checks for missing GPIO configs → sends `Template` command
   - Waits for Sonoff adapter to create the datapoints
3. **Main Bridge Script**:
   - Scans all devices with `STATUS.StatusNET_Mac` datapoint
   - Counts relays via GPIO configuration (values 224-283)
   - Creates Zigbee2MQTT-compatible device definitions
   - Publishes to `zigbee2mqtt/bridge/devices`, etc.

### Multi-Relay Support

Devices with multiple relays are exposed with endpoints:
```json
{
  "ieee_address": "0x0000600194cc5e44",
  "friendly_name": "KitchenSwitch",
  "definition": {
    "exposes": [
      {
        "endpoint": "l1",
        "type": "switch",
        "features": [{ "property": "state_l1", ... }]
      },
      {
        "endpoint": "l2",
        "type": "switch",
        "features": [{ "property": "state_l2", ... }]
      }
    ]
  },
  "endpoints": {
    "1": { "name": "l1", ... },
    "2": { "name": "l2", ... }
  }
}
```

MQTT state payload:
```json
{
  "state_l1": "ON",
  "state_l2": "OFF",
  "linkquality": 255
}
```

### State Synchronization

- **Sonoff → Zigbee2MQTT:** Changes to `POWER`/`POWERx` are published to `zigbee2mqtt/<device>`
- **Zigbee2MQTT → Sonoff:** Commands to `zigbee2mqtt/<device>/set` are forwarded to Sonoff adapter
- **Availability:** `alive` state is mapped to Zigbee2MQTT availability

## Matterbridge Integration

1. Install **matterbridge-zigbee2mqtt** plugin in Matterbridge
2. Configure it to use your MQTT broker
3. Set base topic to `zigbee2mqtt` (or whatever you configured)
4. Restart Matterbridge
5. Your Sonoff devices should appear as Matter devices!

## Troubleshooting

### Devices Not Appearing

1. Enable debug mode: `debug: true`
2. Check if MAC address exists: `sonoff.0.<device>.STATUS.StatusNET_Mac`
3. Check if GPIO states exist: `sonoff.0.<device>.GPIO_*`
4. Run the **Data Updater Script** manually
5. Check MQTT adapter subscriptions include `zigbee2mqtt/#`

### No MAC Address

If `STATUS.StatusNET_Mac` doesn't exist:
- Make sure you're using the special Sonoff adapter fork
- The device must be online
- Run Data Updater Script → it will send `status 5`

### No GPIO Configuration

If `GPIO_*` states are missing:
- Run Data Updater Script → it will send `Template` command
- Wait 1-2 seconds for states to appear
- Check device is online and reachable

### Bridge Not Visible in Matterbridge

1. Check MQTT broker is running
2. Verify `zigbee2mqtt/bridge/info` is published
3. Check Matterbridge logs for connection errors
4. Verify base topic matches in both scripts and Matterbridge config

## Limitations

- **No sensors:** Temperature, humidity, power monitoring not yet supported
- **No dimmers:** Only ON/OFF switches
- **No RGB/CT:** Color control not implemented
- **Read-only for some features:** Some Tasmota features can't be controlled via Matter

## Contributing

Contributions welcome! Areas that need work:
- Sensor support (temperature, humidity, power)
- Dimmer/brightness control
- RGB/color temperature
- Better error handling
- Automatic device refresh when new devices come online

## License

MIT License - Copyright (c) 2026 baetzst

## Credits

- **ioBroker Team** for the excellent home automation platform
- **Tasmota Project** for the amazing firmware
- **Zigbee2MQTT** for the protocol inspiration
- **Matterbridge** for making Matter accessible

---

**Note:** This is a workaround/bridge solution. For production use, consider using native Zigbee or Matter devices where possible.
