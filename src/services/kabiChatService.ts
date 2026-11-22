import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  getDoc,
  getDocs,
  where,
  writeBatch,
  increment,
} from 'firebase/firestore';
import { auth, db } from '../firebase';

export enum KabiOperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface KabiFirestoreErrorInfo {
  error: string;
  operationType: KabiOperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleKabiFirestoreError(
  error: unknown,
  operationType: KabiOperationType,
  path: string | null
): void {
  const errInfo: KabiFirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid ?? null,
      email: auth?.currentUser?.email ?? null,
      emailVerified: auth?.currentUser?.emailVerified ?? null,
      isAnonymous: auth?.currentUser?.isAnonymous ?? null,
      tenantId: auth?.currentUser?.tenantId ?? null,
      providerInfo:
        auth?.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('KabiTech SMS Firestore Error:', JSON.stringify(errInfo));
}

export const ADMIN_PARTICIPANT_ID = 'admin';

export interface KabiParticipant {
  id: string;
  name: string;
  phone?: string;
  role: 'admin' | 'rider' | 'staff';
  riderDocId?: string;
}

export interface KabiChat {
  id: string;
  hubId: string;
  type: 'direct' | 'group';
  name: string;
  description?: string;
  avatarColor?: string;
  createdBy: string;
  createdByName: string;
  adminIds: string[];
  participantIds: string[];
  participantProfiles: Record<string, KabiParticipant>;
  lastMessageText: string;
  lastMessageType: 'text' | 'image' | 'video' | 'audio' | 'system';
  lastMessageAt: number;
  lastMessageSenderId: string;
  lastMessageSenderName: string;
  unreadCounts: Record<string, number>;
  pinnedBy?: Record<string, boolean>;
  mutedBy?: Record<string, boolean>;
  typing?: Record<string, { name: string; at: number }>;
  createdAt: number;
  updatedAt: number;
}

export interface KabiReplyPreview {
  id: string;
  senderName: string;
  text: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'system';
}

export interface KabiMessage {
  id: string;
  chatId: string;
  hubId: string;
  senderId: string;
  senderName: string;
  senderRole: 'admin' | 'rider' | 'staff';
  text: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'system';
  imageDataUrl?: string;
  videoDataUrl?: string;
  videoDurationSec?: number;
  audioDataUrl?: string;
  audioDurationSec?: number;
  originalSizeBytes?: number;
  compressedSizeBytes?: number;
  replyTo?: KabiReplyPreview | null;
  forwarded?: boolean;
  reactions?: Record<string, string>;
  readBy: Record<string, number>;
  starredBy?: Record<string, boolean>;
  deletedFor?: Record<string, boolean>;
  deletedForEveryone?: boolean;
  createdAt: number;
  editedAt?: number;
}

export interface KabiPresence {
  participantId: string;
  name: string;
  role: 'admin' | 'rider' | 'staff';
  online: boolean;
  lastSeenAt: number;
}

export interface KabiStatusItem {
  id: string;
  hubId: string;
  authorId: string;
  authorName: string;
  authorRole: 'admin' | 'rider' | 'staff';
  text: string;
  bgColor: string;
  imageDataUrl?: string;
  viewedBy: Record<string, number>;
  createdAt: number;
  expiresAt: number;
}

/**
 * Canonical Rider Participant ID shared across Main Admin App and Rider Companion App.
 * Uses normalized last-10-digits phone when available so Admin & Rider always map to the exact same chat ID.
 */
export function getRiderChatParticipantId(phone?: string, fallbackId?: string): string {
  const digits = (phone || '').replace(/\D/g, '').slice(-10);
  if (digits.length === 10) {
    return `rider_${digits}`;
  }
  const safeFallback = (fallbackId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '');
  return `rider_${safeFallback || 'unknown'}`;
}

export function getDirectChatId(participantA: string, participantB: string): string {
  const sorted = [participantA, participantB].sort();
  return `dm__${sorted[0]}__${sorted[1]}`;
}

const AVATAR_PALETTE = [
  '#008069',
  '#0284c7',
  '#7c3aed',
  '#b45309',
  '#be123c',
  '#0f766e',
  '#4338ca',
  '#15803d',
];

export function pickAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

export function getChatDisplayTitle(chat: KabiChat, myId: string): string {
  if (chat.type === 'group') {
    return chat.name || 'हब ग्रुप';
  }
  const otherId = chat.participantIds.find((id) => id !== myId) || chat.participantIds[0];
  const otherProfile = otherId ? chat.participantProfiles?.[otherId] : undefined;
  if (otherProfile?.name) return otherProfile.name;
  if (otherId === ADMIN_PARTICIPANT_ID) return 'हब एडमिन';
  return chat.name || 'राइडर';
}

export function getDirectPeerProfile(chat: KabiChat, myId: string): KabiParticipant | null {
  if (chat.type !== 'direct') return null;
  const otherId = chat.participantIds.find((id) => id !== myId);
  if (!otherId) return null;
  return chat.participantProfiles?.[otherId] || {
    id: otherId,
    name: otherId === ADMIN_PARTICIPANT_ID ? 'हब एडमिन' : 'राइडर',
    role: otherId === ADMIN_PARTICIPANT_ID ? 'admin' : 'rider',
  };
}

export function getMonitorChatPairTitle(chat: KabiChat): string {
  if (chat.type === 'group') {
    return `ग्रुप: ${chat.name || 'हब ग्रुप'} (${chat.participantIds.length} सदस्य)`;
  }
  const names = chat.participantIds.map((pid) => {
    const prof = chat.participantProfiles?.[pid];
    if (prof?.name) return prof.name;
    return pid === ADMIN_PARTICIPANT_ID ? 'हब एडमिन' : pid.replace(/^rider_/, '');
  });
  if (names.length >= 2) {
    return `${names[0]} ↔ ${names[1]}`;
  }
  return names[0] || 'चैट';
}

/**
 * Subscribe to ALL chats in a Hub in real time (0s sync).
 */
export function subscribeToHubChats(
  hubId: string,
  onUpdate: (chats: KabiChat[]) => void
): () => void {
  if (!hubId || !db) {
    onUpdate([]);
    return () => {};
  }
  const path = `hubs/${hubId}/kabi_chats`;
  const q = query(collection(db, path), orderBy('lastMessageAt', 'desc'), limit(150));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: KabiChat[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as KabiChat;
        if (data) {
          list.push({ ...data, id: docSnap.id });
        }
      });
      onUpdate(list);
    },
    (err) => {
      handleKabiFirestoreError(err, KabiOperationType.LIST, path);
    }
  );
}

