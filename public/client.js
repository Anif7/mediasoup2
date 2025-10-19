/**
 * mediasoup Video Conference Client
 * Handles WebRTC connection, media streaming, and signaling
 */

// Import mediasoup-client
import * as mediasoupClient from 'mediasoup-client';

// State Management
const state = {
  socket: null,
  peerId: null,
  roomId: null,
  device: null,
  sendTransport: null,
  recvTransport: null,
  producers: new Map(), // Local producers (camera, mic)
  consumers: new Map(), // Remote consumers
  remotePeers: new Map(), // Remote peer information
  isVideoEnabled: true,
  isAudioEnabled: true,
  localStream: null,
  pendingConsumers: [] // Producers to consume after recv transport is ready
};

// Debug logging
const DEBUG = true;
function log(...args) {
  if (DEBUG) {
    console.log('[Client]', ...args);
  }
}

/**
 * Initialize the application when DOM is ready
 */
document.addEventListener('DOMContentLoaded', async () => {
  log('Application starting...');
  
  // Setup event listeners
  setupEventListeners();
  
  // Connect to WebSocket server
  connectToServer();
});

/**
 * Setup DOM event listeners
 */
function setupEventListeners() {
  // Join button
  document.getElementById('joinBtn').addEventListener('click', handleJoinRoom);
  
  // Enter key on room input
  document.getElementById('roomIdInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleJoinRoom();
    }
  });
  
  // Media controls
  document.getElementById('toggleVideoBtn').addEventListener('click', toggleVideo);
  document.getElementById('toggleAudioBtn').addEventListener('click', toggleAudio);
  document.getElementById('leaveRoomBtn').addEventListener('click', leaveRoom);
  
  // Debug toggle
  document.getElementById('toggleDebugBtn').addEventListener('click', () => {
    const debugSection = document.getElementById('debugSection');
    debugSection.style.display = debugSection.style.display === 'none' ? 'block' : 'none';
    updateDebugInfo();
  });
}

/**
 * Connect to WebSocket server
 */
function connectToServer() {
  log('Connecting to server...');
  showLoading('Connecting to server...');
  
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  
  state.socket = new WebSocket(wsUrl);
  
  state.socket.onopen = () => {
    log('WebSocket connected');
    updateConnectionStatus(true);
    hideLoading();
  };
  
  state.socket.onclose = () => {
    log('WebSocket disconnected');
    updateConnectionStatus(false);
    showNotification('Disconnected from server', 'error');
  };
  
  state.socket.onerror = (error) => {
    console.error('WebSocket error:', error);
    showNotification('Connection error', 'error');
    hideLoading();
  };
  
  state.socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    routeServerMessage(message);
  };
}

/**
 * Route server messages to appropriate handler functions
 * Parses message type and delegates to specific handlers
 */
async function routeServerMessage(message) {
  const { type, payload } = message;
  log(`Received '${type}' message:`, payload);
  
  try {
    switch (type) {
      case 'connected':
        state.peerId = payload.peerId;
        log('Assigned peer ID:', state.peerId);
        break;
        
      case 'routerRtpCapabilities':
        await initializeDeviceWithCapabilities(payload);
        break;
        
      case 'roomJoined':
        await setupLocalMediaAndTransports(payload);
        break;
        
      case 'newPeer':
        trackNewPeerJoined(payload);
        break;
        
      case 'transportCreated':
        await configureTransportAndProduce(payload);
        break;
        
      case 'transportConnected':
        log('Transport connected');
        break;
        
      case 'produced':
        confirmProducerCreated(payload);
        break;
        
      case 'newProducer':
        await requestToConsumeNewProducer(payload);
        break;
        
      case 'consumed':
        await startReceivingRemoteMedia(payload);
        break;
        
      case 'consumerResumed':
        log('Consumer resumed');
        break;
        
      case 'peerLeft':
        cleanupDisconnectedPeer(payload);
        break;
        
      case 'error':
        console.error('Server error:', payload.message);
        showNotification(`Error: ${payload.message}`, 'error');
        break;
        
      default:
        console.warn('Unknown message type:', type);
    }
    
    updateDebugInfo();
  } catch (error) {
    console.error('Error handling message:', error);
    showNotification('Error processing server message', 'error');
  }
}

/**
 * Send message to server
 */
function sendMessage(type, payload = {}) {
  if (state.socket && state.socket.readyState === WebSocket.OPEN) {
    state.socket.send(JSON.stringify({ type, payload }));
    log(`Sent '${type}' message:`, payload);
  } else {
    console.error('WebSocket not connected');
  }
}

/**
 * Handle join room button click
 */
