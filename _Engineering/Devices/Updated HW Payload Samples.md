## Video Streaming

- Start/stop Stream (downward):
    
    ```json
    Topic: "/heylo/10/down/{Rpi_cpuid}/stream" //Rpi_cpuid should be unique identifier of raspberry pi
    
    Payload:
    {
    		"Camera Name/location/UID": "AHDFK1917830178SJKW", //replace with unique ID/name of camera
    		"RQID/timestamp": 1759332813,
    		"Enable": True/False
    }
    ```
    
- Notify AWS Stream started (upward):
    
    In the case where an RPi initiates a stream locally (event based) this message will Notify AWS that the stream started:
    
    ```json
    Topic: "/heylo/10/up/{Rpi_cpuid}/stream" //Rpi_cpuid should be unique identifier of raspberry pi
    
    Payload:
    {
    		"Camera Name/location/UID": "AHDFK1917830178SJKW", //replace with unique ID/name of camera
    		"RQID/timestamp": 1759332813,
    		"Enable": True/False
    }
    ```
    

## Smart Button (emergency response device):

- Button Pressed:
    
    ```json
    {
    		"action": "single",
    		"battery": 100,
    		"device": {
    		    "applicationVersion": 35,
    		    "friendlyName": "TR_Smart_Button",
    		    "hardwareVersion": 0,
    		    "ieeeAddr": "0x282c02bfffeea55d",
    		    "manufacturerID": 4659,
    		    "manufacturerName": "Third Reality, Inc",
    		    "model": "3RSB22BZ",
    		    "networkAddress": 3174,
    		    "powerSource": "Mains (single phase)",
    		    "softwareBuildID": "v1.00.35",
    		    "stackVersion": 2,
    		    "type": "EndDevice",
    		    "zclVersion": 3
    		},
    		"linkquality": 255,
    		"update": {
    		    "installed_version": 35,
    		    "latest_version": 35,
    		    "state": "idle"
    		}
    }
    ```
    
- Button Held
    
    ```json
    {
      "action": "hold",
      "battery": 100,
      "device": {
          "applicationVersion": 35,
          "friendlyName": "TR_Smart_Button",
          "hardwareVersion": 0,
          "ieeeAddr": "0x282c02bfffeea55d",
          "manufacturerID": 4659,
          "manufacturerName": "Third Reality, Inc",
          "model": "3RSB22BZ",
          "networkAddress": 3174,
          "powerSource": "Mains (single phase)",
          "softwareBuildID": "v1.00.35",
          "stackVersion": 2,
          "type": "EndDevice",
          "zclVersion": 3
    }
    ```
    
- Button Released
    
    ```json
    {
    		"action": "release",
    		"battery": 100,
    		"device": {
    		    "applicationVersion": 35,
    		    "friendlyName": "TR_Smart_Button",
    		    "hardwareVersion": 0,
    		    "ieeeAddr": "0x282c02bfffeea55d",
    		    "manufacturerID": 4659,
    		    "manufacturerName": "Third Reality, Inc",
    		    "model": "3RSB22BZ",
    		    "networkAddress": 3174,
    		    "powerSource": "Mains (single phase)",
    		    "softwareBuildID": "v1.00.35",
    		    "stackVersion": 2,
    		    "type": "EndDevice",
    		    "zclVersion": 3
    		},
    		"linkquality": 248,
    		"update": {
    		    "installed_version": 35,
    		    "latest_version": 35,
    		    "state": "idle"
    }
    ```
    

## Door Window Sensor

- Door opened:
    
    ```json
    {
    	  "battery": 100,
    	  "battery_low": false,
    	  "contact": false,
    	  "device": {
    	      "applicationVersion": 63,
    	      "friendlyName": "TR_Door_Sensor",
    	      "hardwareVersion": 0,
    	      "ieeeAddr": "0x282c02bfffef18cc",
    	      "manufacturerID": 4659,
    	      "manufacturerName": "Third Reality, Inc",
    	      "model": "3RDS17BZ",
    	      "networkAddress": 49979,
    	      "powerSource": "Battery",
    	      "softwareBuildID": "v1.00.63",
    	      "stackVersion": 2,
    	      "type": "EndDevice",
    	      "zclVersion": 3
    	  },
    	  "linkquality": 255,
    	  "tamper": false,
    	  "update": {
    	      "installed_version": 63,
    	      "latest_version": 63,
    	      "state": "idle"
    	  },
    	  "voltage": 3000
    }
    ```
    
