- Remove duplicate "door" in sensors
- Remove "motion sensor". I think we should rename any sensor in the title to just "sensor" because we put the name or area in the title anyway. For example - Downstairs LR motion sensor would be Downstairs LR sensor
- remove indoor and outdoor from naming, it looks odd having things like "back yard indoor camera". If we need to keep the indoor/outdoor label then let's keep it internal and not expose it to the customer.

---

There are two places we mutate device names for devices as I can recall. REST device create/edit endpoints, then we have an event-processor lambda which gets iot events, then sends them to the api.  
  
When this is the first time we see a device coming from this lambda, we will create devices in our system.