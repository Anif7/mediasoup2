# mediasoup Video Conference - POC

A proof-of-concept video conference application built with **mediasoup** as the SFU (Selective Forwarding Unit).

## 📦 Prerequisites

- **Node.js**: Version 22+ 
- **Modern browser**: Chrome, Firefox, Safari, or Edge
- **Camera and microphone**

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Build Client
```bash
npm run build
```

### 3. Start Server
```bash
npm start
```

### 4. Open Browser
```
http://localhost:3000
```

## 🧪 Testing

### Test with 2+ Participants

1. Open `http://localhost:3000` in first browser tab
2. Enter a room name (e.g., "room1")
3. Click "Join Room" and allow camera/microphone
4. Open a new tab/window
5. Enter the **same room name** ("room1")
6. Click "Join Room"
7. Both participants should see each other

## 📁 Project Structure

```
mediasoup/
├── server.js              # Server with mediasoup
├── config.js              # Configuration
├── package.json           # Dependencies
├── COMPLETE_GUIDE.md      # Full documentation
├── README.md              # This file
└── public/
    ├── index.html         # UI
    ├── styles.css         # Styles
    ├── client.js          # Client logic
    └── bundle.js          # Built bundle (generated)
```

## 🔧 Configuration

Edit `config.js` to change:
- Server port (default: 3000)
- RTC port range (default: 10000-10100)
- IP addresses

### For LAN Access
In `config.js`, set `announcedIp` to your local IP:
```javascript
webRtcTransport: {
  listenIps: [
    { ip: '0.0.0.0', announcedIp: '192.168.1.100' }  // Your local IP
  ]
}
```

Access from other devices: `http://192.168.1.100:3000`

## 🔍 Common Issues

### No video/audio?
- Grant camera/microphone permissions
- Reload the page
- Check browser console for errors

### Peers can't see each other?
- Ensure same room name
- Check "Connected" status (should be green)
- Refresh both browsers

### Connection works locally but not on LAN?
- Update `announcedIp` in `config.js` to your local IP
- Allow TCP port 3000 and UDP ports 10000-10100 in firewall

### Node.js version error?
- Install Node.js 22+ using NVM
- Run `node --version` to verify

## 📖 Documentation

### For Complete Understanding:
Read **COMPLETE_GUIDE.md** - it explains:
- What is mediasoup and SFU?
- How the entire application works
- Server and client code explained
- All concepts from beginner to advanced

### Quick Commands:
```bash
npm run build         # Build client once
npm run build:watch   # Auto-rebuild on changes
npm start             # Start server
npm run dev           # Start with auto-restart
```

## 📝 Scripts

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npm run build` | Build client bundle |
| `npm run build:watch` | Build + watch for changes |
| `npm start` | Start server |
| `npm run dev` | Start with nodemon (auto-restart) |

---

**📚 For detailed explanations, read COMPLETE_GUIDE.md**

**Happy conferencing! 🎥**
