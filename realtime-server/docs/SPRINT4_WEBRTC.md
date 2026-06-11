# Sprint 4 — WebRTC + PeerJS + ExpressTURN (TS-03, US-09, US-12)

## Arquitectura

```
Frontend (Browser A)              Realtime Server (port 3002)           Frontend (Browser B)
        |                                   |                                    |
        |-- Socket.io: join_room ---------->|                                    |
        |<-- room_joined (participantes) ---|                                    |
        |                                  |                                    |
        |-- Socket.io: get_ice_servers ---->|                                    |
        |<-- ice_servers (STUN + TURN) -----|                                    |
        |                                  |                                    |
        |  new Peer(id, { path:'/peerjs'})|                                    |
        |-- PeerJS handshake -------------->| PeerJS Server (/peerjs)            |
        |<-- peerId asignado ---------------|                                    |
        |                                  |                                    |
        |-- Socket.io: register_peer ------>|                                    |
        |                                  |-- peer_registered ---------------->|
        |                                  |                                    |
        |<-------------- peer.call(peerIdA) via PeerJS + TURN ----------------->|
        |    WebRTC P2P (audio/video stream directo browser a browser)           |
```

## Flujo de integración para el Frontend

### 1. Obtener ICE servers (STUN + ExpressTURN)

```typescript
socket.emit('get_ice_servers');
socket.on('ice_servers', ({ iceServers }) => {
  initPeer(iceServers);
});
// O bien via HTTP (antes de conectar el socket):
// GET http://localhost:3002/ice-servers
```

### 2. Unirse a la sala

```typescript
socket.emit('join_room', {
  roomId: 'abc123',
  token: firebaseIdToken,
});
socket.on('room_joined', ({ participants }) => {
  // participants[].peerId contiene el PeerJS ID de cada usuario ya conectado
});
```

### 3. Inicializar PeerJS

```typescript
import Peer from 'peerjs';

function initPeer(iceServers: RTCIceServer[]) {
  const peer = new Peer(undefined, {
    host: 'localhost', // tu dominio en produccion
    port: 3002,
    path: '/peerjs',
    secure: false,     // true en produccion con HTTPS
    config: { iceServers },
  });

  peer.on('open', (peerId) => {
    socket.emit('register_peer', { roomId, peerId });
  });

  // Recibir llamadas entrantes
  peer.on('call', (call) => {
    call.answer(localStream);
    call.on('stream', (remoteStream) => {
      addVideoToGrid(call.peer, remoteStream); // US-09
    });
  });
}
```

### 4. Llamar a nuevos participantes

```typescript
socket.on('peer_registered', ({ uid, peerId }) => {
  if (uid === myUid) return;
  const call = peer.call(peerId, localStream);
  call.on('stream', (remoteStream) => {
    addVideoToGrid(peerId, remoteStream);
  });
});
```

### 5. Cuando alguien sale

```typescript
socket.on('participant_left', ({ uid, peerId }) => {
  removeVideoFromGrid(peerId); // US-09: quitar del grid
});
```

### 6. Estados de media (US-09)

```typescript
socket.emit('media_state_change', { roomId, isMuted: true, isCameraOff: false });
socket.on('media_state_update', ({ uid, isMuted, isCameraOff }) => {
  updateParticipantStatus(uid, { isMuted, isCameraOff });
});
```

## Variables de entorno (.env)

| Variable           | Descripcion                          | Ejemplo                            |
|--------------------|--------------------------------------|------------------------------------|
| PORT               | Puerto del servidor                  | 3002                               |
| PEERJS_PATH        | Ruta del PeerJS server               | /peerjs                            |
| TURN_URL           | URL del servidor TURN (ExpressTURN)  | turn:relay1.expressturn.com:3480   |
| TURN_USERNAME      | Usuario ExpressTURN                  | efxxxxxxxxxxxxxxxxxx               |
| TURN_CREDENTIAL    | Password ExpressTURN                 | xxxxxxxxxxxxxxxxxxx                |

### Registro en ExpressTURN
1. Ir a https://www.expressturn.com
2. Crear cuenta gratuita (1 GB/mes, suficiente para demos)
3. Copiar TURN URL, Username y Password al .env

## Endpoints HTTP nuevos

| Metodo | Ruta           | Descripcion                                      |
|--------|----------------|--------------------------------------------------|
| GET    | /health        | Estado del servidor (incluye turnConfigured)     |
| GET    | /ice-servers   | Devuelve { iceServers } con STUN + TURN          |
| GET    | /peerjs/*      | PeerJS signaling server                          |

## Eventos Socket.io nuevos

### Cliente a Servidor

| Evento            | Payload               | Descripcion                       |
|-------------------|-----------------------|-----------------------------------|
| get_ice_servers   | (ninguno)             | Solicita config ICE               |
| register_peer     | { roomId, peerId }    | Registra el PeerJS ID del usuario |

### Servidor a Cliente

| Evento           | Payload                                                                    | Descripcion                        |
|------------------|----------------------------------------------------------------------------|------------------------------------|
| ice_servers      | { iceServers: RTCIceServer[] }                                             | Config ICE para PeerJS/WebRTC      |
| peer_registered  | { uid, peerId, socketId, displayName, photoURL, isMuted, isCameraOff }    | Nuevo peer listo para ser llamado  |

### Cambios en eventos existentes

| Evento              | Cambio                                                |
|---------------------|-------------------------------------------------------|
| join_room           | Acepta peerId?: string opcional                       |
| room_joined         | participants[] incluye peerId: string or null         |
| participant_joined  | user incluye peerId: string or null                   |
| participant_left    | Ahora incluye peerId: string or null                  |