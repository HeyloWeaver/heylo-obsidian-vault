---
type: reference
tags: [devices, backend, alerts]
owner: Chris
updated: 2026-04-21
status: current
---
The device checker service is intended to ensure that our customers know when

- devices are not sending heartbeat/connectivity notifications to our platform
- tablets have a low battery and are not being charged

**Alert Scenarios**

Currently, we are handling two different alerting scenarios

- When there are healthcare professionals currently scheduled to work / working
- When there are healthcare professionals about to start a shift

**Questions**

- Should we add logic to auto resolve alerts if previously stale devices are no longer stale

**Database migrations**

- We need to add an `IsActive` column to the device table
    - This will prevent us from alerting on devices that are not active
- We need to add an `alerttype` table with `id` and `name` as columns
    - We should add one row to the table, name = `DEVICE_CHECKER`
- We need to add an optional `AlertTypeID` column to the `alert` table
- We need to make the `DeviceID` column in the `alert` table optional

**Real Time Alerting Test Scenarios**

- When there are no stale active devices, and someone is currently scheduled
    - Our real time checker function should return an empty object
- If there is no one currently scheduled, and there is at least 1 stale, active device
    - Our real time checker function should return an empty object
- If there is 1 active, stale device, and a user is currently scheduled
    - Our real time checker function should return metadata that includes the userId, the site of the stale device, and the device metadata
- If there is more than 1 active, stale device and a user is currently scheduled
    - Our real time checker function should return metadata that includes the userId, the site of the stale device, and the device metadata for 2 devices