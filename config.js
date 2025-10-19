/**
 * mediasoup Configuration
 * This file contains all the configuration needed for mediasoup SFU
 */

module.exports = {
  // HTTP server configuration
  httpServer: {
    listenIp: '0.0.0.0',
    listenPort: 3000
  },

  // mediasoup Worker settings
  // Workers are mediasoup processes that handle media routing
  mediasoup: {
    // Number of worker processes to spawn
    // Each worker runs in a separate CPU core for better performance
    numWorkers: 1, // For local POC, 1 is enough
    
    worker: {
      // RTC ports range for WebRTC connections
      // Each transport will use a port from this range
      rtcMinPort: 10000,
      rtcMaxPort: 10100,
      
      // Log level for debugging
      logLevel: 'warn',
      logTags: [
        'info',
        'ice',
        'dtls',
        'rtp',
        'srtp',
        'rtcp'
      ]
    },

    // Router settings
    // Router manages media streams between participants
    router: {
      // Media codecs that the router will handle
      mediaCodecs: [
        {
          kind: 'audio',
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2
        },
        {
          kind: 'video',
          mimeType: 'video/VP8',
          clockRate: 90000,
          parameters: {
            'x-google-start-bitrate': 1000
          }
        },
        {
          kind: 'video',
          mimeType: 'video/H264',
          clockRate: 90000,
          parameters: {
            'packetization-mode': 1,
            'profile-level-id': '42e01f',
            'level-asymmetry-allowed': 1
          }
        }
      ]
    },

    // WebRTC Transport settings
    // These are the settings for the WebRTC transports (send and receive)
    webRtcTransport: {
      // Listen IPs for WebRTC connections
      listenIps: [
        {
          ip: '0.0.0.0',
          // Important: Set this to your local IP for local testing
          // For production, use your server's public IP
          announcedIp: '127.0.0.1' // Change to your local IP if needed
        }
      ],
      
      // Enable UDP (better performance)
      enableUdp: true,
      
      // Enable TCP as fallback
      enableTcp: true,
      
      // Prefer UDP over TCP
      preferUdp: true,
      
      // Initial available outgoing bitrate
      initialAvailableOutgoingBitrate: 1000000,
      
      // Minimum and maximum outgoing bitrate
      minimumAvailableOutgoingBitrate: 600000,
      maxIncomingBitrate: 1500000
    }
  }
};

