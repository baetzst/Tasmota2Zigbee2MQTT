# Tasmota to Zigbee2MQTT Bridge for Matterbridge

This project emulates **Zigbee2MQTT MQTT topics for Tasmota devices**, allowing them to be discovered and controlled by the
**matterbridge-zigbee2mqtt** plugin – without real Zigbee hardware.

The script runs inside **ioBroker JavaScript adapter** and translates between:

* Tasmota MQTT topics
* Zigbee2MQTT compatible MQTT topics

So your Tasmota devices appear as native Zigbee2MQTT devices to Matterbridge.

---

## Features

* Automatic discovery of Tasmota devices via MQTT discovery
* Emulates Zigbee2MQTT bridge (`bridge/info`, `bridge/devices`, `bridge/state`, …)
* Supports single and multi-channel Tasmota relay devices
* Bi-directional control:

  * Matterbridge / Zigbee2MQTT → Tasmota
  * Tasmota state updates → Zigbee2MQTT
* Fake coordinator & device interview for full compatibility
* Zero firmware changes on Tasmota devices

---

## Requirements

* **ioBroker**
* **JavaScript Adapter**
* **MQTT Server/Broker Adapter** (`mqtt.x`)
* Tasmota devices with MQTT enabled

### Tasmota Settings

Enable Tasmota discovery by disabling Home Assistant discovery:

```
SetOption19 0
```

Make sure your devices publish to a base topic like:

```
tasmota/your-device-topic/...
```

---

## Installation

1. Install ioBroker JavaScript Adapter.
2. Create a new script and paste the full bridge script into it.
3. Adjust the configuration at the top of the file:

```js
const CONFIG = {
    mqttAdapter: 'mqtt.0',   // Change to your MQTT broker instance
    tasmotaBaseTopic: 'tasmota',
    z2mBaseTopic: 'zigbee2mqtt',
    debug: false
};
```

4. Save and start the script.

---

## How It Works

| Tasmota MQTT                   | Emulated Zigbee2MQTT          |
| ------------------------------ | ----------------------------- |
| `tasmota/discovery/.../config` | `zigbee2mqtt/bridge/devices`  |
| `stat/device/POWER`            | `zigbee2mqtt/<friendly_name>` |
| `cmnd/device/POWER`            | `zigbee2mqtt/<device>/set`    |

The script:

1. Listens for Tasmota discovery messages
2. Creates Zigbee2MQTT compatible device definitions
3. Publishes fake coordinator & bridge info
4. Translates on/off commands between ecosystems

---

## Example Flow

Matterbridge turns a light ON:

```
zigbee2mqtt/livingroom_light/set {"state":"ON"}
```

The script sends:

```
cmnd/tasmota_livingroom_light/POWER 1
```

Tasmota reports status:

```
stat/tasmota_livingroom_light/POWER ON
```

The script publishes:

```
zigbee2mqtt/livingroom_light {"state":"ON","linkquality":255}
```

---

## Supported Devices

Currently supported:

* Tasmota relay based devices (switches, plugs, power strips)
* Single and multi-channel relays

Not yet supported:

* Dimmers
* RGB lights
* Sensors

---

## Debugging

Enable verbose logging:

```js
debug: true
```

---

## Disclaimer

This project is not affiliated with Zigbee2MQTT, Tasmota or Matterbridge.
Use at your own risk.

---

## License

MIT License
