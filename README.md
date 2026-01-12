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

| Feature                              | Status       | Notes                                          |
|--------------------------------------|--------------|------------------------------------------------|
| Single-relay devices                 | ✓ Working    | Full support (on/off + state feedback)         |
| Multi-relay devices (>1 channel)     | ⚠ Partial    | Detected, but only first relay is controllable |
| Automatic device discovery           | ✓            | Via Sonoff adapter + MAC address               |
| Missing MAC/GPIO auto-recovery       | ✓            | Handled by the Data Updater script             |
| Bi-directional control               | ✓            | For single-relay devices                       |
| Fake coordinator & bridge info       | ✓            | Very good compatibility with Matterbridge      |
| Sensors, dimmers, RGB, power metering| ✗ Not yet    | No plans implemented yet                       |

## Requirements

- ioBroker
- JavaScript adapter
- **Sonoff adapter** (sonoff.x)
- **MQTT Client adapter** (mqtt.x)
- Sonoff/Tasmota devices with MQTT enabled
- matterbridge + zigbee2mqtt adapter

### Important Tasmota Settings

```bash
# Very important: Disable Home Assistant discovery!
SetOption19 0

# Optional: Give devices clean names
FriendlyName1 LivingRoomPlug
