# mediasoup Video Conference - POC

A proof-of-concept video conference application built with **mediasoup** as the SFU (Selective Forwarding Unit), Node.js, and vanilla JavaScript.

## 📋 Table of Contents

- [Architecture Overview](#architecture-overview)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Running the Application](#running-the-application)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [How It Works](#how-it-works)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)

## 🏗️ Architecture Overview

This application uses the **mediasoup SFU** architecture:

```
┌─────────────┐         WebSocket          ┌─────────────┐
│   Browser   │◄─────── Signaling ────────►│   Server    │
│   Client    │                             │  (Node.js)  │
│             │         WebRTC              │             │
│  mediasoup  │◄─────── Media Flow ────────►│  mediasoup  │
│   -client   │                             │   Worker    │
└─────────────┘                             └─────────────┘
```

### Components:

1. **Server (server.js)**
   - Creates mediasoup workers and routers
   - Manages WebRTC transports
   - Handles WebSocket signaling
   - Routes media between participants

2. **Client (client.js)**
   - Connects via WebSocket for signaling
   - Uses mediasoup-client for WebRTC
   - Captures local camera/microphone
   - Displays remote participant streams

3. **Configuration (config.js)**
   - mediasoup settings (codecs, ports, etc.)
   - Server settings (IP, port)

## ✨ Features

- ✅ Real-time video and audio streaming
- ✅ Multiple participants support
- ✅ Room-based conferences
- ✅ Video/Audio toggle controls
- ✅ Automatic peer discovery
- ✅ Clean, responsive UI
- ✅ Debug mode for development
- ✅ VP8 and H264 video codec support
- ✅ Opus audio codec

## 📦 Prerequisites

- **Node.js**: Version 16+ (Node.js 22+ recommended for latest mediasoup)
- **npm**: Version 8+
- **Modern browser**: Chrome, Firefox, Safari, or Edge with WebRTC support
- **Camera and microphone**: For video conferencing

## 🚀 Installation

1. **Clone or navigate to the project directory:**
   ```bash
   cd /home/anif/workspace/mediasoup2/mediasoup
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

   This will install:
   - `mediasoup`: SFU library
   - `mediasoup-client`: Client-side WebRTC library
   - `express`: Web server
   - `ws`: WebSocket library
   - `esbuild`: JavaScript bundler

3. **Build the client bundle:**
   ```bash
   npm run build
   ```

   This bundles the client-side JavaScript with mediasoup-client into a single file.

## ▶️ Running the Application

### Build and Start

**First time setup:**
```bash
# Build the client bundle
npm run build

# Start the server
npm start
```

**For development with auto-rebuild:**

Open two terminal windows:

**Terminal 1 - Watch and rebuild client:**
```bash
npm run build:watch
```

**Terminal 2 - Run server with auto-restart:**
```bash
npm run dev
```

You should see output like:
```
============================================================
Starting mediasoup Video Conference Server
============================================================
[Server] Creating mediasoup Worker...
[Server] mediasoup Worker created (pid: 12345)
[Server] Creating mediasoup Router...
[Server] mediasoup Router created (id: abc123...)
[WebSocket] Server initialized
============================================================
[Server] HTTP server listening on http://0.0.0.0:3000
[Server] Open http://localhost:3000 in your browser
============================================================
```

### Access the Application

Open your browser and navigate to:
```
http://localhost:3000
```

## 🧪 Testing

### Test with Multiple Participants

1. **First participant:**
   - Open `http://localhost:3000`
   - Enter a room name (e.g., "test-room")
   - Click "Join Room"
   - Allow camera/microphone permissions

2. **Second participant:**
   - Open a new browser window/tab (or different browser)
   - Go to `http://localhost:3000`
   - Enter the SAME room name ("test-room")
   - Click "Join Room"
   - Allow camera/microphone permissions

3. **Verify:**
   - Both participants should see each other's video
   - Audio should work bidirectionally
   - Peer count should show "2 participants"

### Test Multiple Rooms

- Open multiple browser windows
- Join different room names
- Verify that participants in different rooms don't see each other

### Test Media Controls

- Toggle video on/off using the "Video On/Off" button
- Toggle audio on/off using the "Audio On/Off" button
- Click "Leave" to exit the room

## 📁 Project Structure

```
mediasoup/
├── server.js           # Main server file with mediasoup setup
├── config.js           # Configuration (ports, codecs, IPs)
├── package.json        # Dependencies and scripts
├── README.md          # This file
└── public/            # Client-side files
    ├── index.html     # Main HTML interface
    ├── styles.css     # CSS styling
    └── client.js      # Client-side WebRTC logic
```

## 🔧 How It Works

### Connection Flow

1. **Client connects to server via WebSocket**
   - Server assigns unique peer ID

2. **Client requests router capabilities**
   - Server sends supported codecs
   - Client creates mediasoup Device

3. **Client requests to join room**
   - Server adds peer to room
   - Returns list of existing peers

4. **Client creates send transport**
   - For sending camera/microphone
   - Client produces video and audio

5. **Client creates receive transport**
   - For receiving media from others

6. **When new peer joins:**
   - Existing peers are notified
   - They request to consume new peer's media
   - New peer requests to consume existing peers' media

### Key Concepts

**Worker**: A mediasoup process that handles media routing (CPU-intensive tasks)

**Router**: Routes media between transports, configured with supported codecs

**Transport**: WebRTC connection for sending OR receiving media
- Each peer has 2 transports: send and receive

**Producer**: Represents outgoing media stream (your camera/mic)

**Consumer**: Represents incoming media stream (from other participants)

## ⚙️ Configuration

Edit `config.js` to customize:

### Change Server Port
```javascript
httpServer: {
  listenPort: 3000  // Change to desired port
}
```

### Change IP Address
```javascript
webRtcTransport: {
  listenIps: [
    {
      ip: '0.0.0.0',
      announcedIp: '127.0.0.1'  // Change for LAN/WAN access
    }
  ]
}
```

**For LAN access:**
- Set `announcedIp` to your local IP (e.g., `192.168.1.100`)
- Access from other devices: `http://192.168.1.100:3000`

**For production/VPS:**
- Set `announcedIp` to your public IP
- Configure firewall to allow UDP ports 10000-10100

### Adjust RTC Port Range
```javascript
worker: {
  rtcMinPort: 10000,  // Start of port range
  rtcMaxPort: 10100   // End of port range
}
```

## 🔍 Troubleshooting

### Issue: Cannot connect to server

**Solution:**
- Check if server is running (`npm start`)
- Verify port 3000 is not in use
- Check firewall settings

### Issue: No video/audio

**Solution:**
- Grant camera/microphone permissions in browser
- Check if device is not in use by another application
- Try reloading the page
- Check browser console for errors

### Issue: Peers cannot see each other

**Solution:**
- Ensure both peers are in the SAME room
- Check WebSocket connection (green "Connected" status)
- Open browser DevTools and check console for errors
- Enable debug mode to see detailed information

### Issue: Connection works locally but not on LAN

**Solution:**
- Update `announcedIp` in `config.js` to your local IP
- Ensure firewall allows:
  - TCP port 3000 (HTTP/WebSocket)
  - UDP ports 10000-10100 (RTC)

### Issue: High CPU usage

**Solution:**
- Reduce video resolution in `client.js`
- Increase `numWorkers` in `config.js`
- Limit number of participants

## 🎓 Learning Resources

### mediasoup Documentation
- [Official Docs](https://mediasoup.org/documentation/)
- [API Reference](https://mediasoup.org/documentation/v3/mediasoup/api/)

### WebRTC Concepts
- [WebRTC for Beginners](https://webrtc.org/getting-started/overview)
- [SFU vs MCU](https://bloggeek.me/webrtc-multiparty-video-alternatives/)

## 🛠️ Development Tips

### Enable Debug Mode
Click "Toggle Debug" button in the footer to see:
- Peer ID
- Room ID
- Transport status
- Producer/Consumer counts

### Browser Console
Open DevTools (F12) and check Console tab for detailed logs:
- `[Client]` - Client-side events
- `[Server]` - Server-side events (in terminal)

### Monitor Server Resources
Server logs worker resource usage every 30 seconds

## 📝 Future Enhancements

Possible improvements for production:
- [ ] User authentication
- [ ] Screen sharing
- [ ] Recording functionality
- [ ] Chat messaging
- [ ] Bandwidth adaptation
- [ ] Simulcast support
- [ ] Layout controls (grid/spotlight)
- [ ] Virtual backgrounds
- [ ] Noise suppression
- [ ] Statistics dashboard

## 📄 License

ISC

## 👨‍💻 Author

Created as a POC for learning mediasoup and WebRTC SFU architecture.

---

**Happy conferencing! 🎥**

