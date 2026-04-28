
Follow [[Kiosk Quick Start]] and [[Kiosk Mode Setup]]

```
# First start adb
adb start-server

# Find device
adb devices

# Build dev flavor release
flutter build apk --flavor dev --release

# Install into device
adb -s <DEVICE> install build/app/outputs/flutter-apk/app-dev-release.apk
```