/**
 * Subscribe to real-time messages inside a specific chat room.
 */
export function subscribeToChatMessages(
  hubId: string,
  chatId: string,
  onUpdate: (messages: KabiMessage[]) => void
): () => void {
  if (!hubId || !chatId || !db) {
    onUpdate([]);
    return () => {};
  }
  const path = `hubs/${hubId}/kabi_chats/${chatId}/messages`;
  const q = query(collection(db, path), orderBy('createdAt', 'desc'), limit(250));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: KabiMessage[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as KabiMessage;
        if (data) {
          list.push({ ...data, id: docSnap.id });
        }
      });
      list.reverse(); // chronological oldest -> newest
      onUpdate(list);
    },
    (err) => {
      handleKabiFirestoreError(err, KabiOperationType.LIST, path);
    }
  );
}

/**
 * Subscribe to real-time online/last-seen presence across a Hub.
 */
export function subscribeToHubPresence(
  hubId: string,
  onUpdate: (presenceMap: Record<string, KabiPresence>) => void
): () => void {
  if (!hubId || !db) {
    onUpdate({});
    return () => {};
  }
  const path = `hubs/${hubId}/kabi_presence`;
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const map: Record<string, KabiPresence> = {};
      snapshot.forEach((docSnap) => {
        const d = docSnap.data() as KabiPresence;
        if (d) map[docSnap.id] = { ...d, participantId: docSnap.id };
      });
      onUpdate(map);
    },
    (err) => {
      handleKabiFirestoreError(err, KabiOperationType.LIST, path);
    }
  );
}

/**
 * Update my online/offline heartbeat in the hub.
 */
export async function updateMyPresence(
  hubId: string,
  me: KabiParticipant,
  online: boolean
): Promise<void> {
  if (!hubId || !me?.id || !db) return;
  const path = `hubs/${hubId}/kabi_presence/${me.id}`;
  try {
    await setDoc(
      doc(db, path),
      {
        participantId: me.id,
        name: me.name.slice(0, 120),
        role: me.role,
        online,
        lastSeenAt: Date.now(),
      },
      { merge: true }
    );
  } catch (err) {
    handleKabiFirestoreError(err, KabiOperationType.WRITE, path);
  }
}

/**
 * Get or create a deterministic 1-on-1 direct chat between two hub participants.
 */