async function handleJoinRoom() {
  const roomIdInput = document.getElementById('roomIdInput');
  const roomId = roomIdInput.value.trim();
  
  if (!roomId) {
    showNotification('Please enter a room name', 'warning');
    roomIdInput.focus();
    return;
  }
  
  state.roomId = roomId;
  
  try {
    showLoading('Joining room...');
    
    // Step 1: Get router RTP capabilities
    sendMessage('getRouterRtpCapabilities');
    
  } catch (error) {
    console.error('Error joining room:', error);
    showNotification('Failed to join room', 'error');
    hideLoading();
  }
}

/**
 * Quick join function (called from HTML)
 */
window.quickJoin = function(roomId) {
  document.getElementById('roomIdInput').value = roomId;
  handleJoinRoom();
};

/**
 * Initialize mediasoup Device with router capabilities from server
 * Device needs to know what codecs the server supports
 */
async function initializeDeviceWithCapabilities(payload) {
  const { rtpCapabilities } = payload;
  
  log('Received router RTP capabilities');
  showLoading('Initializing device...');
  
  // Create mediasoup Device
  state.device = new mediasoupClient.Device();
  
  // Load device with router capabilities
  await state.device.load({ routerRtpCapabilities: rtpCapabilities });
  
  log('Device loaded, can produce:', {
    audio: state.device.canProduce('audio'),
    video: state.device.canProduce('video')
  });
  
  // Step 2: Get user media (camera and microphone)
  await getUserMedia();
  
  // Step 3: Join room
  sendMessage('joinRoom', { roomId: state.roomId });
}

/**
 * Get user media (camera and microphone)
 */
async function getUserMedia() {
  showLoading('Accessing camera and microphone...');
  
  try {
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
    
    log('Got user media:', state.localStream.getTracks().map(t => t.kind));
    
    // Display local video
    const localVideo = document.getElementById('localVideo');
    localVideo.srcObject = state.localStream;
    
  } catch (error) {
    console.error('Error getting user media:', error);
    showNotification('Failed to access camera/microphone. Please grant permissions.', 'error');
    throw error;
  }
}

/**
 * Setup local media and transports after successfully joining room
 * Creates send transport for camera/mic and prepares to consume existing producers
 */
async function setupLocalMediaAndTransports(payload) {
  const { roomId, peers, existingProducers } = payload;
  
  log('Joined room:', roomId, 'with peers:', peers);
  log('Existing producers:', existingProducers);
  showLoading('Setting up media connection...');
  
  // Update UI
  document.getElementById('currentRoomName').textContent = roomId;
  updatePeerCount(peers.length + 1); // +1 for self
  
  // Show conference section, hide join section
  document.getElementById('joinSection').style.display = 'none';
  document.getElementById('conferenceSection').style.display = 'block';
  
  // Store existing producers to consume later (after we create recv transport)
  state.pendingConsumers = existingProducers || [];
  
  // Step 4: Create send transport
  sendMessage('createTransport', { direction: 'send' });
}

/**
 * Configure WebRTC transport and start producing/consuming media
 * Sets up event handlers and initiates media flow
 */
async function configureTransportAndProduce(payload) {
  const { transportId, iceParameters, iceCandidates, dtlsParameters, direction } = payload;
  
  log(`${direction} transport created:`, transportId);
  
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
        log('Send transport connecting...');
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
        log(`Producing ${kind}...`);
        
        // Send produce request to server
        const producePromise = new Promise((resolve) => {
          // Store callback to call when server responds
          const originalHandler = state.socket.onmessage;
          state.socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.type === 'produced' && message.payload.kind === kind) {
              resolve(message.payload.producerId);
              state.socket.onmessage = originalHandler;
            } else {
              originalHandler(event);
            }
          };
        });
        
        sendMessage('produce', {
          transportId: state.sendTransport.id,
          kind,
          rtpParameters
        });
        
        const producerId = await producePromise;
        callback({ id: producerId });
        
      } catch (error) {
        errback(error);
      }
    });
    
    // Step 5: Produce media (camera and microphone)
    await produceMedia();
    
    // Step 6: Create recv transport for consuming
    sendMessage('createTransport', { direction: 'recv' });
    
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
        log('Recv transport connecting...');
        sendMessage('connectTransport', {
          transportId: state.recvTransport.id,
          dtlsParameters
        });
        callback();
      } catch (error) {
        errback(error);
      }
    });
    
    // Consume pending producers from existing peers
    if (state.pendingConsumers && state.pendingConsumers.length > 0) {
      log('Consuming existing producers:', state.pendingConsumers.length);
      
      // Consume each existing producer
      state.pendingConsumers.forEach(peerInfo => {
        peerInfo.producers.forEach(producer => {
          log(`Requesting to consume ${producer.kind} from peer ${peerInfo.peerId}`);
          sendMessage('consume', {
            producerId: producer.producerId,
            rtpCapabilities: state.device.rtpCapabilities
          });
        });
      });
      
      // Clear pending consumers
      state.pendingConsumers = [];
    }
    
    hideLoading();
    showNotification('Successfully joined the room!', 'success');
  }
}

