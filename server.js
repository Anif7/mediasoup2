/**
 * mediasoup Video Conference Server
 * Main server file that initializes mediasoup, HTTP server, and WebSocket signaling
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mediasoup = require('mediasoup');
const config = require('./config');

// State management
let mediasoupWorker = null;
let mediasoupRouter = null;
const rooms = new Map(); // Store rooms and their participants
const peers = new Map(); // Store peer connections

/**
 * Initialize Express and HTTP server
 */
async function createHttpServer() {
  const app = express();
  
  // Serve static files (HTML, CSS, JS)
  app.use(express.static('public'));
  
  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', workers: mediasoupWorker ? 1 : 0 });
  });
  
  const httpServer = http.createServer(app);
  
  return httpServer;
}

/**
 * Initialize mediasoup Worker
 * Worker is a mediasoup process that handles media routing
 */
async function createMediasoupWorker() {
  console.log('[Server] Creating mediasoup Worker...');
  
  const worker = await mediasoup.createWorker({
    rtcMinPort: config.mediasoup.worker.rtcMinPort,
    rtcMaxPort: config.mediasoup.worker.rtcMaxPort,
    logLevel: config.mediasoup.worker.logLevel,
    logTags: config.mediasoup.worker.logTags
  });
  
  // Log worker resource usage periodically
  setInterval(async () => {
    const usage = await worker.getResourceUsage();
    console.log('[Worker] Resource usage:', usage);
  }, 30000); // Every 30 seconds
  
  // Handle worker death
  worker.on('died', (error) => {
    console.error('[Worker] Died unexpectedly:', error);
    process.exit(1);
  });
  
  console.log('[Server] mediasoup Worker created (pid:', worker.pid, ')');
  
  return worker;
}

/**
 * Create mediasoup Router
 * Router handles media streams between participants
 */
async function createMediasoupRouter() {
  console.log('[Server] Creating mediasoup Router...');
  
  const router = await mediasoupWorker.createRouter({
    mediaCodecs: config.mediasoup.router.mediaCodecs
  });
  
  console.log('[Server] mediasoup Router created (id:', router.id, ')');
  
  return router;
}

/**
 * Create WebRTC Transport for a peer
 * Transport is used to send or receive media
 * @param {string} peerId - Unique peer identifier
 * @param {string} direction - 'send' or 'recv'
 */
async function createWebRtcTransport(peerId, direction) {
  console.log(`[Transport] Creating ${direction} transport for peer:`, peerId);
  
  const transport = await mediasoupRouter.createWebRtcTransport({
    listenIps: config.mediasoup.webRtcTransport.listenIps,
    enableUdp: config.mediasoup.webRtcTransport.enableUdp,
    enableTcp: config.mediasoup.webRtcTransport.enableTcp,
    preferUdp: config.mediasoup.webRtcTransport.preferUdp,
    initialAvailableOutgoingBitrate: config.mediasoup.webRtcTransport.initialAvailableOutgoingBitrate
  });
  
  // Handle transport closure
  transport.on('dtlsstatechange', (dtlsState) => {
    if (dtlsState === 'closed') {
      console.log(`[Transport] ${direction} transport closed for peer:`, peerId);
      transport.close();
    }
  });
  
  transport.on('close', () => {
    console.log(`[Transport] ${direction} transport closed for peer:`, peerId);
  });
  
  return transport;
}

/**
 * Get Router RTP Capabilities
 * Clients need this to know what codecs are supported
 */
function getRouterRtpCapabilities() {
  return mediasoupRouter.rtpCapabilities;
}

/**
 * Initialize WebSocket Signaling Server
 * Handles all communication between clients and server
 */
function createWebSocketServer(httpServer) {
  const wss = new WebSocket.Server({ server: httpServer });
  
  console.log('[WebSocket] Server initialized');
  
  wss.on('connection', (socket) => {
    const peerId = generatePeerId();
    console.log('[WebSocket] New peer connected:', peerId);
    
    // Initialize peer state
    peers.set(peerId, {
      id: peerId,
      socket: socket,
      transports: new Map(), // Store send/recv transports
      producers: new Map(),  // Store media producers
      consumers: new Map(),  // Store media consumers
      roomId: null
    });
    
    // Send peerId to client
    sendMessage(socket, 'connected', { peerId });
    
    // Handle incoming messages
    socket.on('message', async (message) => {
      try {
        const data = JSON.parse(message);
        await routeIncomingMessage(peerId, data);
      } catch (error) {
        console.error('[WebSocket] Error handling message:', error);
        sendMessage(socket, 'error', { message: error.message });
      }
    });
    
    // Handle peer disconnection
    socket.on('close', () => {
      handlePeerDisconnection(peerId);
    });
    
    socket.on('error', (error) => {
      console.error('[WebSocket] Socket error:', error);
    });
  });
  
  return wss;
}

/**
 * Route incoming WebSocket messages to appropriate handlers
 * Parses message type and delegates to specific handler functions
 */