export async function getOrCreateDirectChat(
  hubId: string,
  me: KabiParticipant,
  peer: KabiParticipant
): Promise<KabiChat> {
  const chatId = getDirectChatId(me.id, peer.id);
  const path = `hubs/${hubId}/kabi_chats/${chatId}`;
  const chatRef = doc(db, path);
  const now = Date.now();

  try {
    const snap = await getDoc(chatRef);
    if (snap.exists()) {
      const existing = snap.data() as KabiChat;
      // Refresh participant names cleanly
      const updatedProfiles: Record<string, KabiParticipant> = {
        ...(existing.participantProfiles || {}),
        [me.id]: {
          id: me.id,
          name: me.name.slice(0, 100),
          phone: me.phone || existing.participantProfiles?.[me.id]?.phone || '',
          role: me.role,
        },
        [peer.id]: {
          id: peer.id,
          name: peer.name.slice(0, 100),
          phone: peer.phone || existing.participantProfiles?.[peer.id]?.phone || '',
          role: peer.role,
        },
      };
      await updateDoc(chatRef, {
        participantProfiles: updatedProfiles,
      }).catch(() => {});
      return { ...existing, id: chatId, participantProfiles: updatedProfiles };
    }

    const newChat: KabiChat = {
      id: chatId,
      hubId,
      type: 'direct',
      name: '',
      avatarColor: pickAvatarColor(peer.id),
      createdBy: me.id,
      createdByName: me.name.slice(0, 100),
      adminIds: [ADMIN_PARTICIPANT_ID],
      participantIds: [me.id, peer.id],
      participantProfiles: {
        [me.id]: { id: me.id, name: me.name.slice(0, 100), phone: me.phone || '', role: me.role },
        [peer.id]: { id: peer.id, name: peer.name.slice(0, 100), phone: peer.phone || '', role: peer.role },
      },
      lastMessageText: '',
      lastMessageType: 'text',
      lastMessageAt: now,
      lastMessageSenderId: '',
      lastMessageSenderName: '',
      unreadCounts: {
        [me.id]: 0,
        [peer.id]: 0,
      },
      pinnedBy: {},
      mutedBy: {},
      typing: {},
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(chatRef, newChat);
    return newChat;
  } catch (err) {
    handleKabiFirestoreError(err, KabiOperationType.WRITE, path);
    throw err;
  }
}

/**
 * Create a new WhatsApp-style Hub Group Chat.
 */
export async function createGroupChat(params: {
  hubId: string;
  creator: KabiParticipant;
  groupName: string;
  description?: string;
  members: KabiParticipant[];
}): Promise<KabiChat> {
  const { hubId, creator, groupName, description = '', members } = params;
  const now = Date.now();
  const chatId = `grp_${now}_${Math.random().toString(36).slice(2, 8)}`;
  const path = `hubs/${hubId}/kabi_chats/${chatId}`;

  const uniqueMap: Record<string, KabiParticipant> = {};
  uniqueMap[creator.id] = {
    id: creator.id,
    name: creator.name.slice(0, 100),
    phone: creator.phone || '',
    role: creator.role,
  };
  for (const m of members) {
    if (!m?.id) continue;
    uniqueMap[m.id] = {
      id: m.id,
      name: m.name.slice(0, 100),
      phone: m.phone || '',
      role: m.role,
    };
  }

  const participantIds = Object.keys(uniqueMap).slice(0, 200);
  const unreadCounts: Record<string, number> = {};
  for (const pid of participantIds) {
    unreadCounts[pid] = pid === creator.id ? 0 : 1;
  }

  const adminIds = Array.from(new Set([creator.id, ADMIN_PARTICIPANT_ID]));
  const systemText = `${creator.name} ने ग्रुप "${groupName.trim()}" बनाया`;

  const newGroup: KabiChat = {
    id: chatId,
    hubId,
    type: 'group',
    name: groupName.trim().slice(0, 120),
    description: description.trim().slice(0, 400),
    avatarColor: pickAvatarColor(chatId),
    createdBy: creator.id,
    createdByName: creator.name.slice(0, 100),
    adminIds,
    participantIds,
    participantProfiles: uniqueMap,
    lastMessageText: systemText,
    lastMessageType: 'system',
    lastMessageAt: now,
    lastMessageSenderId: creator.id,
    lastMessageSenderName: creator.name.slice(0, 100),
    unreadCounts,
    pinnedBy: {},
    mutedBy: {},
    typing: {},
    createdAt: now,
    updatedAt: now,
  };

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, path), newGroup);

    const sysMsgId = `sys_${now}_${Math.random().toString(36).slice(2, 6)}`;
    const sysMsg: KabiMessage = {
      id: sysMsgId,
      chatId,
      hubId,
      senderId: creator.id,
      senderName: creator.name.slice(0, 100),
      senderRole: creator.role,
      text: systemText,
      type: 'system',
      readBy: { [creator.id]: now },
      createdAt: now,
    };
    batch.set(doc(db, `${path}/messages/${sysMsgId}`), sysMsg);
    await batch.commit();
    return newGroup;
  } catch (err) {
    handleKabiFirestoreError(err, KabiOperationType.CREATE, path);
    throw err;
  }
}

/**
 * Send a text, HD photo, compressed video, or audio message into a chat and atomically increment unread counters.
 */
