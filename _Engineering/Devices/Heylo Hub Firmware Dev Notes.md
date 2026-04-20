# Install Home Assistant Supervised on Hub

1. Upgrade your system
    
    `sudo apt update && sudo apt upgrade -y && sudo apt autoremove -y`
    
2. **Step 1:** Install the following dependencies with this command:
    
    ```bash
    
    sudo apt-get install \\
    apparmor \\
    jq \\
    wget \\
    curl \\
    udisks2 \\
    libglib2.0-bin \\
    network-manager \\
    dbus \\
    systemd-journal-remote -y
    
    ```
    
    Then reboot and wait a little bit, the Rpi will reboot a few times.
    
3. Install docker (important! Do not install portainer, it will make your installation unhealthy and you won´t be able to install add-ons): `curl -fsSL [get.docker.com](<http://get.docker.com/>) | sh`
    
    Then create Docker group and add your user to the Docker group:
    
    `sudo groupadd docker sudo usermod -aG docker $USER`
    
4. HA Supervisor depends on a particular Docker CGroup v1, so we make sure that we install it that way. ([CGroup Version - Home Assistant](https://www.home-assistant.io/more-info/unsupported/cgroup_version/))
    
    To solve this problem we need to add the following lines in two different files:
    
    A- Add “systemd.unified_cgroup_hierarchy=false” to /etc/default/grub:
    
    `sudo nano /etc/default/grub`
    
    and paste: systemd.unified_cgroup_hierarchy=false
    
    B- Add systemd.unified_cgroup_hierarchy=false to the end of /boot/cmdline.txt.
    
    `sudo nano /boot/cmdline.txt`
    
    and paste:
    
    systemd.unified_cgroup_hierarchy=false
    
    apparmor=1 security=apparmor
    
    Reboot.
    
5. Install the OS-Agent (ver. 1.4.1):
    
    1. First: download the correspondig os-agent acording to your CPU architecture, in this case aarch64 (RPi4)
        
        `wget <https://github.com/home-assistant/os-agent/releases/download/1.4.1/os-agent_1.4.1_linux_aarch64.deb`>
        
    2. Install the downloades package
        
        `dpkg -i os-agent_1.4.1_linux_aarch64.deb`
        
    3. To check if it was installed
        
        `wget <https://github.com/home-assistant/os-agent/releases/download/1.4.1/os-agent_1.4.1_linux_aarch64.deb`>
        
        `gdbus introspect --system --dest io.hass.os --object-path /io/hass/os`
        
        If it prints something back, everything went OK
        
6. Install home assistant supervised
    
    In this step if you are connected through wifi you will loose connection, you need to be using LAN!!!
    
    `dpkg -i homeassistant-supervised.deb`
    
7. If you get an error during the installation:
    
    `sudo apt --fix-broken install`
    
    That will fix it and a blue screen will appear, choose your model of RPi
    
    Finally wait several minutes until HA is available at http://[your_IP]:8123
    

# Using AWS Kinesis SDK

## Install AWS Kinesis SDK

1. Install Dependencies
    
    ```bash
    sudo apt update && sudo apt install -y \\
    cmake \\
    gstreamer1.0-tools \\
    gstreamer1.0-plugins-base \\
    gstreamer1.0-plugins-good \\
    gstreamer1.0-plugins-bad \\
    gstreamer1.0-plugins-ugly \\
    gstreamer1.0-libav \\
    libgstreamer1.0-dev \\
    libgstrtspserver-1.0-dev \\
    git \\
    build-essential \\
    pkg-config \\
    libssl-dev \\
    awscli
    ```
    
2. Clone and build SDK
    
    ```bash
    git clone <https://github.com/awslabs/amazon-kinesis-video-streams-producer-sdk-cpp.git>
    cd amazon-kinesis-video-streams-producer-sdk-cpp
    mkdir build && cd build
    cmake .. -DBUILD_GSTREAMER_PLUGIN=ON
    make -j4
    sudo make install
    ```
    
3. Configure AWS Credentials
    
    ```bash
    aws configure
    ```
    
    OR
    
    ```bash
    export AWS_ACCESS_KEY_ID=xxx
    export AWS_SECRET_ACCESS_KEY=xxx
    export AWS_DEFAULT_REGION=us-east-1
    ```
    

## Starting an Video Stream

[https://www.loom.com/share/c9c08c792fd9474e90489a35655bc1d6?sid=6de09f3e-6bf1-4100-aa03-1650434f1a7a](https://www.loom.com/share/c9c08c792fd9474e90489a35655bc1d6?sid=6de09f3e-6bf1-4100-aa03-1650434f1a7a)

1. From the directory where the AWS Kinesis SDK is installed, run the following commnad
    
    ```bash
    gst-launch-1.0 rtspsrc location="rtsp://{user}:{passowrd}@{IP_ADDR}:554/h264Preview_01_main" latency=1 \\
    ! rtph264depay \\
    ! h264parse \\
    ! kvssink stream-name="heylo-tester"
    ```
    
    The user/password is set during camera setup. Typically “admin” is the user, and the password is set per device. The IP_ADDR is the respective IP Address of the camera that we want to connect to.
    
2. The stream should now be available to view in AWS Kinesis Video Streams
    

# Using AWS WebRTC

## Installing AWS WebRTC SDK

Install the SDK by following the instructions provided by AWS:

[Amazon Kinesis Video Streams with WebRTC SDK in C for embedded devices - Kinesis Video Streams](https://docs.aws.amazon.com/kinesisvideostreams-webrtc-dg/latest/devguide/kvswebrtc-sdk-c.html)

1. Install dependencies
    
    ```bash
    sudo apt update && sudo apt install -y \\
    cmake \\
    gstreamer1.0-tools \\
    gstreamer1.0-plugins-base \\
    gstreamer1.0-plugins-good \\
    gstreamer1.0-plugins-bad \\
    gstreamer1.0-plugins-ugly \\
    gstreamer1.0-libav \\
    libgstreamer1.0-dev \\
    libgstrtspserver-1.0-dev \\
    git \\
    build-essential \\
    pkg-config \\
    libssl-dev \\
    awscli
    ```
    
2. Build the SDK
    
    ```bash
    git clone <https://github.com/awslabs/amazon-kinesis-video-streams-webrtc-sdk-c.git>
    ```
    
3. Install Cmake (if needed)
    
    ```bash
    sudo apt-get install pkg-config cmake libcap2 libcap-dev
    ```
    
4. Create a build directory and run cmake
    
    ```bash
    mkdir -p amazon-kinesis-video-streams-webrtc-sdk-c/build
    cd amazon-kinesis-video-streams-webrtc-sdk-c/build
    cmake ..
    ```
    
5. Build the SDK examples
    
    ```bash
    make
    make install
    ```
    

## Starting an Video Stream

1. From the directory where the AWS Kinesis SDK is installed, run the following command
    
    ```bash
    ./kvsWebrtcClientMasterGstSample heylo-tester audio-video \\
    rtspsrc rtsp://{user}:{passowrd}@{IP_ADDR}:554/h264Preview_01_main latency=1 ! \\
    rtph264depay ! h264parse ! queue ! video/x-h264,stream-format=avc,alignment=au ! appsink
    ```
    
    The user/password is set during camera setup. Typically “admin” is the user, and the password is set per device. The IP_ADDR is the respective IP Address of the camera that we want to connect to.
    
2. The stream should now be available to view in AWS Kinesis Video Streams under Signal Channeling
    

# Camera Discover Script for finding devices

The following script will find cameras devices that have open RTSP ports, connect to them, get device information, and store them locally on the Pi. This script used nmap as a PoC, but may be achievable via other means like ONVIF or mDNS (not tested).

```bash
#!/usr/bin/env python3
import json
import subprocess
import requests
import urllib3

# Disable insecure warnings if using self-signed certificates
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

SUBNET = "192.168.68.0/24"           # Adjust or detect dynamically
CAMERA_FILE = "/opt/reolink-poller/cameras.json"
DISCOVERY_TIMEOUT = 2
DEFAULT_USER = "admin"
DEFAULT_PASSWORD = "heylo123"

def get_local_subnet():
    """Try to detect local subnet automatically."""
    try:
        hostname = socket.gethostname()
        hostname = hostname + ".local"
        print(f"{hostname}")
        local_ip = socket.gethostbyname(hostname)
        print(f"local_ip:{local_ip}")
        network = ipaddress.ip_network(local_ip + "/24", strict=False)
        return str(network)
    except Exception:
        return SUBNET

def run_nmap(subnet):
    cmd = ["nmap", "-p", "554", "--open", "-n", "-T4", subnet]
    output = subprocess.check_output(cmd, universal_newlines=True)
    ips = []
    for line in output.splitlines():
        if "Nmap scan report for" in line:
            parts = line.split()
            ips.append(parts[-1])
    return ips

def login(ip):
    url = f"https://{ip}/api.cgi?cmd=Login"
    payload = [
        {
            "cmd": "Login",
            "param": {
                "User": {"Version": "0", "userName": DEFAULT_USER, "password": DEFAULT_PASSWORD}
            }
        }
    ]
    try:
        resp = requests.post(url, json=payload, timeout=DISCOVERY_TIMEOUT, verify=False)
        resp.raise_for_status()
        print(f"[{ip}] Login response: {resp.text}")
        data = resp.json()
        token = data[0].get("value", {}).get("Token", {}).get("name")
        return token
    except Exception as e:
        print(f"[{ip}] Login failed: {e}")
        return None

def get_devinfo(ip, token):
    url = f"https://{ip}/api.cgi?cmd=GetDevInfo&token={token}"
    payload = [{"cmd": "GetDevInfo"}]
    try:
        resp = requests.post(url, json=payload, timeout=DISCOVERY_TIMEOUT, verify=False)
        resp.raise_for_status()
        print(f"[{ip}] GetDevInfo response: {resp.text}")
        return resp.json()[0].get("value", {})
    except Exception as e:
        print(f"[{ip}] GetDevInfo failed: {e}")
        return None

def get_devname(ip, token):
    url = f"https://{ip}/api.cgi?cmd=GetDevName&token={token}"
    payload = [{"cmd": "GetDevName", "param": {"channel": 0}}]
    try:
        resp = requests.post(url, json=payload, timeout=DISCOVERY_TIMEOUT, verify=False)
        resp.raise_for_status()
        print(f"[{ip}] GetDevName response: {resp.text}")
    except Exception as e:
        print(f"[{ip}] GetDevName failed: {e}")

def logout(ip, token):
    url = f"https://{ip}/api.cgi?cmd=Logout&token={token}"
    payload = [{"cmd": "Logout"}]
    try:
        resp = requests.post(url, json=payload, timeout=DISCOVERY_TIMEOUT, verify=False)
        resp.raise_for_status()
        print(f"[{ip}] Logout response: {resp.text}")
    except Exception as e:
        print(f"[{ip}] Logout failed: {e}")

def discover_cameras(subnet):
    found = []
    for ip in run_nmap(subnet):
        token = login(ip)
        if not token:
            continue
        get_devname(ip, token)
        info = get_devinfo(ip, token)
        logout(ip, token)
        if not info:
            continue
        found.append({
            "ip": ip,
            "model": info.get("model"),
            "serial": info.get("serialNumber"),
            "mac": info.get("mac"),
            "user": DEFAULT_USER,
            "password": DEFAULT_PASSWORD
        })
        print(f"Discovered: {ip} / Model: {info.get('model')} / Serial: {info.get('serialNumber')}")
    return found

if __name__ == "__main__":
    subnet = get_local_subnet()
    print(f"Scanning subnet: {subnet}")

    cams = discover_cameras(subnet)
    with open(CAMERA_FILE, "w") as f:
        json.dump(cams, f, indent=2)
    print(f"Saved {len(cams)} cameras to {CAMERA_FILE}")

```

To make this a service that runs on boot:

**`/etc/systemd/system/reolink-discovery.service`**

```bash
[Unit]
Description=Reolink Camera Network Discovery
After=network.target

[Service]
ExecStart=/usr/bin/python3 /opt/reolink-poller/discover_cameras.py
WorkingDirectory=/opt/reolink-poller
User=pi
Group=pi
Restart=no
Environment=PYTHONUNBUFFERED=1
```

This can then be run automatically

**`/etc/systemd/system/reolink-discovery.timer`**

```bash
[Unit]
Description=Run Reolink Discovery periodically

[Timer]
OnBootSec=1min
OnUnitActiveSec=10min
Persistent=true

[Install]
WantedBy=timers.target
```

Reload the daemon and enable the service

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now reolink-discovery.timer
```