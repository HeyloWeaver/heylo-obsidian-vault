understand how the messaging works and what I think
need to add an amount of unreads in UI

### Goal
When a new message comes in, it does not have an icon in the communication tab indicating an unread message from chat. See second image for reference (ignore that it's in alerts)

**Definition of Done**

- Write node.js script to send a message to a scheduled support professional/administrator
    - This is done, see first comment
    - prerequisites:
        - one tablet device is active is true is deleted false
        - one support professional/administrator is currently scheduled
            - administrator
- When a message comes in, make an API request to get all unread messages for use
    - I don't like the architecture of counting when web socket messages come in
        - because it gets out of sync
- As a support professional, or administrator, if I have non zero unread messages, I should see the number of unread messages next to communication
- As messages become read, the number should automatically change (or disappear) using websockets
    - First, see if any work has been done on this
    - Architecture
        - When the client makes a request to `POST /ReadReceipt?messageIds=id1&messageIds=id2 (src/controllers/read-receipt.controller.ts)`
            - When it succeeds
                - Update counter next to messages
            - when it fails
                - put a small question mark by the number
                    - on click show a small modal telling the user that we failed to mark messages as read