export async function sendChatMessage(params: {
  hubId: string;
  chat: KabiChat;
  sender: KabiParticipant;
  text: string;
  type?: 'text' | 'image' | 'video' | 'audio';
  imageDataUrl?: string;
  videoDataUrl?: string;
  videoDurationSec?: number;
  audioDataUrl?: string;
  audioDurationSec?: number;
  originalSizeBytes?: number;
  compressedSizeBytes?: number;
  replyTo?: KabiReplyPreview | null;
  forwarded?: boolean;
}): Promise<KabiMessage> {
  const {
    hubId,
    chat,
    sender,
    text,
    type = 'text',
    imageDataUrl,
    videoDataUrl,
    videoDurationSec,
    audioDataUrl,
    audioDurationSec,
    originalSizeBytes,
    compressedSizeBytes,
    replyTo = null,
    forwarded = false,
  } = params;

  const now = Date.now();
  const msgId = `msg_${now}_${Math.random().toString(36).slice(2, 8)}`;
  const safeText = text.trim().slice(0, 3900);
  const chatPath = `hubs/${hubId}/kabi_chats/${chat.id}`;
  const msgPath = `${chatPath}/messages/${msgId}`;

  const msg: KabiMessage = {
    id: msgId,
    chatId: chat.id,
    hubId,
    senderId: sender.id,
    senderName: sender.name.slice(0, 100),
    senderRole: sender.role,
    text: safeText,
    type,
    ...(imageDataUrl ? { imageDataUrl } : {}),
    ...(videoDataUrl ? { videoDataUrl, videoDurationSec: videoDurationSec || 1 } : {}),
    ...(audioDataUrl ? { audioDataUrl, audioDurationSec: audioDurationSec || 1 } : {}),
    ...(originalSizeBytes ? { originalSizeBytes } : {}),
    ...(compressedSizeBytes ? { compressedSizeBytes } : {}),
    ...(replyTo ? { replyTo } : {}),
    ...(forwarded ? { forwarded: true } : {}),
    reactions: {},
    readBy: { [sender.id]: now },
    starredBy: {},
    deletedFor: {},
    deletedForEveryone: false,
    createdAt: now,
  };

  const previewText =
    type === 'image'
      ? safeText
        ? `📷 ${safeText}`
        : '📷 HD फोटो'
      : type === 'video'
      ? safeText
        ? `🎬 ${safeText}`
        : `🎬 वीडियो (${videoDurationSec || 1}s)`
      : type === 'audio'
      ? `🎤 वॉइस मैसेज (${audioDurationSec || 1}s)`
      : safeText;

  const chatUpdates: Record<string, unknown> = {
    hubId,
    lastMessageText: previewText.slice(0, 500),
    lastMessageType: type,
    lastMessageAt: now,
    lastMessageSenderId: sender.id,
    lastMessageSenderName: sender.name.slice(0, 100),
    updatedAt: now,
    [`unreadCounts.${sender.id}`]: 0,
    [`typing.${sender.id}`]: null,
  };

  for (const pid of chat.participantIds) {
    if (pid !== sender.id) {
      chatUpdates[`unreadCounts.${pid}`] = increment(1);
    }
  }

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, msgPath), msg);
    batch.update(doc(db, chatPath), chatUpdates);
    await batch.commit();
    return msg;
  } catch (err) {
    handleKabiFirestoreError(err, KabiOperationType.WRITE, msgPath);
    throw err;
  }
}

/**
 * Send one Bulk Broadcast message into multiple riders' individual 1-on-1 chats at once.
 */
export async function sendBulkBroadcastMessage(params: {
  hubId: string;
  sender: KabiParticipant;
  recipients: KabiParticipant[];
  text: string;
  imageDataUrl?: string;
}): Promise<number> {
  const { hubId, sender, recipients, text, imageDataUrl } = params;
  let sentCount = 0;
  for (const recipient of recipients) {
    if (!recipient?.id || recipient.id === sender.id) continue;
    const chat = await getOrCreateDirectChat(hubId, sender, recipient);
    await sendChatMessage({
      hubId,
      chat,
      sender,
      text,
      type: imageDataUrl ? 'image' : 'text',
      imageDataUrl,
    });
    sentCount++;
  }
  return sentCount;
}

/**
 * Mark a chat as READ by the current participant:
 * 1) Clears unreadCounts[myId] = 0 so badge (1, 2, 3) immediately disappears.
 * 2) Marks unread incoming messages with readBy[myId] = now so sender sees Blue Double Ticks.
 */
export async function markChatAsRead(
  hubId: string,
  chatId: string,
  myId: string,
  messages: KabiMessage[]
): Promise<void> {
  if (!hubId || !chatId || !myId || !db) return;
  const now = Date.now();
  const chatPath = `hubs/${hubId}/kabi_chats/${chatId}`;

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, chatPath), {
      [`unreadCounts.${myId}`]: 0,
    });

    const unreadMsgs = messages
      .filter((m) => m.senderId !== myId && !m.readBy?.[myId])
      .slice(-40);

    for (const m of unreadMsgs) {
      batch.update(doc(db, `${chatPath}/messages/${m.id}`), {
        [`readBy.${myId}`]: now,
      });
    }

    await batch.commit();
  } catch (err) {
    handleKabiFirestoreError(err, KabiOperationType.UPDATE, chatPath);
  }
}

export async function setTypingIndicator(
  hubId: string,
  chatId: string,
  me: KabiParticipant,
  isTyping: boolean
): Promise<void> {
  if (!hubId || !chatId || !me?.id || !db) return;
  const chatPath = `hubs/${hubId}/kabi_chats/${chatId}`;
  try {
    await updateDoc(doc(db, chatPath), {
      [`typing.${me.id}`]: isTyping ? { name: me.name.slice(0, 60), at: Date.now() } : null,
    });
  } catch {
    // Non-critical typing indicator
  }
}

export async function toggleMessageReaction(
  hubId: string,
  chatId: string,
  messageId: string,
  myId: string,
  emoji: string,
  currentEmoji?: string
): Promise<void> {
  const path = `hubs/${hubId}/kabi_chats/${chatId}/messages/${messageId}`;
  try {
    await updateDoc(doc(db, path), {
      [`reactions.${myId}`]: currentEmoji === emoji ? '' : emoji,
    });
  } catch (err) {
    handleKabiFirestoreError(err, KabiOperationType.UPDATE, path);
  }
}