/**
 * Produce media (send camera and microphone to server)
 */
async function produceMedia() {
  log('Starting to produce media...');
  
  const videoTrack = state.localStream.getVideoTracks()[0];
  const audioTrack = state.localStream.getAudioTracks()[0];
  
  // Produce video
  if (videoTrack) {
    const videoProducer = await state.sendTransport.produce({ track: videoTrack });
    state.producers.set('video', videoProducer);
    log('Video producer created:', videoProducer.id);
    
    videoProducer.on('trackended', () => {
      log('Video track ended');
    });
    
    videoProducer.on('transportclose', () => {
      log('Video producer transport closed');
    });
  }
  
  // Produce audio
  if (audioTrack) {
    const audioProducer = await state.sendTransport.produce({ track: audioTrack });
    state.producers.set('audio', audioProducer);
    log('Audio producer created:', audioProducer.id);
    
    audioProducer.on('trackended', () => {
      log('Audio track ended');
    });
    
    audioProducer.on('transportclose', () => {
      log('Audio producer transport closed');
    });
  }
}

/**
 * Confirm producer was created successfully on server
 * Server acknowledges it's receiving our media stream
 */
function confirmProducerCreated(payload) {
  const { producerId, kind } = payload;
  log(`${kind} producer confirmed:`, producerId);
}

/**
 * Track new peer that joined the room
 * Adds peer to local state for future producer consumption
 */
function trackNewPeerJoined(payload) {
  const { peerId } = payload;
  log('New peer joined:', peerId);
  
  state.remotePeers.set(peerId, {
    id: peerId,
    consumers: new Map()
  });
  
  updatePeerCount(state.remotePeers.size + 1);
  showNotification(`New participant joined`, 'info');
}

/**
 * Request to consume newly available producer from another peer
 * Triggered when another peer starts sharing their camera/mic
 */
async function requestToConsumeNewProducer(payload) {
  const { peerId, producerId, kind } = payload;
  log(`New ${kind} producer from peer ${peerId}:`, producerId);
  
  // Request to consume this producer
  sendMessage('consume', {
    producerId,
    rtpCapabilities: state.device.rtpCapabilities
  });
}

/**
 * Start receiving and displaying remote media from consumed producer
 * Creates consumer, attaches to video element, and resumes playback
 */
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
  
  // Get or create remote peer info
  if (!state.remotePeers.has(producerPeerId)) {
    state.remotePeers.set(producerPeerId, {
      id: producerPeerId,
      consumers: new Map()
    });
  }
  
  const remotePeer = state.remotePeers.get(producerPeerId);
  remotePeer.consumers.set(kind, consumer);
  
  // Create video element for remote peer
  addRemoteVideo(producerPeerId, consumer.track, kind);
  
  // Resume consumer
  sendMessage('resumeConsumer', { consumerId });
  
  consumer.on('transportclose', () => {
    log(`Consumer transport closed for peer ${producerPeerId}`);
  });
}

/**
 * Cleanup resources when a peer disconnects from the room
 * Removes video elements and cleans up state
 */
function cleanupDisconnectedPeer(payload) {
  const { peerId } = payload;
  log('Peer left:', peerId);
  
  // Remove video element
  removeRemoteVideo(peerId);
  
  // Clean up state
  state.remotePeers.delete(peerId);
  
  updatePeerCount(state.remotePeers.size + 1);
  showNotification('A participant left', 'info');
}

/**
 * Add remote video element to the grid
 */
function addRemoteVideo(peerId, track, kind) {
  let videoContainer = document.getElementById(`peer-${peerId}`);
  
  if (!videoContainer) {
    // Create video container
    videoContainer = document.createElement('div');
    videoContainer.id = `peer-${peerId}`;
    videoContainer.className = 'video-container';
    
    videoContainer.innerHTML = `
      <video id="video-${peerId}" autoplay playsinline></video>
      <div class="video-overlay">
        <span class="participant-name">Participant ${peerId.slice(-4)}</span>
        <span class="video-status"></span>
      </div>
    `;
    
    document.getElementById('videoGrid').appendChild(videoContainer);
  }
  
  const videoElement = document.getElementById(`video-${peerId}`);
  
  if (kind === 'video') {
    // Add video track
    if (!videoElement.srcObject) {
      videoElement.srcObject = new MediaStream();
    }
    videoElement.srcObject.addTrack(track);
    log(`Added video track for peer ${peerId}`);
  } else if (kind === 'audio') {
    // Add audio track
    if (!videoElement.srcObject) {
      videoElement.srcObject = new MediaStream();
    }
    videoElement.srcObject.addTrack(track);
    log(`Added audio track for peer ${peerId}`);
  }
}

