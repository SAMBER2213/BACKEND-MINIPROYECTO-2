/**
 * Tipos compartidos para el servidor de tiempo real.
 */

export interface UserInfo {
  uid: string;
  displayName: string;
  photoURL: string | null;
  socketId: string;
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
  token: string;    // Firebase ID Token para autenticar
  roomCode?: string; // Requerido si la sala es privada
}

export interface SendMessagePayload {
  roomId: string;
  text: string;
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

// ─── Socket Events (Server → Client) ─────────────────────────────

export interface ParticipantJoinedPayload {
  user: UserInfo;
  participants: UserInfo[];
}

export interface ParticipantLeftPayload {
  uid: string;
  socketId: string;
  displayName: string;
}

export interface NewMessagePayload {
  id: string;
  roomId: string;
  senderUid: string;
  senderName: string;
  senderPhotoURL: string | null;
  text: string;
  createdAt: string;
}

export interface MediaStateUpdatePayload {
  uid: string;
  isMuted: boolean;
  isCameraOff: boolean;
  isSharingScreen?: boolean;
}