export async function toggleStarMessage(
  hubId: string,
  chatId: string,
  messageId: string,
  myId: string,
  isCurrentlyStarred: boolean
): Promise<void> {
  const path = `hubs/${hubId}/kabi_chats/${chatId}/messages/${messageId}`;
  try {
    await updateDoc(doc(db, path), {
      [`starredBy.${myId}`]: !isCurrentlyStarred,
    });
  } catch (err) {
    handleKabiFirestoreError(err, KabiOperationType.UPDATE, path);
  }
}

export async function editChatMessage(
  hubId: string,
  chatId: string,
  messageId: string,
  newText: string
): Promise<void> {
  const path = `hubs/${hubId}/kabi_chats/${chatId}/messages/${messageId}`;
  try {
    await updateDoc(doc(db, path), {
      text: newText.trim().slice(0, 3900),
      editedAt: Date.now(),
    });
  } catch (err) {
    handleKabiFirestoreError(err, KabiOperationType.UPDATE, path);
  }
}

export async function deleteMessageForMe(
  hubId: string,
  chatId: string,
  messageId: string,
  myId: string
): Promise<void> {
  const path = `hubs/${hubId}/kabi_chats/${chatId}/messages/${messageId}`;
  try {
    await updateDoc(doc(db, path), {
      [`deletedFor.${myId}`]: true,
    });
  } catch (err) {
    handleKabiFirestoreError(err, KabiOperationType.UPDATE, path);
  }
}

export async function deleteMessageForEveryone(
  hubId: string,
  chatId: string,
  messageId: string
): Promise<void> {
  const chatPath = `hubs/${hubId}/kabi_chats/${chatId}`;
  const path = `${chatPath}/messages/${messageId}`;
  try {
    await updateDoc(doc(db, path), {
      deletedForEveryone: true,
      text: '',
      imageDataUrl: '',
      videoDataUrl: '',
      audioDataUrl: '',
    });
  } catch (err) {
    handleKabiFirestoreError(err, KabiOperationType.UPDATE, path);
  }
}

export async function togglePinChat(
  hubId: string,
  chatId: string,
  myId: string,
  isPinned: boolean
): Promise<void> {
  const path = `hubs/${hubId}/kabi_chats/${chatId}`;
  try {
    await updateDoc(doc(db, path), {
      [`pinnedBy.${myId}`]: !isPinned,
    });
  } catch (err) {
    handleKabiFirestoreError(err, KabiOperationType.UPDATE, path);
  }
}

export async function toggleMuteChat(
  hubId: string,
  chatId: string,
  myId: string,
  isMuted: boolean
): Promise<void> {
  const path = `hubs/${hubId}/kabi_chats/${chatId}`;
  try {
    await updateDoc(doc(db, path), {
      [`mutedBy.${myId}`]: !isMuted,
    });
  } catch (err) {
    handleKabiFirestoreError(err, KabiOperationType.UPDATE, path);
  }
}

export async function updateGroupDetails(
  hubId: string,
  chatId: string,
  actor: KabiParticipant,
  name: string,
  description: string
): Promise<void> {
  const chatPath = `hubs/${hubId}/kabi_chats/${chatId}`;
  const now = Date.now();
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, chatPath), {
      name: name.trim().slice(0, 120),
      description: description.trim().slice(0, 400),
      updatedAt: now,
    });
    const sysId = `sys_${now}_${Math.random().toString(36).slice(2, 6)}`;
    batch.set(doc(db, `${chatPath}/messages/${sysId}`), {
      id: sysId,
      chatId,
      hubId,
      senderId: actor.id,
      senderName: actor.name,
      senderRole: actor.role,
      text: `${actor.name} ने ग्रुप का नाम/विवरण अपडेट किया`,
      type: 'system',
      readBy: { [actor.id]: now },
      createdAt: now,
    });
    await batch.commit();
  } catch (err) {
    handleKabiFirestoreError(err, KabiOperationType.UPDATE, chatPath);
  }
}

export async function addGroupMembers(
  hubId: string,
  chat: KabiChat,
  actor: KabiParticipant,
  newMembers: KabiParticipant[]
): Promise<void> {
  const chatPath = `hubs/${hubId}/kabi_chats/${chat.id}`;
  const now = Date.now();
  const nextIds = Array.from(new Set([...chat.participantIds, ...newMembers.map((m) => m.id)])).slice(0, 200);
  const nextProfiles = { ...chat.participantProfiles };
  const addedNames: string[] = [];
  for (const m of newMembers) {
    if (!chat.participantIds.includes(m.id)) {
      addedNames.push(m.name);
    }
    nextProfiles[m.id] = { id: m.id, name: m.name.slice(0, 100), phone: m.phone || '', role: m.role };
  }
  if (addedNames.length === 0) return;

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, chatPath), {
      participantIds: nextIds,
      participantProfiles: nextProfiles,
      updatedAt: now,
    });
    const sysId = `sys_${now}_${Math.random().toString(36).slice(2, 6)}`;
    batch.set(doc(db, `${chatPath}/messages/${sysId}`), {
      id: sysId,
      chatId: chat.id,
      hubId,
      senderId: actor.id,
      senderName: actor.name,
      senderRole: actor.role,
      text: `${actor.name} ने ${addedNames.join(', ')} को ग्रुप में जोड़ा`,
      type: 'system',
      readBy: { [actor.id]: now },
      createdAt: now,
    });
    await batch.commit();
  } catch (err) {
    handleKabiFirestoreError(err, KabiOperationType.UPDATE, chatPath);
  }
}