/**
 * Remove remote video element
 */
function removeRemoteVideo(peerId) {
  const videoContainer = document.getElementById(`peer-${peerId}`);
  if (videoContainer) {
    videoContainer.remove();
  }
}

/**
 * Toggle video on/off
 */
function toggleVideo() {
  const videoProducer = state.producers.get('video');
  if (!videoProducer) return;
  
  state.isVideoEnabled = !state.isVideoEnabled;
  
  if (state.isVideoEnabled) {
    videoProducer.resume();
    updateVideoButton(true);
  } else {
    videoProducer.pause();
    updateVideoButton(false);
  }
  
  log('Video toggled:', state.isVideoEnabled);
}

/**
 * Toggle audio on/off
 */
function toggleAudio() {
  const audioProducer = state.producers.get('audio');
  if (!audioProducer) return;
  
  state.isAudioEnabled = !state.isAudioEnabled;
  
  if (state.isAudioEnabled) {
    audioProducer.resume();
    updateAudioButton(true);
  } else {
    audioProducer.pause();
    updateAudioButton(false);
  }
  
  log('Audio toggled:', state.isAudioEnabled);
}

/**
 * Leave room
 */
function leaveRoom() {
  log('Leaving room...');
  
  // Close producers
  state.producers.forEach(producer => producer.close());
  state.producers.clear();
  
  // Close consumers
  state.consumers.forEach(({ consumer }) => consumer.close());
  state.consumers.clear();
  
  // Close transports
  if (state.sendTransport) {
    state.sendTransport.close();
    state.sendTransport = null;
  }
  
  if (state.recvTransport) {
    state.recvTransport.close();
    state.recvTransport = null;
  }
  
  // Stop local stream
  if (state.localStream) {
    state.localStream.getTracks().forEach(track => track.stop());
    state.localStream = null;
  }
  
  // Clear remote peers
  state.remotePeers.forEach((peer) => {
    removeRemoteVideo(peer.id);
  });
  state.remotePeers.clear();
  
  // Reset state
  state.roomId = null;
  state.device = null;
  
  // Update UI
  document.getElementById('conferenceSection').style.display = 'none';
  document.getElementById('joinSection').style.display = 'block';
  document.getElementById('roomIdInput').value = '';
  
  showNotification('Left the room', 'info');
  
  // Reconnect to server
  if (state.socket.readyState !== WebSocket.OPEN) {
    connectToServer();
  }
}

/**
 * Update UI helpers
 */
function updateConnectionStatus(connected) {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  
  if (connected) {
    statusDot.classList.add('connected');
    statusText.textContent = 'Connected';
  } else {
    statusDot.classList.remove('connected');
    statusText.textContent = 'Disconnected';
  }
}

function updatePeerCount(count) {
  const peerCountEl = document.getElementById('peerCount');
  peerCountEl.textContent = `${count} participant${count !== 1 ? 's' : ''}`;
}

function updateVideoButton(enabled) {
  const btn = document.getElementById('toggleVideoBtn');
  const label = btn.querySelector('.label');
  
  if (enabled) {
    btn.classList.remove('muted');
    label.textContent = 'Video On';
  } else {
    btn.classList.add('muted');
    label.textContent = 'Video Off';
  }
}

function updateAudioButton(enabled) {
  const btn = document.getElementById('toggleAudioBtn');
  const label = btn.querySelector('.label');
  
  if (enabled) {
    btn.classList.remove('muted');
    label.textContent = 'Audio On';
  } else {
    btn.classList.add('muted');
    label.textContent = 'Audio Off';
  }
}

function showLoading(text) {
  document.getElementById('loadingOverlay').style.display = 'flex';
  document.getElementById('loadingText').textContent = text;
}

function hideLoading() {
  document.getElementById('loadingOverlay').style.display = 'none';
}

function showNotification(message, type = 'info') {
  // Simple console notification for now
  // In production, you'd use a toast library
  const prefix = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '❌'
  }[type] || 'ℹ️';
  
  console.log(`${prefix} ${message}`);
}

function updateDebugInfo() {
  const debugInfo = {
    peerId: state.peerId,
    roomId: state.roomId,
    device: state.device ? 'loaded' : 'not loaded',
    sendTransport: state.sendTransport ? 'connected' : 'not connected',
    recvTransport: state.recvTransport ? 'connected' : 'not connected',
    producers: Array.from(state.producers.keys()),
    consumers: state.consumers.size,
    remotePeers: state.remotePeers.size
  };
  
  document.getElementById('debugInfo').textContent = JSON.stringify(debugInfo, null, 2);
}