async function routeIncomingMessage(peerId, data) {
  const { type, payload } = data;
  const peer = peers.get(peerId);
  
  if (!peer) {
    console.error('[Message] Peer not found:', peerId);
    return;
  }
  
  console.log(`[Message] Received '${type}' from peer:`, peerId);
  
  switch (type) {
    case 'getRouterRtpCapabilities':
      sendRouterCapabilitiesToPeer(peer);
      break;
      
    case 'joinRoom':
      await addPeerToRoomAndNotifyOthers(peer, payload);
      break;
      
    case 'createTransport':
      await createTransportAndSendParameters(peer, payload);
      break;
      
    case 'connectTransport':
      await finalizeTransportConnection(peer, payload);
      break;
      
    case 'produce':
      await createProducerAndBroadcastToPeers(peer, payload);
      break;
      
    case 'consume':
      await createConsumerForRemoteProducer(peer, payload);
      break;
      
    case 'resumeConsumer':
      await resumePausedConsumer(peer, payload);
      break;
      
    default:
      console.warn('[Message] Unknown message type:', type);
  }
}

/**
 * Send router's RTP capabilities to the requesting peer
 * Client needs this to initialize their mediasoup Device
 */
function sendRouterCapabilitiesToPeer(peer) {
  const rtpCapabilities = getRouterRtpCapabilities();
  sendMessage(peer.socket, 'routerRtpCapabilities', { rtpCapabilities });
}

/**
 * Add peer to room and notify all other participants
 * Also sends list of existing producers so new peer can consume them
 */
async function addPeerToRoomAndNotifyOthers(peer, payload) {
  const { roomId } = payload;
  
  console.log(`[Room] Peer ${peer.id} joining room:`, roomId);
  
  // Create room if it doesn't exist
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      peers: new Set()
    });
    console.log('[Room] Created new room:', roomId);
  }
  
  const room = rooms.get(roomId);
  
  // Get existing peers in the room
  const existingPeers = Array.from(room.peers).filter(id => id !== peer.id);
  
  // Add peer to room
  room.peers.add(peer.id);
  peer.roomId = roomId;
  
  // Collect existing peers and their producers
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
  
  // Send existing peers and their producers to the new peer
  sendMessage(peer.socket, 'roomJoined', {
    roomId,
    peers: existingPeers,
    existingProducers: existingPeersInfo
  });
  
  // Notify other peers about the new peer
  existingPeers.forEach(existingPeerId => {
    const existingPeer = peers.get(existingPeerId);
    if (existingPeer && existingPeer.socket.readyState === WebSocket.OPEN) {
      sendMessage(existingPeer.socket, 'newPeer', { peerId: peer.id });
    }
  });
  
  console.log(`[Room] Peer ${peer.id} joined room ${roomId}. Total peers:`, room.peers.size);
  if (existingPeersInfo.length > 0) {
    console.log(`[Room] Sent ${existingPeersInfo.length} existing peer(s) with producers to new peer`);
  }
}

/**
 * Create WebRTC transport (send or recv) and send connection parameters to peer
 * Transport is the WebRTC connection endpoint on the server side
 */
async function createTransportAndSendParameters(peer, payload) {
  const { direction } = payload; // 'send' or 'recv'
  
  const transport = await createWebRtcTransport(peer.id, direction);
  
  // Store transport
  peer.transports.set(transport.id, { transport, direction });
  
  // Send transport parameters to client
  sendMessage(peer.socket, 'transportCreated', {
    transportId: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
    direction
  });
}

/**
 * Finalize transport connection with DTLS parameters from client
 * Completes the WebRTC handshake process
 */
async function finalizeTransportConnection(peer, payload) {
  const { transportId, dtlsParameters } = payload;
  
  const transportData = peer.transports.get(transportId);
  if (!transportData) {
    throw new Error('Transport not found');
  }
  
  await transportData.transport.connect({ dtlsParameters });
  
  sendMessage(peer.socket, 'transportConnected', { transportId });
}

/**
 * Create producer to receive media from peer and broadcast availability to others
 * Server-side producer receives media stream from this peer's camera/microphone
 */
async function createProducerAndBroadcastToPeers(peer, payload) {
  const { transportId, kind, rtpParameters } = payload;
  
  const transportData = peer.transports.get(transportId);
  if (!transportData) {
    throw new Error('Transport not found');
  }
  
  const producer = await transportData.transport.produce({
    kind,
    rtpParameters
  });
  
  // Store producer
  peer.producers.set(producer.id, { producer, kind });
  
  console.log(`[Producer] Created ${kind} producer for peer ${peer.id}:`, producer.id);
  
  // Notify client
  sendMessage(peer.socket, 'produced', {
    producerId: producer.id,
    kind
  });
  
  // Notify other peers in the room that new media is available
  if (peer.roomId) {
    const room = rooms.get(peer.roomId);
    if (room) {
      room.peers.forEach(otherPeerId => {
        if (otherPeerId !== peer.id) {
          const otherPeer = peers.get(otherPeerId);
          if (otherPeer && otherPeer.socket.readyState === WebSocket.OPEN) {
            sendMessage(otherPeer.socket, 'newProducer', {
              peerId: peer.id,
              producerId: producer.id,
              kind
            });
          }
        }
      });
    }
  }
}

