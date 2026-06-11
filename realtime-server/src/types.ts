/**
 * Tipos compartidos para el servidor de tiempo real.
 */

export interface UserInfo {
  uid: string;
  displayName: string;
  photoURL: string | null;
  socketId: string;
  peerId: string | null;    // ← Sprint 4: PeerJS peer ID del usuario
  isMuted: boolean;
  isCameraOff: boolean;
  isSharingScreen: boolean;
}

export interface RoomState {
  roomId: string;
  participants: Map<string, UserInfo>; // uid -> UserInfo
}

// ─── Socket Events (Client → Server) ─────────────────────────────

export interface JoinRoomPayload {
  roomId: string;
  token: string;     // Firebase ID Token para autenticar
  roomCode?: string; // Requerido si la sala es privada
  peerId?: string;   // ← Sprint 4: PeerJS peer ID del usuario
}

export interface SendMessagePayload {
  roomId: string;
  text: string;
  clientMessageId?: string;
}

export interface MediaStatePayload {
  roomId: string;
  isMuted: boolean;
  isCameraOff: boolean;
}

export interface ScreenSharePayload {
  roomId: string;
  isSharingScreen: boolean;
}

// ─── WebRTC Signaling Payloads ────────────────────────────────────

export interface WebRTCOfferPayload {
  roomId: string;
  targetSocketId: string;
  sdp: RTCSessionDescriptionInit;
}

export interface WebRTCAnswerPayload {
  roomId: string;
  targetSocketId: string;
  sdp: RTCSessionDescriptionInit;
}

export interface WebRTCIceCandidatePayload {
  roomId: string;
  targetSocketId: string;
  candidate: RTCIceCandidateInit;
}

// ─── Sprint 4: PeerJS Payloads ────────────────────────────────────

/** Enviado por el cliente para registrar su peerId una vez conectado al PeerJS server */
export interface RegisterPeerPayload {
  roomId: string;
  peerId: string;
}

/** El servidor notifica a todos en la sala que hay un nuevo peer disponible */
export interface PeerJoinedPayload {
  uid: string;
  displayName: string;
  photoURL: string | null;
  peerId: string;
  socketId: string;
  isMuted: boolean;
  isCameraOff: boolean;
}

// ─── Socket Events (Server → Client) ─────────────────────────────

export interface ParticipantJoinedPayload {
  user: UserInfo;
  participants: UserInfo[];
}

export interface ParticipantLeftPayload {
  uid: string;
  socketId: string;
  displayName: string;
  peerId: string | null;  // ← Sprint 4: para que el frontend cierre la conexión P2P
}

export interface NewMessagePayload {
  id: string;
  clientMessageId?: string;
  roomId: string;
  senderUid: string;
  senderName: string;
  senderPhotoURL: string | null;
  text: string;
  createdAt: string;
  persistedAt: string;
  storagePath: string;
}

export interface MediaStateUpdatePayload {
  uid: string;
  isMuted: boolean;
  isCameraOff: boolean;
  isSharingScreen?: boolean;
}

// ─── Sprint 4: ICE / TURN Config ────────────────────────────────
/** Enviado al cliente para que construya su RTCPeerConnection con TURN */
export interface IceServersPayload {
  iceServers: RTCIceServer[];
}