export async function removeGroupMember(
  hubId: string,
  chat: KabiChat,
  actor: KabiParticipant,
  targetId: string
): Promise<void> {
  const chatPath = `hubs/${hubId}/kabi_chats/${chat.id}`;
  const now = Date.now();
  const targetName = chat.participantProfiles?.[targetId]?.name || 'सदस्य';
  const nextIds = chat.participantIds.filter((id) => id !== targetId);
  const nextAdmins = (chat.adminIds || []).filter((id) => id !== targetId);

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, chatPath), {
      participantIds: nextIds,
      adminIds: nextAdmins,
      updatedAt: now,
    });
    const sysId = `sys_${now}_${Math.random().toString(36).slice(2, 6)}`;
    const text =
      actor.id === targetId
        ? `${targetName} ने ग्रुप छोड़ दिया`
        : `${actor.name} ने ${targetName} को ग्रुप से हटाया`;
    batch.set(doc(db, `${chatPath}/messages/${sysId}`), {
      id: sysId,
      chatId: chat.id,
      hubId,
      senderId: actor.id,
      senderName: actor.name,
      senderRole: actor.role,
      text,
      type: 'system',
      readBy: { [actor.id]: now },
      createdAt: now,
    });
    await batch.commit();
  } catch (err) {
    handleKabiFirestoreError(err, KabiOperationType.UPDATE, chatPath);
  }
}

/**
 * 24-Hour WhatsApp-style Hub Status / Updates
 */
export function subscribeToHubStatuses(
  hubId: string,
  onUpdate: (statuses: KabiStatusItem[]) => void
): () => void {
  if (!hubId || !db) {
    onUpdate([]);
    return () => {};
  }
  const path = `hubs/${hubId}/kabi_statuses`;
  const q = query(collection(db, path), orderBy('createdAt', 'desc'), limit(60));
  return onSnapshot(
    q,
    (snapshot) => {
      const now = Date.now();
      const items: KabiStatusItem[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data() as KabiStatusItem;
        if (d && (!d.expiresAt || d.expiresAt > now)) {
          items.push({ ...d, id: docSnap.id });
        }
      });
      onUpdate(items);
    },
    (err) => {
      handleKabiFirestoreError(err, KabiOperationType.LIST, path);
    }
  );
}

export async function postHubStatus(params: {
  hubId: string;
  author: KabiParticipant;
  text: string;
  bgColor: string;
  imageDataUrl?: string;
}): Promise<void> {
  const { hubId, author, text, bgColor, imageDataUrl } = params;
  const now = Date.now();
  const statusId = `st_${now}_${Math.random().toString(36).slice(2, 7)}`;
  const path = `hubs/${hubId}/kabi_statuses/${statusId}`;
  const item: KabiStatusItem = {
    id: statusId,
    hubId,
    authorId: author.id,
    authorName: author.name.slice(0, 100),
    authorRole: author.role,
    text: text.trim().slice(0, 1000),
    bgColor,
    ...(imageDataUrl ? { imageDataUrl } : {}),
    viewedBy: { [author.id]: now },
    createdAt: now,
    expiresAt: now + 24 * 60 * 60 * 1000,
  };
  try {
    await setDoc(doc(db, path), item);
  } catch (err) {
    handleKabiFirestoreError(err, KabiOperationType.CREATE, path);
    throw err;
  }
}

export async function markStatusViewed(
  hubId: string,
  statusId: string,
  viewerId: string
): Promise<void> {
  const path = `hubs/${hubId}/kabi_statuses/${statusId}`;
  try {
    await updateDoc(doc(db, path), {
      [`viewedBy.${viewerId}`]: Date.now(),
    });
  } catch {
    // Non-critical
  }
}

