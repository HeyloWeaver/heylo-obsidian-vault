---
type: reference
tags: [devices, hardware, provisioning]
owner: Chris
updated: 2026-04-21
status: current
---
Prerequisites:

- Make sure the hub repo is available on your computer.
- If you are using a windows machine make sure you have WSL installed and enabled and you must know your WSL user password.
- Make sure you have the Raspberry Pi Imager installed: [Raspberry Pi software – Raspberry Pi](https://www.raspberrypi.com/software/)

Steps:

- Download the latest `.wic` file and extract it (it is usually compressed in bz2 format needs a 3rd party extraction tool on windows. 7-zip works well.
    
- Download the heylo.env file from our platform at [`https://app.heylo.tech`](https://app.heylo.tech) as a superuser by choosing the 3 dot menu for the specific **agency** we are creating a hub for and clicking on “Download .env”
    
- Place the `.wic` and the `heylo.env` file in the same folder.
    
- Run the script with the following syntax (include the `" "` quotation marks and replace the `[ ]` variables with the actual values):
    
    - Windows (It will ask for your WSL user password during the process):
        - `./inject-wic.bat "[WIFI SSID]" "[WIFI PASSWORD]" [PATH TO FOLDER WITH WIC/ENV]`
    - Linux/Mac:
        - `./inject-wic.sh "[WIFI SSID]" "[WIFI PASSWORD]" [PATH TO FOLDER WITH WIC/ENV]`
    
    Note: The path to folder default value is `C:\\Users\\Heylo\\Downloads` so if you’re on the workstation at marconi you can just put the `.wic` and `.env` in the Downloads folder and run the command with no path specified.
    
- Once the script is done running, open the Raspberry Pi Imager tool
    
- Choose Raspberry Pi 5 as the device type
    
- Scroll down and choose to “Use Custom” for the OS type. When it asks you to choose an OS, select the .wic file we just ran the script on.
    
- When it asks for storage, make sure the SD card is plugged into the computer and choose it.
    
- Hit flash with all default options and wait for the flashing process to complete (Usually takes 10-15 minutes to complete.
    
- Done! You can take the SD card out and put it in a hub.