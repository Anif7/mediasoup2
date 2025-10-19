# Complete Beginner's Guide to mediasoup Video Conference

## Table of Contents
1. [What is mediasoup?](#what-is-mediasoup)
2. [Understanding SFU Architecture](#understanding-sfu-architecture)
3. [Key Concepts Explained](#key-concepts-explained)
4. [How Our Application Works](#how-our-application-works)
5. [Server Code Explained](#server-code-explained)
6. [Client Code Explained](#client-code-explained)
7. [The Complete Flow](#the-complete-flow)
8. [Code Walkthrough](#code-walkthrough)

---

## What is mediasoup?

**mediasoup** is a JavaScript library that helps you build real-time video/audio communication applications. Think of it as the "engine" that powers video conferencing.

### Why mediasoup?

Instead of building all the complex video streaming logic yourself, mediasoup handles:
- Video/audio routing between participants
- Network connectivity
- Media encoding/decoding
- Bandwidth management
- Multiple participants support

### Real-world analogy:
Imagine you're building a phone system:
- **Without mediasoup**: You'd need to build the phone hardware, the network, the routing system, etc.
- **With mediasoup**: You just use the phone - mediasoup handles all the complex stuff behind the scenes.

---

## Understanding SFU Architecture

### What is an SFU?

**SFU = Selective Forwarding Unit**

It's a server that receives video/audio from participants and forwards it to other participants WITHOUT modifying the video.

### Visual Explanation:

#### ❌ Peer-to-Peer (P2P):
```
Person A ←──────────────────────→ Person B
         ←──────────────────────→ Person C
         ←──────────────────────→ Person D

Problem: Each person needs connection to everyone else.
With 10 people = 9 connections per person = Too much!
```

#### ✅ SFU (Our Implementation):
```
Person A ──────────→ Server ──────────→ Person B
Person B ──────────→ Server ──────────→ Person A
Person C ──────────→ Server ──────────→ Person A & B

Benefit: Each person only connects to the server.
With 10 people = 1 connection per person = Efficient!
```

### Why SFU is Better:

1. **Scalable**: Works with many participants
2. **No quality loss**: Server doesn't re-encode video
3. **Works through firewalls**: Only need connection to server
4. **Lower latency**: Direct forwarding, no processing

---

## Key Concepts Explained

Let me explain each mediasoup concept with simple analogies:

### 1. Worker 👷

**What it is**: A separate process that handles all the heavy media work.

**Analogy**: Like a factory worker who processes packages.
- Your main server = the manager
- Worker = the employee doing the actual work

**In code**:
```javascript
const worker = await mediasoup.createWorker({
  rtcMinPort: 10000,
  rtcMaxPort: 10100
});
```

**Why we need it**: 
- Keeps media processing separate from your server logic
- Can have multiple workers for better performance
- If worker crashes, it doesn't crash your whole server

---

### 2. Router 🚏

**What it is**: Routes media streams between participants using specific codecs.

**Analogy**: Like a post office sorting center.
- Receives packages (media) from senders
- Sorts and forwards to receivers
- Knows which format (codec) each package uses

**In code**:
```javascript
const router = await worker.createRouter({
  mediaCodecs: [
    { kind: 'audio', mimeType: 'audio/opus' },
    { kind: 'video', mimeType: 'video/VP8' }
  ]
});
```

**What are codecs?**
- **Codec** = COmpressor-DECompressor
- Converts raw video/audio to compressed format
- Like ZIP for media files
- **VP8** = video codec (like MP4)
- **Opus** = audio codec (like MP3)

---

### 3. Transport 🚚

**What it is**: A WebRTC connection for EITHER sending OR receiving media.

**Analogy**: Like a delivery truck.
- **Send Transport** = truck picks up packages from your house (your camera/mic)
- **Recv Transport** = truck delivers packages to your house (other people's video)

**Important**: Each participant needs TWO transports:
1. One for sending their video/audio
2. One for receiving others' video/audio

**In code**:
```javascript
// Create send transport (for your camera)
const sendTransport = await router.createWebRtcTransport({...});

// Create recv transport (for receiving others)
const recvTransport = await router.createWebRtcTransport({...});
```

**Why separate transports?**
- Better organization
- Independent connection management
- Can pause sending without affecting receiving

---

### 4. Producer 📹

**What it is**: Represents media YOU are sending (your camera/microphone).

**Analogy**: Like a TV broadcast station.
- You produce a video signal
- Others can tune in to watch
- Each media source = one producer

**In code**:
```javascript
// Produce video
const videoProducer = await sendTransport.produce({
  kind: 'video',
  track: cameraTrack
});

// Produce audio
const audioProducer = await sendTransport.produce({
  kind: 'audio',
  track: microphoneTrack
});
```

**Each participant has**:
- 1 video producer (their camera)
- 1 audio producer (their microphone)

---

### 5. Consumer 📺

**What it is**: Represents media you are RECEIVING from others.

**Analogy**: Like a TV receiver.
- Someone else broadcasts (produces)
- You tune in (consume) to watch

**In code**:
```javascript
// Consume someone else's video
const consumer = await recvTransport.consume({
  producerId: theirProducerId,
  rtpCapabilities: yourCapabilities
});

// Now you can display their video
videoElement.srcObject = new MediaStream([consumer.track]);
```

**Each participant has**:
- N consumers (where N = number of other participants × 2)
- Example: 3 people total = you have 4 consumers (2 people × 2 media types)

---

## How Our Application Works

### The Big Picture

```
┌─────────────────────────────────────────────────────────┐
│                    YOUR BROWSER                         │
│  ┌────────────────────────────────────────────┐        │
│  │  HTML Page (index.html)                    │        │
│  │  - Join room form                          │        │
│  │  - Video grid                              │        │
│  │  - Control buttons                         │        │
│  └────────────────────────────────────────────┘        │
│                        │                                │
│  ┌────────────────────────────────────────────┐        │
│  │  Client JavaScript (client.js)             │        │
│  │  - WebSocket communication                 │        │
│  │  - mediasoup-client library                │        │
│  │  - Camera/Mic access                       │        │
│  └────────────────────────────────────────────┘        │
└────────────────────┬────────────────────────────────────┘
                     │
            WebSocket + WebRTC
                     │
┌────────────────────▼────────────────────────────────────┐
│                   SERVER (Node.js)                      │
│  ┌────────────────────────────────────────────┐        │
│  │  server.js                                 │        │
│  │  - WebSocket Server (signaling)            │        │
│  │  - HTTP Server (serves files)              │        │
│  └────────────────────────────────────────────┘        │
│                        │                                │
│  ┌────────────────────────────────────────────┐        │
│  │  mediasoup                                 │        │
│  │  ├── Worker (media processing)             │        │
│  │  ├── Router (media routing)                │        │
│  │  ├── Transports (WebRTC connections)       │        │
│  │  ├── Producers (incoming media)            │        │
│  │  └── Consumers (outgoing media)            │        │
│  └────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────┘
```

### Communication Layers

1. **WebSocket (Signaling)**:
   - Used for: Control messages
   - Examples: "I want to join", "Create a transport", "Here's my video"
   - NOT used for actual video/audio data

2. **WebRTC (Media)**:
   - Used for: Actual video/audio streaming
   - Direct connection between client and server
   - High performance, encrypted

---

## Server Code Explained

Let's walk through `server.js` step by step.

### Part 1: Imports and State

```javascript
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mediasoup = require('mediasoup');
const config = require('./config');
```

**What this does**:
- `express`: Creates HTTP server to serve web pages
- `WebSocket`: Enables real-time communication for signaling
- `mediasoup`: The video conferencing engine
- `config`: Our settings (ports, codecs, etc.)

```javascript
let mediasoupWorker = null;
let mediasoupRouter = null;
const rooms = new Map();
const peers = new Map();
```

**State management**:
- `mediasoupWorker`: The worker processing media
- `mediasoupRouter`: Routes media between participants
- `rooms`: Tracks which peers are in which rooms
- `peers`: Information about each connected participant

---

### Part 2: Creating the Worker

```javascript
async function createMediasoupWorker() {
  const worker = await mediasoup.createWorker({
    rtcMinPort: 10000,
    rtcMaxPort: 10100,
    logLevel: 'warn',
    logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp']
  });
  
  worker.on('died', (error) => {
    console.error('[Worker] Died:', error);
    process.exit(1);
  });
  
  return worker;
}
```

**What this does**:
1. Creates a worker process
2. Assigns UDP ports 10000-10100 for WebRTC connections
3. Sets up logging
4. Handles worker crashes

**Port range explained**:
- Each WebRTC connection needs a port
- With 100 ports, we can handle ~50 simultaneous connections
- These are UDP ports for media streaming

---

### Part 3: Creating the Router

```javascript
async function createMediasoupRouter() {
  const router = await mediasoupWorker.createRouter({
    mediaCodecs: config.mediasoup.router.mediaCodecs
  });
  
  return router;
}
```

**What this does**:
- Creates a router on the worker
- Configures which audio/video codecs to support

**Why codecs matter**:
- Different browsers support different codecs
- We configure VP8 and H264 for video (wide compatibility)
- Opus for audio (best quality)

---

### Part 4: Creating Transports

```javascript
async function createWebRtcTransport(peerId, direction) {
  const transport = await mediasoupRouter.createWebRtcTransport({
    listenIps: config.mediasoup.webRtcTransport.listenIps,
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 1000000
  });
  
  transport.on('dtlsstatechange', (dtlsState) => {
    if (dtlsState === 'closed') {
      transport.close();
    }
  });
  
  return transport;
}
```

**What this does**:
1. Creates a WebRTC transport for a peer
2. Configures network settings (UDP/TCP)
3. Sets bandwidth limits
4. Handles transport closure

**UDP vs TCP**:
- **UDP**: Faster, preferred for video (some packet loss is OK)
- **TCP**: More reliable, used as fallback
- We prefer UDP but enable TCP for restrictive networks

---

### Part 5: WebSocket Server

```javascript
function createWebSocketServer(httpServer) {
  const wss = new WebSocket.Server({ server: httpServer });
  
  wss.on('connection', (socket) => {
    const peerId = generatePeerId();
    
    peers.set(peerId, {
      id: peerId,
      socket: socket,
      transports: new Map(),
      producers: new Map(),
      consumers: new Map(),
      roomId: null
    });
    
    sendMessage(socket, 'connected', { peerId });
    
    socket.on('message', async (message) => {
      const data = JSON.parse(message);
      await routeIncomingMessage(peerId, data);
    });
    
    socket.on('close', () => {
      handlePeerDisconnection(peerId);
    });
  });
  
  return wss;
}
```

**What this does**:
1. Creates WebSocket server
2. When client connects:
   - Generates unique peer ID
   - Creates peer data structure
   - Sends peer ID to client
3. Listens for messages from client
4. Handles disconnections

**Why WebSocket?**
- Real-time, bi-directional communication
- Perfect for signaling (control messages)
- Low latency

---

### Part 6: Handling Join Room

```javascript
async function addPeerToRoomAndNotifyOthers(peer, payload) {
  const { roomId } = payload;
  
  // Create room if doesn't exist
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      peers: new Set()
    });
  }
  
  const room = rooms.get(roomId);
  const existingPeers = Array.from(room.peers).filter(id => id !== peer.id);
  
  // Add peer to room
  room.peers.add(peer.id);
  peer.roomId = roomId;
  
  // Collect existing peers' producers
  const existingPeersInfo = [];
  existingPeers.forEach(existingPeerId => {
    const existingPeer = peers.get(existingPeerId);
    if (existingPeer) {
      const producers = [];
      existingPeer.producers.forEach(({ producer, kind }) => {
        producers.push({
          producerId: producer.id,
          kind: kind
        });
      });
      
      if (producers.length > 0) {
        existingPeersInfo.push({
          peerId: existingPeerId,
          producers: producers
        });
      }
    }
  });
  
  // Send to new peer: who's here and what they're producing
  sendMessage(peer.socket, 'roomJoined', {
    roomId,
    peers: existingPeers,
    existingProducers: existingPeersInfo
  });
  
  // Tell existing peers about new peer
  existingPeers.forEach(existingPeerId => {
    const existingPeer = peers.get(existingPeerId);
    if (existingPeer) {
      sendMessage(existingPeer.socket, 'newPeer', { peerId: peer.id });
    }
  });
}
```

**What this does** (step by step):

1. **Get or create room**:
   ```javascript
   if (!rooms.has(roomId)) {
     rooms.set(roomId, { id: roomId, peers: new Set() });
   }
   ```
   - If room doesn't exist, create it
   - Room is just a container for peer IDs

2. **Find existing peers**:
   ```javascript
   const existingPeers = Array.from(room.peers).filter(id => id !== peer.id);
   ```
   - Get list of peers already in the room
   - Exclude the joining peer themselves

3. **Add peer to room**:
   ```javascript
   room.peers.add(peer.id);
   peer.roomId = roomId;
   ```
   - Add new peer to room's peer list
   - Store room ID in peer's data

4. **Collect existing producers**:
   ```javascript
   const existingPeersInfo = [];
   existingPeers.forEach(existingPeerId => {
     // Get their video and audio producer IDs
   });
   ```
   - **This is crucial!** New peer needs to know what media exists
   - For each existing peer, collect their producer IDs

5. **Notify new peer**:
   ```javascript
   sendMessage(peer.socket, 'roomJoined', {
     roomId,
     peers: existingPeers,
     existingProducers: existingPeersInfo
   });
   ```
   - Tell new peer: "You joined room X"
   - "These peers are here: [peer1, peer2]"
   - "They have these producers: [video1, audio1, video2, audio2]"

6. **Notify existing peers**:
   ```javascript
   existingPeers.forEach(existingPeerId => {
     sendMessage(existingPeer.socket, 'newPeer', { peerId: peer.id });
   });
   ```
   - Tell everyone: "New peer joined!"
   - They'll consume new peer's media when they produce

---

### Part 7: Creating Transport Handler

```javascript
async function createTransportAndSendParameters(peer, payload) {
  const { direction } = payload;
  
  const transport = await createWebRtcTransport(peer.id, direction);
  
  peer.transports.set(transport.id, { transport, direction });
  
  sendMessage(peer.socket, 'transportCreated', {
    transportId: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
    direction
  });
}
```

**What this does**:
1. Creates WebRTC transport
2. Stores it in peer's transport map
3. Sends transport parameters to client

**What are these parameters?**
- **iceParameters**: Network connectivity info
- **iceCandidates**: Possible network addresses
- **dtlsParameters**: Security/encryption settings

**Why send to client?**
- Client needs these to establish WebRTC connection
- Like giving someone your phone number and address

---

### Part 8: Producing Media

```javascript
async function createProducerAndBroadcastToPeers(peer, payload) {
  const { transportId, kind, rtpParameters } = payload;
  
  const transportData = peer.transports.get(transportId);
  const producer = await transportData.transport.produce({
    kind,
    rtpParameters
  });
  
  peer.producers.set(producer.id, { producer, kind });
  
  sendMessage(peer.socket, 'produced', {
    producerId: producer.id,
    kind
  });
  
  // Notify other peers in room
  if (peer.roomId) {
    const room = rooms.get(peer.roomId);
    room.peers.forEach(otherPeerId => {
      if (otherPeerId !== peer.id) {
        const otherPeer = peers.get(otherPeerId);
        sendMessage(otherPeer.socket, 'newProducer', {
          peerId: peer.id,
          producerId: producer.id,
          kind
        });
      }
    });
  }
}
```

**What this does**:
1. **Creates producer**: Server starts receiving media from client
2. **Stores producer**: Keep track of this media stream
3. **Confirms to client**: "Got your video/audio"
4. **Notifies others**: "New media available!"

**The flow**:
```
Client: "I want to produce video"
Server: Creates producer, starts receiving video
Server to Client: "OK, here's your producer ID"
Server to Others: "Hey, new video available from peer X"
```

---

### Part 9: Consuming Media

```javascript
async function createConsumerForRemoteProducer(peer, payload) {
  const { producerId, rtpCapabilities } = payload;
  
  // Find the producer
  let producer = null;
  for (const [peerId, p] of peers.entries()) {
    if (p.producers.has(producerId)) {
      producer = p.producers.get(producerId).producer;
      break;
    }
  }
  
  // Check if can consume
  if (!mediasoupRouter.canConsume({ producerId, rtpCapabilities })) {
    throw new Error('Cannot consume');
  }
  
  // Get recv transport
  const recvTransport = Array.from(peer.transports.values())
    .find(t => t.direction === 'recv');
  
  // Create consumer
  const consumer = await recvTransport.transport.consume({
    producerId,
    rtpCapabilities,
    paused: true
  });
  
  peer.consumers.set(consumer.id, {
    consumer,
    producerId,
    producerPeerId: producerPeer.id
  });
  
  sendMessage(peer.socket, 'consumed', {
    consumerId: consumer.id,
    producerId,
    kind: consumer.kind,
    rtpParameters: consumer.rtpParameters
  });
}
```

**What this does** (step by step):

1. **Find the producer**:
   ```javascript
   // Loop through all peers to find who has this producer
   ```
   - Client says: "I want to consume producer ABC"
   - Server finds: "Producer ABC belongs to peer X"

2. **Check compatibility**:
   ```javascript
   if (!mediasoupRouter.canConsume({ producerId, rtpCapabilities })) {
     throw new Error('Cannot consume');
   }
   ```
   - Check if client can decode this media
   - Like checking if they have the right video player

3. **Create consumer**:
   ```javascript
   const consumer = await recvTransport.transport.consume({
     producerId,
     rtpCapabilities,
     paused: true
   });
   ```
   - Start sending this media to the client
   - Start paused (will resume after client is ready)

4. **Send to client**:
   ```javascript
   sendMessage(peer.socket, 'consumed', {
     consumerId: consumer.id,
     rtpParameters: consumer.rtpParameters
   });
   ```
   - Tell client: "Here's your consumer"
   - Send media parameters

---

## Client Code Explained

Now let's walk through `public/client.js` step by step.

### Part 1: State Management

```javascript
const state = {
  socket: null,                 // WebSocket connection
  peerId: null,                 // Our unique ID
  roomId: null,                 // Current room
  device: null,                 // mediasoup Device
  sendTransport: null,          // For sending our media
  recvTransport: null,          // For receiving others' media
  producers: new Map(),         // Our producers (camera/mic)
  consumers: new Map(),         // Consumers (others' media)
  remotePeers: new Map(),       // Remote peer info
  isVideoEnabled: true,         // Camera on/off
  isAudioEnabled: true,         // Mic on/off
  localStream: null,            // Our camera/mic stream
  pendingConsumers: []          // Producers to consume later
};
```

**Why we need state**:
- Keeps track of everything in one place
- Easy to access from any function
- Helps debug (can inspect state)

---

### Part 2: Connecting to Server

```javascript
function connectToServer() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  
  state.socket = new WebSocket(wsUrl);
  
  state.socket.onopen = () => {
    log('WebSocket connected');
    updateConnectionStatus(true);
  };
  
  state.socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    routeServerMessage(message);
  };
  
  state.socket.onclose = () => {
    log('WebSocket disconnected');
    updateConnectionStatus(false);
  };
}
```

**What this does**:
1. Determines WebSocket URL (ws:// or wss://)
2. Creates WebSocket connection
3. Sets up event handlers:
   - `onopen`: Connected successfully
   - `onmessage`: Received message from server
   - `onclose`: Connection lost

---

### Part 3: Joining a Room

```javascript
async function joinRoomButtonClicked() {
  const roomId = document.getElementById('roomIdInput').value.trim();
  state.roomId = roomId;
  
  // Step 1: Get router capabilities
  sendMessage('getRouterRtpCapabilities');
}
```

**The joining process**:
```
Step 1: Request router capabilities
   ↓
Step 2: Create Device with capabilities
   ↓
Step 3: Get user's camera/microphone
   ↓
Step 4: Send join room request
   ↓
Step 5: Create send transport
   ↓
Step 6: Produce video/audio
   ↓
Step 7: Create recv transport
   ↓
Step 8: Consume existing producers
```

Let's explain each step:

---

### Step 1: Getting Router Capabilities

```javascript
sendMessage('getRouterRtpCapabilities');
```

**What this does**:
- Asks server: "What codecs do you support?"
- Server responds with list of supported codecs

**Why needed?**
- Client needs to know what formats server accepts
- Like asking: "Do you accept Visa or Mastercard?"

---

### Step 2: Creating the Device

```javascript
async function initializeDeviceWithCapabilities(payload) {
  const { rtpCapabilities } = payload;
  
  // Create mediasoup Device
  state.device = new mediasoupClient.Device();
  
  // Load with router capabilities
  await state.device.load({ routerRtpCapabilities: rtpCapabilities });
  
  log('Device loaded, can produce:', {
    audio: state.device.canProduce('audio'),
    video: state.device.canProduce('video')
  });
  
  // Next: Get user media
  await getUserMedia();
  
  // Then: Join room
  sendMessage('joinRoom', { roomId: state.roomId });
}
```

**What is a Device?**
- mediasoup-client's main object
- Handles all WebRTC stuff for you
- Like a "WebRTC manager"

**What does load() do?**
- Configures device with server's capabilities
- Device now knows what codecs it can use
- Checks if browser supports required codecs

---

### Step 3: Getting User Media

```javascript
async function getUserMedia() {
  state.localStream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 }
    },
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  });
  
  // Display local video
  const localVideo = document.getElementById('localVideo');
  localVideo.srcObject = state.localStream;
}
```

**What this does**:
1. Asks browser for camera and microphone access
2. User sees permission prompt
3. Gets video track (720p, 30fps)
4. Gets audio track (with echo cancellation)
5. Displays our video on screen

**Why these settings?**
- `echoCancellation`: Prevents feedback loop
- `noiseSuppression`: Reduces background noise
- `autoGainControl`: Adjusts microphone volume

---

### Step 4: Room Joined Response

```javascript
async function setupLocalMediaAndTransports(payload) {
  const { roomId, peers, existingProducers } = payload;
  
  log('Joined room:', roomId);
  log('Existing peers:', peers);
  log('Existing producers:', existingProducers);
  
  // Update UI
  document.getElementById('currentRoomName').textContent = roomId;
  updatePeerCount(peers.length + 1);
  
  // Show conference section
  document.getElementById('joinSection').style.display = 'none';
  document.getElementById('conferenceSection').style.display = 'block';
  
  // Store existing producers to consume later
  state.pendingConsumers = existingProducers || [];
  
  // Create send transport
  sendMessage('createTransport', { direction: 'send' });
}
```

**What this does**:
1. Server says: "You joined room X"
2. Server tells us who's already there
3. Server tells us what media they have
4. We update the UI
5. We store their producers (will consume later)
6. We request a send transport

**Why store producers?**
- We need recv transport first
- Then we'll consume all existing producers
- Ensures proper initialization order

---

### Step 5: Creating Send Transport

```javascript
async function configureTransportAndProduce(payload) {
  const { transportId, iceParameters, iceCandidates, dtlsParameters, direction } = payload;
  
  if (direction === 'send') {
    // Create send transport
    state.sendTransport = state.device.createSendTransport({
      id: transportId,
      iceParameters,
      iceCandidates,
      dtlsParameters
    });
    
    // Handle 'connect' event
    state.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        sendMessage('connectTransport', {
          transportId: state.sendTransport.id,
          dtlsParameters
        });
        callback();
      } catch (error) {
        errback(error);
      }
    });
    
    // Handle 'produce' event
    state.sendTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
      try {
        // Tell server we're producing
        sendMessage('produce', {
          transportId: state.sendTransport.id,
          kind,
          rtpParameters
        });
        
        // Wait for server response
        const producerId = await waitForProduced(kind);
        callback({ id: producerId });
      } catch (error) {
        errback(error);
      }
    });
    
    // Start producing
    await produceMedia();
    
    // Create recv transport next
    sendMessage('createTransport', { direction: 'recv' });
  }
}
```

**What this does**:

1. **Creates send transport**:
   ```javascript
   state.sendTransport = state.device.createSendTransport({...});
   ```
   - Uses parameters from server
   - Transport ready to send media

2. **Handles 'connect' event**:
   - Fired when transport needs to connect
   - We tell server to finalize connection
   - Like completing a handshake

3. **Handles 'produce' event**:
   - Fired when we start producing media
   - We tell server: "I'm sending video/audio"
   - Server creates producer
   - We get producer ID back

4. **Produces media**:
   - Sends our camera and microphone
   - Creates 2 producers (video + audio)

5. **Requests recv transport**:
   - Need it to receive others' media

---

### Step 6: Producing Media

```javascript
async function produceMedia() {
  const videoTrack = state.localStream.getVideoTracks()[0];
  const audioTrack = state.localStream.getAudioTracks()[0];
  
  // Produce video
  if (videoTrack) {
    const videoProducer = await state.sendTransport.produce({ 
      track: videoTrack 
    });
    state.producers.set('video', videoProducer);
    log('Video producer created:', videoProducer.id);
  }
  
  // Produce audio
  if (audioTrack) {
    const audioProducer = await state.sendTransport.produce({ 
      track: audioTrack 
    });
    state.producers.set('audio', audioProducer);
    log('Audio producer created:', audioProducer.id);
  }
}
```

**What this does**:
1. Gets video track from local stream
2. Tells send transport to produce it
3. Stores video producer
4. Same for audio

**What happens under the hood**:
```
Client: sendTransport.produce({ track: videoTrack })
   ↓
Triggers: sendTransport 'produce' event
   ↓
Client → Server: "produce" message with parameters
   ↓
Server: Creates producer, starts receiving video
   ↓
Server → Client: "produced" message with producer ID
   ↓
Client: Resolves produce() promise
```

---

### Step 7: Creating Recv Transport

```javascript
} else if (direction === 'recv') {
  // Create receive transport
  state.recvTransport = state.device.createRecvTransport({
    id: transportId,
    iceParameters,
    iceCandidates,
    dtlsParameters
  });
  
  // Handle 'connect' event
  state.recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
    try {
      sendMessage('connectTransport', {
        transportId: state.recvTransport.id,
        dtlsParameters
      });
      callback();
    } catch (error) {
      errback(error);
    }
  });
  
  // Consume pending producers
  if (state.pendingConsumers && state.pendingConsumers.length > 0) {
    state.pendingConsumers.forEach(peerInfo => {
      peerInfo.producers.forEach(producer => {
        sendMessage('consume', {
          producerId: producer.producerId,
          rtpCapabilities: state.device.rtpCapabilities
        });
      });
    });
    
    state.pendingConsumers = [];
  }
  
  hideLoading();
}
```

**What this does**:
1. Creates recv transport
2. Sets up connect handler
3. **Consumes all existing producers**
4. Clears pending consumers

**This is the fix!**
- When we join, we get existing producers
- We store them in `pendingConsumers`
- After recv transport is ready, we consume them all
- Now we can see everyone who joined before us!

---

### Step 8: Consuming Media

```javascript
async function startReceivingRemoteMedia(payload) {
  const { consumerId, producerId, producerPeerId, kind, rtpParameters } = payload;
  
  log(`Consuming ${kind} from peer ${producerPeerId}`);
  
  // Create consumer
  const consumer = await state.recvTransport.consume({
    id: consumerId,
    producerId,
    kind,
    rtpParameters
  });
  
  // Store consumer
  state.consumers.set(consumerId, {
    consumer,
    producerId,
    producerPeerId,
    kind
  });
  
  // Update remote peer info
  if (!state.remotePeers.has(producerPeerId)) {
    state.remotePeers.set(producerPeerId, {
      id: producerPeerId,
      consumers: new Map()
    });
  }
  
  const remotePeer = state.remotePeers.get(producerPeerId);
  remotePeer.consumers.set(kind, consumer);
  
  // Add video/audio to DOM
  addRemoteVideo(producerPeerId, consumer.track, kind);
  
  // Resume consumer
  sendMessage('resumeConsumer', { consumerId });
}
```

**What this does**:
1. **Creates consumer**:
   ```javascript
   const consumer = await state.recvTransport.consume({...});
   ```
   - Tells device to start receiving media

2. **Stores consumer**:
   - Keep track of it
   - Map to producer and peer

3. **Updates peer info**:
   - Track which consumers belong to which peer
   - Organize by media type

4. **Adds to DOM**:
   ```javascript
   addRemoteVideo(producerPeerId, consumer.track, kind);
   ```
   - Creates video element
   - Attaches media track
   - Shows on screen

5. **Resumes consumer**:
   - Consumers start paused
   - Resume to start receiving media

---

### Part 4: Displaying Remote Video

```javascript
function addRemoteVideo(peerId, track, kind) {
  let videoContainer = document.getElementById(`peer-${peerId}`);
  
  // Create container if doesn't exist
  if (!videoContainer) {
    videoContainer = document.createElement('div');
    videoContainer.id = `peer-${peerId}`;
    videoContainer.className = 'video-container';
    
    videoContainer.innerHTML = `
      <video id="video-${peerId}" autoplay playsinline></video>
      <div class="video-overlay">
        <span class="participant-name">Participant ${peerId.slice(-4)}</span>
      </div>
    `;
    
    document.getElementById('videoGrid').appendChild(videoContainer);
  }
  
  const videoElement = document.getElementById(`video-${peerId}`);
  
  // Add track to video element
  if (kind === 'video') {
    if (!videoElement.srcObject) {
      videoElement.srcObject = new MediaStream();
    }
    videoElement.srcObject.addTrack(track);
  } else if (kind === 'audio') {
    if (!videoElement.srcObject) {
      videoElement.srcObject = new MediaStream();
    }
    videoElement.srcObject.addTrack(track);
  }
}
```

**What this does**:
1. **Check if container exists**:
   - Each peer has one video container
   - Contains video element and overlay

2. **Create container if needed**:
   - Creates div with video element
   - Adds participant name
   - Adds to video grid

3. **Add track to video**:
   - Creates MediaStream if doesn't exist
   - Adds video/audio track
   - Browser automatically plays

**Why same video element for audio and video?**
- One MediaStream can have multiple tracks
- Video element handles both
- Keeps things simple

---

## The Complete Flow

Let's see the complete flow when 2 people join:

### Person 1 Joins:

```
1. P1 → Server: "getRouterRtpCapabilities"
2. Server → P1: {rtpCapabilities: [...]}
3. P1: Creates Device, loads capabilities
4. P1: Gets camera/microphone
5. P1 → Server: "joinRoom" {roomId: "room1"}
6. Server → P1: "roomJoined" {roomId: "room1", peers: [], existingProducers: []}
7. P1 → Server: "createTransport" {direction: "send"}
8. Server → P1: "transportCreated" {transportId, iceParameters, ...}
9. P1: Creates send transport
10. P1: Produces video and audio
11. P1 → Server: "produce" {kind: "video", rtpParameters: ...}
12. Server → P1: "produced" {producerId: "abc123"}
13. P1 → Server: "produce" {kind: "audio", rtpParameters: ...}
14. Server → P1: "produced" {producerId: "def456"}
15. P1 → Server: "createTransport" {direction: "recv"}
16. Server → P1: "transportCreated" {transportId, ...}
17. P1: Creates recv transport
18. P1: No pending consumers (first person)
19. P1: Done! Sees own video
```

### Person 2 Joins:

```
1. P2 → Server: "getRouterRtpCapabilities"
2. Server → P2: {rtpCapabilities: [...]}
3. P2: Creates Device, loads capabilities
4. P2: Gets camera/microphone
5. P2 → Server: "joinRoom" {roomId: "room1"}
6. Server → P2: "roomJoined" {
     roomId: "room1",
     peers: ["P1"],
     existingProducers: [{
       peerId: "P1",
       producers: [
         {producerId: "abc123", kind: "video"},
         {producerId: "def456", kind: "audio"}
       ]
     }]
   }
7. Server → P1: "newPeer" {peerId: "P2"}
8. P2 → Server: "createTransport" {direction: "send"}
9. Server → P2: "transportCreated" {...}
10. P2: Creates send transport, produces video/audio
11. P2 → Server: "produce" {kind: "video", ...}
12. Server → P2: "produced" {producerId: "ghi789"}
13. Server → P1: "newProducer" {peerId: "P2", producerId: "ghi789", kind: "video"}
14. P1 → Server: "consume" {producerId: "ghi789", ...}
15. P2 → Server: "produce" {kind: "audio", ...}
16. Server → P2: "produced" {producerId: "jkl012"}
17. Server → P1: "newProducer" {peerId: "P2", producerId: "jkl012", kind: "audio"}
18. P1 → Server: "consume" {producerId: "jkl012", ...}
19. P2 → Server: "createTransport" {direction: "recv"}
20. Server → P2: "transportCreated" {...}
21. P2: Creates recv transport
22. P2: Consumes pending producers:
    P2 → Server: "consume" {producerId: "abc123", ...}
    P2 → Server: "consume" {producerId: "def456", ...}
23. Server → P2: "consumed" {consumerId, rtpParameters, ...} (for abc123)
24. P2: Creates consumer, adds P1's video to DOM
25. P2 → Server: "resumeConsumer" {consumerId}
26. Server → P2: "consumed" {consumerId, ...} (for def456)
27. P2: Creates consumer, adds P1's audio to DOM
28. P2 → Server: "resumeConsumer" {consumerId}
29. Server → P1: "consumed" {consumerId, ...} (for P2's video)
30. P1: Creates consumer, adds P2's video to DOM
31. P1 → Server: "resumeConsumer" {consumerId}
32. Server → P1: "consumed" {consumerId, ...} (for P2's audio)
33. P1: Creates consumer, adds P2's audio to DOM
34. P1 → Server: "resumeConsumer" {consumerId}
35. Done! Both see each other!
```

---

## Summary

### What We Built:
A video conference application where:
- Multiple people can join rooms
- Everyone sees everyone else
- Uses mediasoup SFU for efficient media routing
- All media goes through server, no peer-to-peer

### Key Technologies:
- **mediasoup**: Media routing engine
- **WebSocket**: Control/signaling messages
- **WebRTC**: Actual media streaming
- **Express**: HTTP server for web pages

### Architecture:
```
Client (Browser)
  ├── HTML: User interface
  ├── JavaScript: WebRTC logic
  └── mediasoup-client: WebRTC helper

Server (Node.js)
  ├── Express: Serve web pages
  ├── WebSocket: Signaling
  └── mediasoup: Media routing
       ├── Worker: Process media
       ├── Router: Route media
       ├── Transports: WebRTC connections
       ├── Producers: Incoming media
       └── Consumers: Outgoing media
```

### Data Flow:
1. **Signaling**: WebSocket (control messages)
2. **Media**: WebRTC (video/audio streams)

### Key Concepts:
- **Worker**: Processes media
- **Router**: Routes media with codecs
- **Transport**: WebRTC connection (send OR receive)
- **Producer**: Media you send
- **Consumer**: Media you receive

### Why This Works:
- Server forwards media without transcoding
- Efficient and scalable
- Low latency
- Works through firewalls
- Each participant only connects to server

---

## Next Steps to Learn More

1. **Experiment**: Change video resolution, add screen sharing
2. **Read mediasoup docs**: https://mediasoup.org/documentation/
3. **Learn WebRTC**: Understand ICE, DTLS, RTP
4. **Add features**: Chat, recording, layouts
5. **Deploy**: Learn about TURN servers, scaling

---

**Congratulations!** You now understand how a professional video conference system works! 🎉