export async function deleteHubStatus(hubId: string, statusId: string): Promise<void> {
  const path = `hubs/${hubId}/kabi_statuses/${statusId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (err) {
    handleKabiFirestoreError(err, KabiOperationType.DELETE, path);
  }
}

export const KABI_TEXT_RETENTION_DAYS = 365; // 1 Year for SMS / Text messages
export const KABI_MEDIA_RETENTION_DAYS = 150; // 5 Months (150 days) for Photos & Videos

/**
 * Dual Retention Auto-Cleanup Policy:
 * - Photos & Videos (image / video): automatically deleted after 5 months (150 days) to protect Firebase storage.
 * - Text SMS & Audio messages: safely preserved for 1 full year (365 days), then auto-cleaned.
 */
export async function cleanupOldMessagesInChat(
  hubId: string,
  chatId: string,
  textRetentionDays = KABI_TEXT_RETENTION_DAYS,
  mediaRetentionDays = KABI_MEDIA_RETENTION_DAYS
): Promise<void> {
  if (!hubId || !chatId || !db) return;
  const now = Date.now();
  const textCutoff = now - textRetentionDays * 24 * 60 * 60 * 1000;
  const mediaCutoff = now - mediaRetentionDays * 24 * 60 * 60 * 1000;
  const path = `hubs/${hubId}/kabi_chats/${chatId}/messages`;

  try {
    const q = query(collection(db, path), where('createdAt', '<', mediaCutoff), limit(40));
    const snap = await getDocs(q);
    if (snap.empty) return;

    const batch = writeBatch(db);
    let ops = 0;

    snap.forEach((d) => {
      const m = d.data() as KabiMessage;
      const createdAt = Number(m?.createdAt || 0);
      const isPhotoOrVideo = m?.type === 'image' || m?.type === 'video' || Boolean(m?.imageDataUrl) || Boolean(m?.videoDataUrl);

      if (createdAt < textCutoff) {
        // Older than 365 days (1 Year) -> hard delete complete message
        batch.delete(d.ref);
        ops++;
      } else if (isPhotoOrVideo && createdAt < mediaCutoff) {
        // Older than 5 months (150 days) -> auto-delete photo/video media
        if (m?.text && m.text.trim().length > 0) {
          // Keep text caption safe until 365 days, strip heavy photo/video payload
          batch.update(d.ref, {
            imageDataUrl: '',
            videoDataUrl: '',
            text: `${m.text.trim()} (मीडिया 5 माह बाद ऑटो-डिलीट)`,
          });
        } else {
          batch.delete(d.ref);
        }
        ops++;
      }
    });

    if (ops > 0) {
      await batch.commit();
    }
  } catch {
    // Only hub admin has hard delete permission; riders silently skip
  }
}

export interface CompressedMediaResult {
  dataUrl: string;
  originalBytes: number;
  compressedBytes: number;
  durationSec?: number;
}

export function formatBytesReadable(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Smart HD Photo Compressor:
 * Preserves sharp HD detail (up to 1280px) while automatically shrinking multi-MB photos
 * down to ~150–260 KB with adaptive JPEG quality stepping so clarity remains crisp.
 */
export function compressImageDetailed(
  file: File,
  maxDim = 1280,
  targetMaxDataUrlLen = 320_000
): Promise<CompressedMediaResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Image read failed'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.max(1, Math.round(width * ratio));
          height = Math.max(1, Math.round(height * ratio));
        }

        const renderAt = (w: number, h: number, quality: number): string => {
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas unavailable');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          return canvas.toDataURL('image/jpeg', quality);
        };

        try {
          const qualitySteps = [0.84, 0.76, 0.68, 0.58, 0.48];
          let dataUrl = renderAt(width, height, qualitySteps[0]);
          for (let i = 1; i < qualitySteps.length && dataUrl.length > targetMaxDataUrlLen; i++) {
            dataUrl = renderAt(width, height, qualitySteps[i]);
          }
          // If an ultra-detailed HD image is still over budget, step down slightly to 960px at crisp 0.72
          if (dataUrl.length > targetMaxDataUrlLen && Math.max(width, height) > 960) {
            const r2 = 960 / Math.max(width, height);
            dataUrl = renderAt(Math.round(width * r2), Math.round(height * r2), 0.72);
            if (dataUrl.length > targetMaxDataUrlLen) {
              dataUrl = renderAt(Math.round(width * r2), Math.round(height * r2), 0.56);
            }
          }
          const compressedBytes = Math.round((dataUrl.length * 3) / 4);
          resolve({
            dataUrl,
            originalBytes: file.size || compressedBytes,
            compressedBytes,
          });
        } catch (e) {
          reject(e);
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Backward-compatible string helper wrapping Smart HD Photo Compressor.
 */
export async function compressImageForChat(file: File, maxDim = 1280): Promise<string> {
  const res = await compressImageDetailed(file, maxDim);
  return res.dataUrl;
}

/**
 * Smart Automatic Video MB Compressor:
 * Shrinks heavy phone videos into crisp, smooth low-MB clips (targeting <= 620 KB so Firestore real-time sync is instant & reliable)
 * while preserving clarity and audio track wherever supported by the browser/WebView.
 */
export function compressVideoForChat(
  file: File,
  onProgress?: (percent: number) => void
): Promise<CompressedMediaResult> {
  return new Promise((resolve, reject) => {
    const MAX_RAW_PASSTHROUGH_BYTES = 560_000; // Already tiny -> pass straight through with zero re-encoding loss
    const MAX_OUTPUT_DATAURL_LEN = 840_000; // ~630 KB binary (safely under Firestore 1 MB document limit)

    const readBlobAsDataUrl = (blob: Blob): Promise<string> =>
      new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onerror = () => rej(new Error('वीडियो पढ़ने में त्रुटि'));
        fr.onloadend = () => res(String(fr.result || ''));
        fr.readAsDataURL(blob);
      });

    // If file is already compact (<= 560 KB), preserve original quality directly
    if (file.size <= MAX_RAW_PASSTHROUGH_BYTES) {
      onProgress?.(60);
      readBlobAsDataUrl(file)
        .then((dataUrl) => {
          onProgress?.(100);
          resolve({
            dataUrl,
            originalBytes: file.size,
            compressedBytes: file.size,
            durationSec: 5,
          });
        })
        .catch(reject);
      return;
    }

    if (typeof MediaRecorder === 'undefined') {
      reject(new Error('इस डिवाइस में ऑटो वीडियो कम्प्रेशन उपलब्ध नहीं है — कृपया छोटा वीडियो चुनें'));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = objectUrl;

    const cleanup = () => {
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch {}
      URL.revokeObjectURL(objectUrl);
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('यह वीडियो फॉर्मेट सपोर्ट नहीं हुआ'));
    };

    video.onloadedmetadata = () => {
      const rawDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 10;
      const maxClipSeconds = Math.min(rawDuration, 18); // Smart 18s max compressed clip to keep quality crisp & size small

      // Preserve aspect ratio at crisp 480p max edge (sharp on mobile screens, huge MB reduction)
      const maxEdge = 480;
      let targetW = video.videoWidth || 480;
      let targetH = video.videoHeight || 480;
      if (targetW > maxEdge || targetH > maxEdge) {
        const ratio = Math.min(maxEdge / targetW, maxEdge / targetH);
        targetW = Math.max(160, Math.round((targetW * ratio) / 2) * 2);
        targetH = Math.max(160, Math.round((targetH * ratio) / 2) * 2);
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx || typeof canvas.captureStream !== 'function') {
        cleanup();
        reject(new Error('वीडियो कम्प्रेशन के लिए कृपया छोटा वीडियो चुनें (अधिकतम 550 KB)'));
        return;
      }

      const canvasStream = canvas.captureStream(22);

      // Try attaching original audio track cleanly if browser supports video.captureStream
      try {
        const vAny = video as HTMLVideoElement & {
          captureStream?: () => MediaStream;
          mozCaptureStream?: () => MediaStream;
        };
        const sourceStream = vAny.captureStream?.() || vAny.mozCaptureStream?.();
        if (sourceStream) {
          sourceStream.getAudioTracks().forEach((track) => {
            canvasStream.addTrack(track);
          });
        }
      } catch {
        // Proceed with crisp video stream if audio capture is restricted
      }

      // Compute smart adaptive bitrate so compressed output stays crisp AND well under ~550 KB
      const targetTotalBits = 460_000 * 8;
      const computedVideoBps = Math.max(
        130_000,
        Math.min(360_000, Math.floor(targetTotalBits / Math.max(3, maxClipSeconds)))
      );

      const mimeCandidates = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4',
      ];
      const chosenMime = mimeCandidates.find((m) => {
        try {
          return MediaRecorder.isTypeSupported(m);
        } catch {
          return false;
        }
      });

      const chunks: Blob[] = [];
      let recorder: MediaRecorder;
      try {
        recorder = chosenMime
          ? new MediaRecorder(canvasStream, {
              mimeType: chosenMime,
              videoBitsPerSecond: computedVideoBps,
              audioBitsPerSecond: 32_000,
            })
          : new MediaRecorder(canvasStream, {
              videoBitsPerSecond: computedVideoBps,
            });
      } catch {
        cleanup();
        reject(new Error('वीडियो कंप्रेसर शुरू नहीं हो सका'));
        return;
      }

      let rafId = 0;
      let stopped = false;

      const finishRecording = () => {
        if (stopped) return;
        stopped = true;
        if (rafId) cancelAnimationFrame(rafId);
        try {
          if (recorder.state !== 'inactive') {
            recorder.stop();
          }
        } catch {}
      };

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };

      recorder.onstop = async () => {
        const finalDuration = Math.max(1, Math.round(Math.min(video.currentTime || maxClipSeconds, maxClipSeconds)));
        cleanup();
        try {
          const outBlob = new Blob(chunks, { type: chosenMime || 'video/webm' });
          if (outBlob.size === 0) {
            reject(new Error('कंप्रेस्ड वीडियो खाली बना, पुनः प्रयास करें'));
            return;
          }
          const dataUrl = await readBlobAsDataUrl(outBlob);
          if (dataUrl.length > MAX_OUTPUT_DATAURL_LEN) {
            reject(new Error('वीडियो थोड़ा लंबा है — कृपया 10–15 सेकंड का वीडियो चुनें'));
            return;
          }
          onProgress?.(100);
          resolve({
            dataUrl,
            originalBytes: file.size,
            compressedBytes: outBlob.size,
            durationSec: finalDuration,
          });
        } catch (e) {
          reject(e);
        }
      };

      const drawFrame = () => {
        if (stopped) return;
        if (video.ended || video.currentTime >= maxClipSeconds) {
          finishRecording();
          return;
        }
        ctx.drawImage(video, 0, 0, targetW, targetH);
        const pct = Math.min(95, Math.round((video.currentTime / maxClipSeconds) * 95));
        onProgress?.(pct);
        rafId = requestAnimationFrame(drawFrame);
      };

      video.onended = () => finishRecording();

      // Safety timeout so recording never hangs
      const hardStopTimer = window.setTimeout(finishRecording, (maxClipSeconds + 4) * 1000);

      recorder.start(300);
      video
        .play()
        .then(() => {
          rafId = requestAnimationFrame(drawFrame);
        })
        .catch(() => {
          window.clearTimeout(hardStopTimer);
          finishRecording();
          reject(new Error('वीडियो प्ले नहीं हो सका, कृपया दूसरी क्लिप चुनें'));
        });
    };
  });
}