- Door closed:
    
    ```json
    {
        "battery": 100,
        "battery_low": false,
        "contact": true,
        "device": {
            "applicationVersion": 63,
            "friendlyName": "TR_Door_Sensor",
            "hardwareVersion": 0,
            "ieeeAddr": "0x282c02bfffef18cc",
            "manufacturerID": 4659,
            "manufacturerName": "Third Reality, Inc",
            "model": "3RDS17BZ",
            "networkAddress": 49979,
            "powerSource": "Battery",
            "softwareBuildID": "v1.00.63",
            "stackVersion": 2,
            "type": "EndDevice",
            "zclVersion": 3
        },
        "linkquality": 255,
        "tamper": false,
        "update": {
            "installed_version": 63,
            "latest_version": 63,
            "state": "idle"
        },
        "voltage": 3000
    }
    ```
    

## Motion Sensor

- Motion detected:
    
    ```json
    {
        "battery_low": false,
        "device": {
            "dateCode": "20190502\\ufffd\\ufffd\\ufffd\\ufffd\\ufffd\\ufffd\\ufffd\\ufffd",
            "friendlyName": "Centralite_Motion_Sensor",
            "hardwareVersion": 1,
            "ieeeAddr": "0x000d6f001881a1e4",
            "manufacturerID": 4174,
            "manufacturerName": "CentraLite",
            "model": "3328-G",
            "networkAddress": 61282,
            "powerSource": "Battery",
            "stackVersion": 2,
            "type": "EndDevice",
            "zclVersion": 1
        },
        "linkquality": 255,
        "occupancy": true,
        "tamper": false,
        "temperature": 22.79
    }
    ```
    
- Motion Stopped:
    
    ```json
    {
    	  "battery_low": false,
    	  "device": {
    	      "dateCode": "20190502\\ufffd\\ufffd\\ufffd\\ufffd\\ufffd\\ufffd\\ufffd\\ufffd",
    	      "friendlyName": "Centralite_Motion_Sensor",
    	      "hardwareVersion": 1,
    	      "ieeeAddr": "0x000d6f001881a1e4",
    	      "manufacturerID": 4174,
    	      "manufacturerName": "CentraLite",
    	      "model": "3328-G",
    	      "networkAddress": 61282,
    	      "powerSource": "Battery",
    	      "stackVersion": 2,
    	      "type": "EndDevice",
    	      "zclVersion": 1
    	  },
    	  "linkquality": 255,
    	  "occupancy": false,
    	  "tamper": false,
    	  "temperature": 22.79
    }
    ```
    

## Zigbee Device Status/Availability

Note: device name will be specified in the topic “heylo/10/up/{Device_Name}/availability

- Device online
    
    ```json
    {
    		"payload":{"state":"online"}
    }
    ```
    
- Device offline
    
    ```json
    {
    		"payload":{"state":"offline"}
    }
    ```
    

## Fire Alarm (& Smoke Detector)

- Idle/clear (no smoke)
    
    ```json
    {
    		"payload": {
            "time": 1752613565723,
            "value": 0,
            "nodeName": "FASmokeDetector",
            "nodeLocation": ""
        }
    }
    ```
    
- Smoke Detected
    
    ```json
    {
    		"payload": {
            "time": 1752613565723,
            "value": 1,
            "nodeName": "FASmokeDetector",
            "nodeLocation": ""
        }
    }
    ```
    
- Test (smoke)
    
    ```json
    {
    		"payload": {
            "time": 1752613565723,
            "value": 3,
            "nodeName": "FASmokeDetector",
            "nodeLocation": ""
        }
    }
    ```
    

Note: device name will be specified in the topic “heylo/10/up/{Device_Name}/status

- Device online/awake
    
    ```json
    {
        "time": 1752538240763,
        "value": true,
        "status": "Awake",
        "nodeId": 2
    }
    ```
    
- Device asleep
    
    ```json
    {
        "time": 1752538264248,
        "value": true,
        "status": "Asleep",
        "nodeId": 2
    }
    ```
    
- Device dead
    
    ```json
    {
        "time": 1752538264248,
        "value": true,
        "status": "Dead",
        "nodeId": 2
    }
    ```
    

[Heylo Full Device Packaging](https://www.notion.so/Heylo-Full-Device-Packaging-23388e223733802c85fdd0c18de33338?pvs=21)