/**
 * Create consumer to send remote producer's media to requesting peer
 * Server-side consumer forwards another peer's stream to this peer
 */
async function createConsumerForRemoteProducer(peer, payload) {
  const { producerId, rtpCapabilities } = payload;
  
  // Find the producer
  let producerPeer = null;
  let producer = null;
  
  for (const [peerId, p] of peers.entries()) {
    if (p.producers.has(producerId)) {
      producerPeer = p;
      producer = p.producers.get(producerId).producer;
      break;
    }
  }
  
  if (!producer) {
    throw new Error('Producer not found');
  }
  
  // Check if router can consume
  if (!mediasoupRouter.canConsume({ producerId, rtpCapabilities })) {
    throw new Error('Cannot consume');
  }
  
  // Get recv transport
  const recvTransport = Array.from(peer.transports.values())
    .find(t => t.direction === 'recv');
  
  if (!recvTransport) {
    throw new Error('Recv transport not found');
  }
  
  // Create consumer
  const consumer = await recvTransport.transport.consume({
    producerId,
    rtpCapabilities,
    paused: true // Start paused
  });
  
  // Store consumer
  peer.consumers.set(consumer.id, {
    consumer,
    producerId,
    producerPeerId: producerPeer.id
  });
  
  console.log(`[Consumer] Created consumer for peer ${peer.id}:`, consumer.id);
  
  // Send consumer parameters to client
  sendMessage(peer.socket, 'consumed', {
    consumerId: consumer.id,
    producerId,
    producerPeerId: producerPeer.id,
    kind: consumer.kind,
    rtpParameters: consumer.rtpParameters
  });
}

/**
 * Resume a paused consumer to start media flow
 * Consumers are created paused and must be explicitly resumed
 */
async function resumePausedConsumer(peer, payload) {
  const { consumerId } = payload;
  
  const consumerData = peer.consumers.get(consumerId);
  if (!consumerData) {
    throw new Error('Consumer not found');
  }
  
  await consumerData.consumer.resume();
  
  sendMessage(peer.socket, 'consumerResumed', { consumerId });
}

/**
 * Handle peer disconnection
 */
function handlePeerDisconnection(peerId) {
  console.log('[WebSocket] Peer disconnected:', peerId);
  
  const peer = peers.get(peerId);
  if (!peer) return;
  
  // Close all transports
  peer.transports.forEach(({ transport }) => {
    transport.close();
  });
  
  // Remove from room
  if (peer.roomId) {
    const room = rooms.get(peer.roomId);
    if (room) {
      room.peers.delete(peerId);
      
      // Notify other peers
      room.peers.forEach(otherPeerId => {
        const otherPeer = peers.get(otherPeerId);
        if (otherPeer && otherPeer.socket.readyState === WebSocket.OPEN) {
          sendMessage(otherPeer.socket, 'peerLeft', { peerId });
        }
      });
      
      // Delete room if empty
      if (room.peers.size === 0) {
        rooms.delete(peer.roomId);
        console.log('[Room] Deleted empty room:', peer.roomId);
      }
    }
  }
  
  // Remove peer
  peers.delete(peerId);
}

/**
 * Helper: Send message to client
 */
function sendMessage(socket, type, payload) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type, payload }));
  }
}

/**
 * Helper: Generate unique peer ID
 */
function generatePeerId() {
  return `peer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Main function - Initialize and start the server
 */
async function main() {
  try {
    console.log('='.repeat(60));
    console.log('Starting mediasoup Video Conference Server');
    console.log('='.repeat(60));
    
    // Step 1: Create mediasoup worker
    mediasoupWorker = await createMediasoupWorker();
    
    // Step 2: Create mediasoup router
    mediasoupRouter = await createMediasoupRouter();
    
    // Step 3: Create HTTP server
    const httpServer = await createHttpServer();
    
    // Step 4: Create WebSocket server
    createWebSocketServer(httpServer);
    
    // Step 5: Start listening
    httpServer.listen(config.httpServer.listenPort, config.httpServer.listenIp, () => {
      console.log('='.repeat(60));
      console.log(`[Server] HTTP server listening on http://${config.httpServer.listenIp}:${config.httpServer.listenPort}`);
      console.log(`[Server] Open http://localhost:${config.httpServer.listenPort} in your browser`);
      console.log('='.repeat(60));
    });
    
  } catch (error) {
    console.error('[Server] Failed to start:', error);
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[Server] Shutting down gracefully...');
  process.exit(0);
});

// Start the server
main();

