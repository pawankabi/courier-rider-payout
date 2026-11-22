import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Search,
  MoreVertical,
  Phone,
  Video,
  MessageSquare,
  Users,
  CircleDot,
  Eye,
  Plus,
  Send,
  Smile,
  Paperclip,
  Mic,
  Square,
  Check,
  CheckCheck,
  Pin,
  VolumeX,
  Volume2,
  Star,
  Reply,
  Forward,
  Copy,
  Trash2,
  Edit3,
  Info,
  X,
  Megaphone,
  Download,
  Clock,
  ShieldCheck,
  Sparkles,
  Camera,
  Film,
} from 'lucide-react';
import { App as CapacitorApp } from '@capacitor/app';
import kabiLogoImg from '../../assets/images/kabitech_sms_3d_logo_1795276676617.jpg';
import floralBgImg from '../../assets/images/kabitech_white_floral_wallpaper_1795276677699.jpg';
import {
  ADMIN_PARTICIPANT_ID,
  CompressedMediaResult,
  KABI_MEDIA_RETENTION_DAYS,
  KABI_TEXT_RETENTION_DAYS,
  KabiChat,
  KabiMessage,
  KabiParticipant,
  KabiPresence,
  KabiReplyPreview,
  KabiStatusItem,
  addGroupMembers,
  cleanupOldMessagesInChat,
  compressImageDetailed,
  compressVideoForChat,
  createGroupChat,
  deleteHubStatus,
  deleteMessageForEveryone,
  deleteMessageForMe,
  editChatMessage,
  formatBytesReadable,
  getChatDisplayTitle,
  getDirectPeerProfile,
  getMonitorChatPairTitle,
  getOrCreateDirectChat,
  markChatAsRead,
  markStatusViewed,
  pickAvatarColor,
  postHubStatus,
  removeGroupMember,
  sendBulkBroadcastMessage,
  sendChatMessage,
  setTypingIndicator,
  subscribeToChatMessages,
  subscribeToHubPresence,
  subscribeToHubStatuses,
  toggleMessageReaction,
  toggleMuteChat,
  togglePinChat,
  toggleStarMessage,
  updateGroupDetails,
} from '../../services/kabiChatService';
import { playKabiSmsSendTone } from '../../services/kabiChatNotification';
import {
  BulkBroadcastModal,
  CallComingSoonModal,
  CreateGroupModal,
  ForwardMessageModal,
  GroupInfoModal,
  MessageInfoModal,
  NewChatModal,
  StarredMessagesModal,
  StatusComposerModal,
  StatusViewerModal,
  getInitials,
} from './KabiSmsModals';

interface KabiTechSmsAppProps {
  hubId: string;
  hubName: string;
  me: KabiParticipant;
  isHubAdmin: boolean;
  hubContacts: KabiParticipant[];
  hubChats: KabiChat[];
  initialChatId?: string | null;
  onActiveChatChange?: (chatId: string | null) => void;
  onExit: () => void;
}

type MainTab = 'chats' | 'updates' | 'calls' | 'monitor';
type ChatFilter = 'all' | 'unread' | 'groups';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '🙏', '✅', '🔥', '📦', '🏍️', '💰', '👌', '🤝', '⏰', '📍', '🎉', '👏'];

const QUICK_TEMPLATES = [
  'आज का COD कैश शाम तक ऑफिस में जमा कर दें।',
  'सभी पार्सल समय पर डिलीवर करें और स्टेटस अपडेट रखें।',
  'कृपया तुरंत ऑफिस / हब पर आ जाएं।',
  'आपका पेमेंट / हिसाब अपडेट कर दिया गया है।',
  'ठीक है सर, अभी कर रहा हूँ।',
  'आज की सारी डिलीवरी पूरी हो गई है।',
];

function formatShortTime(ts?: number): string {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    const now = new Date();
    const sameDay =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    if (sameDay) {
      return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    }
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear()
    ) {
      return 'कल';
    }
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch {
    return '';
  }
}

function formatBubbleTime(ts?: number): string {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
}

function formatDateDivider(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  ) {
    return 'आज (Today)';
  }
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (
    d.getDate() === y.getDate() &&
    d.getMonth() === y.getMonth() &&
    d.getFullYear() === y.getFullYear()
  ) {
    return 'कल (Yesterday)';
  }
  return d.toLocaleDateString('hi-IN', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatLastSeen(presence?: KabiPresence): string {
  if (!presence) return 'ऑफ़लाइन';
  const now = Date.now();
  if (presence.online && now - (presence.lastSeenAt || 0) < 90_000) {
    return 'ऑनलाइन (Online)';
  }
  if (!presence.lastSeenAt) return 'ऑफ़लाइन';
  return `अंतिम बार ${formatShortTime(presence.lastSeenAt)}`;
}

export const KabiTechSmsApp: React.FC<KabiTechSmsAppProps> = ({
  hubId,
  hubName,
  me,
  isHubAdmin,
  hubContacts,
  hubChats,
  initialChatId,
  onActiveChatChange,
  onExit,
}) => {
  // 3D Standalone App Splash Intro (~650ms)
  const [showSplash, setShowSplash] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setShowSplash(false), 680);
    return () => window.clearTimeout(t);
  }, []);

  const [activeTab, setActiveTab] = useState<MainTab>('chats');
  const [chatFilter, setChatFilter] = useState<ChatFilter>('all');
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [selectedChatId, setSelectedChatId] = useState<string | null>(initialChatId || null);
  const [localChatCache, setLocalChatCache] = useState<Record<string, KabiChat>>({});
  const [isMonitorInspecting, setIsMonitorInspecting] = useState(false);

  // Real-time messages, presence, statuses
  const [messages, setMessages] = useState<KabiMessage[]>([]);
  const [presenceMap, setPresenceMap] = useState<Record<string, KabiPresence>>({});
  const [statuses, setStatuses] = useState<KabiStatusItem[]>([]);

  // Composer & Message interaction states
  const [inputText, setInputText] = useState('');
  const [replyTo, setReplyTo] = useState<KabiReplyPreview | null>(null);
  const [editingMsg, setEditingMsg] = useState<KabiMessage | null>(null);
  const [selectedMsgMenu, setSelectedMsgMenu] = useState<KabiMessage | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showQuickTemplates, setShowQuickTemplates] = useState(false);
  const [showChatSearch, setShowChatSearch] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [showChatOverflow, setShowChatOverflow] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [pendingMedia, setPendingMedia] = useState<
    (CompressedMediaResult & { kind: 'image' | 'video' }) | null
  >(null);
  const [compressingState, setCompressingState] = useState<{
    kind: 'image' | 'video';
    percent: number;
  } | null>(null);
  const [isSendingMsg, setIsSendingMsg] = useState(false);
  const [statusToast, setStatusToast] = useState<string | null>(null);

  // Voice Note Recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const recordStartRef = useRef<number>(0);

  // Modals
  const [callComingSoonMode, setCallComingSoonMode] = useState<'audio' | 'video' | null>(null);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isBulkBroadcastOpen, setIsBulkBroadcastOpen] = useState(false);
  const [isGroupInfoOpen, setIsGroupInfoOpen] = useState(false);
  const [forwardMsg, setForwardMsg] = useState<KabiMessage | null>(null);
  const [infoMsg, setInfoMsg] = useState<KabiMessage | null>(null);
  const [isStarredOpen, setIsStarredOpen] = useState(false);
  const [isStatusComposerOpen, setIsStatusComposerOpen] = useState(false);
  const [viewingStatus, setViewingStatus] = useState<KabiStatusItem | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);

  const showTempToast = (msg: string) => {
    setStatusToast(msg);
    window.setTimeout(() => setStatusToast(null), 2600);
  };

  // Sync active chat ID to parent notification hook
  useEffect(() => {
    onActiveChatChange?.(selectedChatId);
    return () => onActiveChatChange?.(null);
  }, [selectedChatId, onActiveChatChange]);

  // Subscribe to hub presence & 24h statuses
  useEffect(() => {
    if (!hubId) return;
    const unsubPresence = subscribeToHubPresence(hubId, setPresenceMap);
    const unsubStatus = subscribeToHubStatuses(hubId, setStatuses);
    return () => {
      unsubPresence();
      unsubStatus();
    };
  }, [hubId]);

  // Active Chat Object (resolves immediately from real-time hubChats OR local newly-created chat cache)
  const activeChat = useMemo(() => {
    if (!selectedChatId) return null;
    return hubChats.find((c) => c.id === selectedChatId) || localChatCache[selectedChatId] || null;
  }, [hubChats, selectedChatId, localChatCache]);

  // Android Hardware Back Button: close modal -> close active chat -> exit KabiTech SMS cleanly
  const backStateRef = useRef({
    hasModal: false,
    hasActiveChat: false,
    closeModals: () => {},
    closeActiveChat: () => {},
    onExit,
  });
  backStateRef.current = {
    hasModal: Boolean(
      lightboxImage ||
        callComingSoonMode ||
        isNewChatOpen ||
        isCreateGroupOpen ||
        isBulkBroadcastOpen ||
        isGroupInfoOpen ||
        forwardMsg ||
        infoMsg ||
        isStarredOpen ||
        isStatusComposerOpen ||
        viewingStatus ||
        selectedMsgMenu
    ),
    hasActiveChat: Boolean(activeChat),
    closeModals: () => {
      setLightboxImage(null);
      setCallComingSoonMode(null);
      setIsNewChatOpen(false);
      setIsCreateGroupOpen(false);
      setIsBulkBroadcastOpen(false);
      setIsGroupInfoOpen(false);
      setForwardMsg(null);
      setInfoMsg(null);
      setIsStarredOpen(false);
      setIsStatusComposerOpen(false);
      setViewingStatus(null);
      setSelectedMsgMenu(null);
    },
    closeActiveChat: () => {
      setSelectedChatId(null);
      setSelectedMsgMenu(null);
      setShowChatOverflow(false);
    },
    onExit,
  };

  useEffect(() => {
    let listener: any = null;
    try {
      listener = CapacitorApp.addListener('backButton', () => {
        const st = backStateRef.current;
        if (st.hasModal) {
          st.closeModals();
        } else if (st.hasActiveChat) {
          st.closeActiveChat();
        } else {
          st.onExit();
        }
      });
    } catch {
      // Web browser — ignore
    }
    return () => {
      if (listener && typeof listener.then === 'function') {
        listener.then((h: any) => h?.remove?.()).catch(() => {});
      } else if (listener?.remove) {
        listener.remove();
      }
    };
  }, []);

  // Subscribe to messages of active chat
  useEffect(() => {
    if (!hubId || !selectedChatId) {
      setMessages([]);
      return;
    }
    const unsub = subscribeToChatMessages(hubId, selectedChatId, setMessages);
    // Run automatic dual retention cleanup if Hub Admin:
    // Text SMS = 365 days (1 Year) | Photos & Videos = 150 days (5 Months)
    if (isHubAdmin) {
      cleanupOldMessagesInChat(
        hubId,
        selectedChatId,
        KABI_TEXT_RETENTION_DAYS,
        KABI_MEDIA_RETENTION_DAYS
      ).catch(() => {});
    }
    return () => unsub();
  }, [hubId, selectedChatId, isHubAdmin]);

  // Auto-scroll to latest message when chat opens or new message arrives
  useEffect(() => {
    if (messagesEndRef.current && !showChatSearch) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, selectedChatId, showChatSearch]);

  // Immediately clear unread badge (1, 2, 3 -> 0) & mark Blue Ticks when user opens and reads a chat!
  useEffect(() => {
    if (!hubId || !activeChat || isMonitorInspecting) return;
    if (!activeChat.participantIds?.includes(me.id)) return;

    const myUnread = Number(activeChat.unreadCounts?.[me.id] || 0);
    const hasUnreadIncoming = messages.some((m) => m.senderId !== me.id && !m.readBy?.[me.id]);

    if (myUnread > 0 || hasUnreadIncoming) {
      markChatAsRead(hubId, activeChat.id, me.id, messages);
    }
  }, [hubId, activeChat, messages, me.id, isMonitorInspecting]);

  // Chats where I am a participant (sorted Pinned first -> Latest message desc)
  const myChats = useMemo(() => {
    const mine = hubChats.filter((c) => c.participantIds?.includes(me.id));
    return [...mine].sort((a, b) => {
      const pinA = a.pinnedBy?.[me.id] ? 1 : 0;
      const pinB = b.pinnedBy?.[me.id] ? 1 : 0;
      if (pinA !== pinB) return pinB - pinA;
      return (b.lastMessageAt || 0) - (a.lastMessageAt || 0);
    });
  }, [hubChats, me.id]);

  // Filtered chats for sidebar
  const filteredMyChats = useMemo(() => {
    const q = sidebarSearch.trim().toLowerCase();
    return myChats.filter((c) => {
      if (chatFilter === 'unread' && Number(c.unreadCounts?.[me.id] || 0) <= 0) return false;
      if (chatFilter === 'groups' && c.type !== 'group') return false;
      if (!q) return true;
      const title = getChatDisplayTitle(c, me.id).toLowerCase();
      return (
        title.includes(q) ||
        (c.lastMessageText || '').toLowerCase().includes(q) ||
        Object.values(c.participantProfiles || {}).some(
          (p) => p.name.toLowerCase().includes(q) || (p.phone || '').includes(q)
        )
      );
    });
  }, [myChats, chatFilter, sidebarSearch, me.id]);

  // Admin Monitor: ALL chats in the hub (including Rider-to-Rider chats Admin is NOT part of!)
  const monitorAllHubChats = useMemo(() => {
    const q = sidebarSearch.trim().toLowerCase();
    return [...hubChats]
      .sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0))
      .filter((c) => {
        if (!q) return true;
        const pairTitle = getMonitorChatPairTitle(c).toLowerCase();
        return (
          pairTitle.includes(q) ||
          (c.lastMessageText || '').toLowerCase().includes(q) ||
          Object.values(c.participantProfiles || {}).some(
            (p) => p.name.toLowerCase().includes(q) || (p.phone || '').includes(q)
          )
        );
      });
  }, [hubChats, sidebarSearch]);

  // Total unread for Chats tab badge
  const totalUnreadChats = useMemo(
    () => myChats.reduce((acc, c) => acc + Math.max(0, Number(c.unreadCounts?.[me.id] || 0)), 0),
    [myChats, me.id]
  );

  // Visible messages inside current chat
  const visibleMessages = useMemo(() => {
    const q = chatSearchQuery.trim().toLowerCase();
    return messages.filter((m) => {
      if (m.deletedFor?.[me.id]) return false;
      if (showChatSearch && q) {
        return (
          (m.text || '').toLowerCase().includes(q) ||
          (m.senderName || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [messages, me.id, showChatSearch, chatSearchQuery]);

  // Typing indicator text for active chat
  const activeTypingText = useMemo(() => {
    if (!activeChat?.typing) return '';
    const now = Date.now();
    const activeTypers = Object.entries(activeChat.typing)
      .filter(([pid, info]) => pid !== me.id && info && now - info.at < 6000)
      .map(([, info]) => info.name);
    if (activeTypers.length === 0) return '';
    return activeChat.type === 'group'
      ? `${activeTypers[0]} टाइप कर रहे हैं...`
      : 'टाइप कर रहे हैं...';
  }, [activeChat, me.id]);

  // Start or open direct 1-on-1 chat with any contact in hub
  const handleStartDirectChat = async (contact: KabiParticipant) => {
    try {
      const chat = await getOrCreateDirectChat(hubId, me, contact);
      setLocalChatCache((prev) => ({ ...prev, [chat.id]: chat }));
      setIsMonitorInspecting(false);
      setActiveTab('chats');
      setSelectedChatId(chat.id);
    } catch {
      showTempToast('चैट खोलने में समस्या आई, पुनः प्रयास करें');
    }
  };

  // Send text / HD photo / compressed video / edited message
  const handleSend = async () => {
    if (!activeChat || isSendingMsg || compressingState) return;
    const trimmed = inputText.trim();
    if (!trimmed && !pendingMedia) return;

    // Handle Edit mode
    if (editingMsg && trimmed) {
      setIsSendingMsg(true);
      try {
        await editChatMessage(hubId, activeChat.id, editingMsg.id, trimmed);
        setEditingMsg(null);
        setInputText('');
        showTempToast('मैसेज अपडेट हो गया');
      } finally {
        setIsSendingMsg(false);
      }
      return;
    }

    setIsSendingMsg(true);
    try {
      const mediaToSend = pendingMedia;
      setInputText('');
      setPendingMedia(null);
      setShowEmojiPicker(false);
      setShowQuickTemplates(false);
      const replyPayload = replyTo;
      setReplyTo(null);

      await sendChatMessage({
        hubId,
        chat: activeChat,
        sender: me,
        text: trimmed,
        type: mediaToSend ? mediaToSend.kind : 'text',
        imageDataUrl: mediaToSend?.kind === 'image' ? mediaToSend.dataUrl : undefined,
        videoDataUrl: mediaToSend?.kind === 'video' ? mediaToSend.dataUrl : undefined,
        videoDurationSec: mediaToSend?.kind === 'video' ? mediaToSend.durationSec : undefined,
        originalSizeBytes: mediaToSend?.originalBytes,
        compressedSizeBytes: mediaToSend?.compressedBytes,
        replyTo: replyPayload,
      });
      playKabiSmsSendTone();
    } catch {
      showTempToast('मैसेज भेजने में त्रुटि, इंटरनेट जांचें');
    } finally {
      setIsSendingMsg(false);
    }
  };

  // Typing signal handler
  const handleInputChange = (val: string) => {
    setInputText(val);
    if (!activeChat || isMonitorInspecting) return;
    setTypingIndicator(hubId, activeChat.id, me, val.trim().length > 0);
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(() => {
      setTypingIndicator(hubId, activeChat.id, me, false);
    }, 3000);
  };

  // Smart HD Photo Picker (preserves sharp HD clarity while shrinking MB automatically)
  const handlePickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCompressingState({ kind: 'image', percent: 45 });
    try {
      const result = await compressImageDetailed(file, 1280);
      setPendingMedia({ ...result, kind: 'image' });
      showTempToast(
        `HD फोटो कंप्रेस: ${formatBytesReadable(result.originalBytes)} → ${formatBytesReadable(result.compressedBytes)}`
      );
    } catch {
      showTempToast('फोटो लोड नहीं हो सकी');
    } finally {
      setCompressingState(null);
    }
    e.target.value = '';
  };

  // Smart Video Picker (automatically reduces MB while keeping clear smooth playback)
  const handlePickVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCompressingState({ kind: 'video', percent: 5 });
    try {
      const result = await compressVideoForChat(file, (pct) => {
        setCompressingState({ kind: 'video', percent: pct });
      });
      setPendingMedia({ ...result, kind: 'video' });
      showTempToast(
        `वीडियो कंप्रेस: ${formatBytesReadable(result.originalBytes)} → ${formatBytesReadable(result.compressedBytes)}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'वीडियो कंप्रेस नहीं हो सका';
      showTempToast(msg);
    } finally {
      setCompressingState(null);
    }
    e.target.value = '';
  };

  // Voice Note Recording
  const startVoiceRecording = async () => {
    if (!activeChat || isRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 24000 })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const durationSec = Math.max(1, Math.round((Date.now() - recordStartRef.current) / 1000));
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size > 260_000) {
          showTempToast('वॉइस नोट बहुत बड़ा है (अधिकतम 25 सेकंड रखें)');
          return;
        }
        const reader = new FileReader();
        reader.onloadend = async () => {
          const audioDataUrl = String(reader.result || '');
          if (!audioDataUrl || !activeChat) return;
          try {
            await sendChatMessage({
              hubId,
              chat: activeChat,
              sender: me,
              text: '',
              type: 'audio',
              audioDataUrl,
              audioDurationSec: durationSec,
              replyTo,
            });
            setReplyTo(null);
            playKabiSmsSendTone();
          } catch {
            showTempToast('वॉइस नोट भेजने में समस्या आई');
          }
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorderRef.current = recorder;
      recordStartRef.current = Date.now();
      setRecordSeconds(0);
      setIsRecording(true);
      recorder.start();

      recordTimerRef.current = window.setInterval(() => {
        const sec = Math.round((Date.now() - recordStartRef.current) / 1000);
        setRecordSeconds(sec);
        if (sec >= 25) {
          stopVoiceRecording();
        }
      }, 500);
    } catch {
      showTempToast('माइक परमिशन नहीं मिली — कृपया Microphone Allow करें');
    }
  };

  const stopVoiceRecording = () => {
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    setIsRecording(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  // Export chat transcript as .txt
  const handleExportChat = () => {
    if (!activeChat) return;
    const title = isMonitorInspecting
      ? getMonitorChatPairTitle(activeChat)
      : getChatDisplayTitle(activeChat, me.id);
    const lines = visibleMessages.map((m) => {
      const dt = new Date(m.createdAt).toLocaleString('en-IN');
      const body = m.deletedForEveryone
        ? '[मैसेज डिलीट किया गया]'
        : m.text || (m.type === 'image' ? '[HD फोटो]' : m.type === 'video' ? '[वीडियो]' : '[वॉइस नोट]');
      return `[${dt}] ${m.senderName}: ${body}`;
    });
    const blob = new Blob([`KabiTech Solution SMS — ${title}\n\n${lines.join('\n')}`], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `KabiTech_SMS_${title.replace(/[^a-zA-Z0-9_-]/g, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showTempToast('चैट बैकअप डाउनलोड हो गया');
  };

  const activePeer = activeChat ? getDirectPeerProfile(activeChat, me.id) : null;
  const activePeerPresence = activePeer ? presenceMap[activePeer.id] : undefined;
  const activeChatTitle = activeChat
    ? isMonitorInspecting && !activeChat.participantIds.includes(me.id)
      ? getMonitorChatPairTitle(activeChat)
      : getChatDisplayTitle(activeChat, me.id)
    : '';
  const isReadOnlyMonitorView = Boolean(
    activeChat && isMonitorInspecting && !activeChat.participantIds.includes(me.id)
  );

  // ==================== 3D STANDALONE LAUNCH SPLASH ====================
  if (showSplash) {
    return (
      <div
        className="fixed inset-0 z-[110] flex flex-col items-center justify-center p-6 select-none overflow-hidden"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.88), rgba(240,253,248,0.92)), url(${floralBgImg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div
          className="flex flex-col items-center gap-5 animate-[fadeIn_0.35s_ease-out]"
          style={{ perspective: '900px' }}
        >
          <div
            className="w-28 h-28 rounded-[28px] overflow-hidden shadow-[0_22px_50px_rgba(0,128,105,0.35)] ring-4 ring-white transition-transform duration-500"
            style={{
              transform: 'rotateX(6deg) rotateY(-8deg) scale(1.04)',
            }}
          >
            <img
              src={kabiLogoImg}
              alt="KabiTech Solution SMS 3D Logo"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-black text-[#075E54] tracking-tight">
              KabiTech Solution SMS
            </h1>
            <p className="text-xs font-semibold text-emerald-700 tracking-wide">
              {hubName} · सिक्योर हब मैसेंजर
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 h-[100dvh] w-full z-[105] bg-white text-slate-900 flex flex-col overflow-hidden"
    >
      {/* Inline Toast Feedback */}
      {statusToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[140] bg-slate-900 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-2xl">
          {statusToast}
        </div>
      )}

      {/* MAIN SPLIT CONTAINER: Sidebar (Mobile full-screen when no chat is active) + Active Pane */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* ==================== LEFT SIDEBAR (CHATS / UPDATES / CALLS / MONITOR) ==================== */}
        <aside
          className={`${
            activeChat ? 'hidden md:flex' : 'flex'
          } w-full md:w-[370px] lg:w-[400px] md:border-r border-slate-200 flex-col bg-white shrink-0 min-h-0`}
        >
          {/* WhatsApp Brand Top Bar */}
          <div
            className="bg-[#008069] text-white px-3 py-2.5 flex items-center justify-between gap-2 shrink-0 shadow-xs"
            style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top, 0.625rem))' }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={onExit}
                className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center shrink-0 cursor-pointer"
                title="वापस मुख्य ऐप में जाएं"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="w-9 h-9 rounded-xl overflow-hidden shadow-md ring-2 ring-white/40 shrink-0 bg-emerald-800">
                <img
                  src={kabiLogoImg}
                  alt="KabiTech Solution SMS"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <div className="text-[15px] font-extrabold leading-tight truncate">
                  KabiTech Solution SMS
                </div>
                <div className="text-[11px] text-emerald-100 truncate">
                  {me.name} · {hubName}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {isHubAdmin && (
                <button
                  type="button"
                  onClick={() => setIsBulkBroadcastOpen(true)}
                  className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center cursor-pointer"
                  title="बल्क SMS ब्रॉडकास्ट (सभी राइडर्स को)"
                >
                  <Megaphone className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsCreateGroupOpen(true)}
                className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center cursor-pointer"
                title="नया ग्रुप बनाएं"
              >
                <Users className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsNewChatOpen(true)}
                className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center cursor-pointer"
                title="नई चैट"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Search & Filters (for Chats & Monitor tabs) */}
          {(activeTab === 'chats' || activeTab === 'monitor') && (
            <div className="p-2.5 bg-white border-b border-slate-100 space-y-2 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={sidebarSearch}
                  onChange={(e) => setSidebarSearch(e.target.value)}
                  placeholder={
                    activeTab === 'monitor'
                      ? 'राइडर या किसी भी चैट को खोजें...'
                      : 'चैट, राइडर या ग्रुप खोजें...'
                  }
                  className="w-full h-10 pl-10 pr-8 rounded-full bg-slate-100 text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#008069]/50"
                />
                {sidebarSearch && (
                  <button
                    type="button"
                    onClick={() => setSidebarSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {activeTab === 'chats' && (
                <div className="flex items-center gap-1.5 px-0.5">
                  {(
                    [
                      { id: 'all', label: 'सभी' },
                      { id: 'unread', label: `अपठित${totalUnreadChats > 0 ? ` (${totalUnreadChats})` : ''}` },
                      { id: 'groups', label: 'ग्रुप' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setChatFilter(f.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                        chatFilter === f.id
                          ? 'bg-[#D9FDD3] text-[#075E54]'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}

              {activeTab === 'monitor' && (
                <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    <strong>हब निगरानी:</strong> आपके हब के सभी राइडर्स की आपसी चैट और ग्रुप यहाँ लाइव दिखते हैं।
                  </span>
                </div>
              )}
            </div>
          )}

          {/* TAB CONTENT BODY */}
          <div className="flex-1 overflow-y-auto min-h-0 bg-white">
            {/* 1. CHATS TAB */}
            {activeTab === 'chats' && (
              <>
                {filteredMyChats.length === 0 ? (
                  <div className="p-8 text-center space-y-3">
                    <div className="w-16 h-16 rounded-2xl overflow-hidden mx-auto shadow-md opacity-90">
                      <img src={kabiLogoImg} alt="KabiTech SMS" className="w-full h-full object-cover" />
                    </div>
                    <div className="text-sm font-bold text-slate-800">
                      {sidebarSearch ? 'कोई चैट नहीं मिली' : 'अभी कोई चैट शुरू नहीं हुई है'}
                    </div>
                    <p className="text-xs text-slate-500">
                      नीचे नए चैट बटन (+) पर क्लिक करके अपने हब के किसी भी राइडर, एडमिन या ग्रुप से बात शुरू करें।
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsNewChatOpen(true)}
                      className="px-4 py-2.5 rounded-xl bg-[#008069] text-white text-xs font-bold cursor-pointer hover:bg-[#016a57]"
                    >
                      + नई चैट शुरू करें
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {filteredMyChats.map((chat) => {
                      const title = getChatDisplayTitle(chat, me.id);
                      const unread = Math.max(0, Number(chat.unreadCounts?.[me.id] || 0));
                      const isPinned = Boolean(chat.pinnedBy?.[me.id]);
                      const isMuted = Boolean(chat.mutedBy?.[me.id]);
                      const isSelected = selectedChatId === chat.id && !isMonitorInspecting;
                      const isMyLast = chat.lastMessageSenderId === me.id;

                      const typingNames = Object.entries(chat.typing || {})
                        .filter(([pid, info]) => pid !== me.id && info && Date.now() - info.at < 6000)
                        .map(([, info]) => info.name);

                      return (
                        <button
                          key={chat.id}
                          type="button"
                          onClick={() => {
                            setIsMonitorInspecting(false);
                            setSelectedChatId(chat.id);
                            setShowChatSearch(false);
                            setChatSearchQuery('');
                          }}
                          className={`w-full px-3.5 py-3 flex items-center gap-3 text-left transition cursor-pointer ${
                            isSelected ? 'bg-emerald-50/90' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div
                            className="w-12 h-12 rounded-full text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-2xs relative"
                            style={{ backgroundColor: chat.avatarColor || pickAvatarColor(chat.id) }}
                          >
                            {chat.type === 'group' ? (
                              <Users className="w-5 h-5" />
                            ) : (
                              getInitials(title)
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[15px] font-bold text-slate-900 truncate">
                                {title}
                              </span>
                              <span
                                className={`text-[11px] shrink-0 tabular-nums ${
                                  unread > 0 ? 'text-[#25D366] font-bold' : 'text-slate-400'
                                }`}
                              >
                                {formatShortTime(chat.lastMessageAt)}
                              </span>
                            </div>

                            <div className="flex items-center justify-between gap-2 mt-0.5">
                              <div className="text-xs text-slate-500 truncate flex items-center gap-1 min-w-0">
                                {typingNames.length > 0 ? (
                                  <span className="text-[#008069] font-bold">
                                    {chat.type === 'group'
                                      ? `${typingNames[0]} टाइप कर रहे हैं...`
                                      : 'टाइप कर रहे हैं...'}
                                  </span>
                                ) : (
                                  <>
                                    {isMyLast && <CheckCheck className="w-3.5 h-3.5 text-sky-500 shrink-0" />}
                                    {chat.type === 'group' && chat.lastMessageSenderName && !isMyLast && (
                                      <span className="font-semibold text-slate-700 shrink-0">
                                        {chat.lastMessageSenderName}:
                                      </span>
                                    )}
                                    <span className="truncate">
                                      {chat.lastMessageText || 'चैट शुरू करने के लिए टैप करें'}
                                    </span>
                                  </>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {isMuted && <VolumeX className="w-3.5 h-3.5 text-slate-400" />}
                                {isPinned && <Pin className="w-3.5 h-3.5 text-slate-400" />}
                                {unread > 0 && (
                                  <span className="min-w-[21px] h-[21px] px-1.5 rounded-full bg-[#25D366] text-white text-[11px] font-black flex items-center justify-center tabular-nums shadow-2xs">
                                    {unread > 99 ? '99+' : unread}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* 2. UPDATES (24H STATUSES) TAB */}
            {activeTab === 'updates' && (
              <div className="p-3.5 space-y-4">
                <button
                  type="button"
                  onClick={() => setIsStatusComposerOpen(true)}
                  className="w-full p-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200 flex items-center gap-3 text-left transition cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-full bg-[#008069] text-white flex items-center justify-center relative shrink-0 shadow-xs">
                    <Plus className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-sm font-extrabold text-slate-900">मेरा स्टेटस जोड़ें (My Status)</div>
                    <div className="text-xs text-slate-600">
                      हब के सभी सदस्यों के लिए 24 घंटे का टेक्स्ट या फोटो अपडेट डालें
                    </div>
                  </div>
                </button>

                <div className="space-y-1">
                  <div className="text-xs font-bold text-slate-500 px-1">
                    हाल के अपडेट ({statuses.length})
                  </div>
                  {statuses.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      पिछले 24 घंटे में कोई हब स्टेटस नहीं है।
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {statuses.map((st) => {
                        const seen = Boolean(st.viewedBy?.[me.id]);
                        return (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => {
                              setViewingStatus(st);
                              markStatusViewed(hubId, st.id, me.id);
                            }}
                            className="w-full py-3 px-1 flex items-center gap-3 hover:bg-slate-50 rounded-xl text-left cursor-pointer"
                          >
                            <div
                              className={`w-12 h-12 rounded-full p-0.5 shrink-0 ${
                                seen ? 'ring-2 ring-slate-300' : 'ring-2 ring-[#25D366]'
                              }`}
                            >
                              <div
                                className="w-full h-full rounded-full text-white text-xs font-bold flex items-center justify-center overflow-hidden"
                                style={{ backgroundColor: st.bgColor || '#008069' }}
                              >
                                {st.imageDataUrl ? (
                                  <img src={st.imageDataUrl} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  getInitials(st.authorName)
                                )}
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-bold text-slate-900 truncate">{st.authorName}</div>
                              <div className="text-xs text-slate-500 truncate">
                                {st.text || '📷 फोटो अपडेट'} · {formatShortTime(st.createdAt)}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 3. CALLS TAB (COMING SOON — AS REQUESTED) */}
            {activeTab === 'calls' && (
              <div className="p-6 text-center space-y-5">
                <div className="w-20 h-20 rounded-3xl bg-emerald-50 border border-emerald-200 mx-auto flex items-center justify-center gap-1.5 shadow-xs">
                  <Phone className="w-7 h-7 text-[#008069]" />
                  <Video className="w-7 h-7 text-[#008069]" />
                </div>
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-100 text-[#075E54] text-xs font-black">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Coming Soon</span>
                  </div>
                  <h3 className="text-lg font-extrabold text-slate-900">
                    ऑडियो एवं वीडियो कॉलिंग
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed max-w-xs mx-auto">
                    सिंगल कॉल और ग्रुप (बल्क) ऑडियो/वीडियो कॉलिंग सुविधा अगले अपडेट में शुरू की जाएगी।
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left space-y-2.5 text-xs text-slate-700">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">1-to-1 ऑडियो कॉल</span>
                    <span className="font-bold text-emerald-700">Coming Soon</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold">1-to-1 वीडियो कॉल</span>
                    <span className="font-bold text-emerald-700">Coming Soon</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold">ग्रुप / बल्क कॉल मीटिंग</span>
                    <span className="font-bold text-emerald-700">Coming Soon</span>
                  </div>
                </div>
              </div>
            )}

            {/* 4. ADMIN HUB MONITOR TAB (SEE EVERY RIDER-TO-RIDER CHAT & GROUP IN HUB) */}
            {activeTab === 'monitor' && isHubAdmin && (
              <div className="divide-y divide-slate-100">
                {monitorAllHubChats.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">
                    अभी आपके हब में कोई चैट रिकॉर्ड नहीं है।
                  </div>
                ) : (
                  monitorAllHubChats.map((chat) => {
                    const pairTitle = getMonitorChatPairTitle(chat);
                    const isRiderToRider =
                      chat.type === 'direct' && !chat.participantIds.includes(ADMIN_PARTICIPANT_ID);
                    const isSelected = selectedChatId === chat.id && isMonitorInspecting;

                    return (
                      <button
                        key={chat.id}
                        type="button"
                        onClick={() => {
                          setIsMonitorInspecting(true);
                          setSelectedChatId(chat.id);
                          setShowChatSearch(false);
                          setChatSearchQuery('');
                        }}
                        className={`w-full px-3.5 py-3 flex items-center gap-3 text-left transition cursor-pointer ${
                          isSelected ? 'bg-amber-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div
                          className="w-11 h-11 rounded-full text-white font-bold text-xs flex items-center justify-center shrink-0"
                          style={{
                            backgroundColor: isRiderToRider
                              ? '#b45309'
                              : chat.avatarColor || '#008069',
                          }}
                        >
                          {chat.type === 'group' ? <Users className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-slate-900 truncate">
                              {pairTitle}
                            </span>
                            <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">
                              {formatShortTime(chat.lastMessageAt)}
                            </span>
                          </div>
                          <div className="text-xs text-slate-600 truncate mt-0.5">
                            <span className="font-semibold text-slate-800">
                              {chat.lastMessageSenderName || 'मैसेज'}:
                            </span>{' '}
                            {chat.lastMessageText || 'कोई मैसेज नहीं'}
                          </div>
                          <div className="text-[10px] font-bold mt-0.5 text-amber-700">
                            {isRiderToRider
                              ? 'राइडर ↔ राइडर चैट'
                              : chat.type === 'group'
                              ? 'हब ग्रुप चैट'
                              : 'एडमिन ↔ राइडर चैट'}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Floating New Chat FAB (Mobile & Desktop inside Chats tab) */}
          {activeTab === 'chats' && (
            <div className="relative h-0">
              <button
                type="button"
                onClick={() => setIsNewChatOpen(true)}
                className="absolute bottom-4 right-4 w-13 h-13 rounded-2xl bg-[#008069] hover:bg-[#016a57] text-white shadow-xl flex items-center justify-center active:scale-95 transition cursor-pointer z-10"
                title="नई चैट / नया ग्रुप"
              >
                <MessageSquare className="w-6 h-6" />
              </button>
            </div>
          )}

          {/* Bottom Navigation Bar (WhatsApp Style) */}
          <nav
            className={`grid ${
              isHubAdmin ? 'grid-cols-4' : 'grid-cols-3'
            } border-t border-slate-200 bg-white shrink-0`}
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('chats')}
              className={`h-14 flex flex-col items-center justify-center gap-0.5 cursor-pointer relative ${
                activeTab === 'chats' ? 'text-[#008069] font-extrabold' : 'text-slate-500 font-semibold'
              }`}
            >
              <div className="relative">
                <MessageSquare className="w-5 h-5" />
                {totalUnreadChats > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[17px] h-[17px] px-1 rounded-full bg-[#25D366] text-white text-[10px] font-black flex items-center justify-center tabular-nums">
                    {totalUnreadChats > 99 ? '99+' : totalUnreadChats}
                  </span>
                )}
              </div>
              <span className="text-[11px]">चैट्स</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('updates')}
              className={`h-14 flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                activeTab === 'updates' ? 'text-[#008069] font-extrabold' : 'text-slate-500 font-semibold'
              }`}
            >
              <CircleDot className="w-5 h-5" />
              <span className="text-[11px]">स्टेटस</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('calls')}
              className={`h-14 flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                activeTab === 'calls' ? 'text-[#008069] font-extrabold' : 'text-slate-500 font-semibold'
              }`}
            >
              <Phone className="w-5 h-5" />
              <span className="text-[11px]">कॉल</span>
            </button>

            {isHubAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab('monitor')}
                className={`h-14 flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                  activeTab === 'monitor' ? 'text-amber-700 font-extrabold' : 'text-slate-500 font-semibold'
                }`}
              >
                <Eye className="w-5 h-5" />
                <span className="text-[11px]">निगरानी</span>
              </button>
            )}
          </nav>
        </aside>

        {/* ==================== RIGHT ACTIVE CHAT PANE (WHITE FLORAL WALLPAPER) ==================== */}
        <section
          className={`${
            activeChat ? 'flex' : 'hidden md:flex'
          } flex-1 flex-col min-w-0 min-h-0 relative`}
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.42), rgba(255,255,255,0.48)), url(${floralBgImg})`,
            backgroundSize: '380px auto',
            backgroundRepeat: 'repeat',
            backgroundPosition: 'center',
          }}
        >
          {!activeChat ? (
            /* Desktop Welcome Screen over White Floral Wallpaper */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="bg-white/90 backdrop-blur-sm border border-emerald-100 rounded-3xl p-8 max-w-md shadow-xl space-y-4">
                <div className="w-24 h-24 rounded-3xl overflow-hidden mx-auto shadow-lg ring-4 ring-emerald-50">
                  <img
                    src={kabiLogoImg}
                    alt="KabiTech Solution SMS"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <h2 className="text-xl font-black text-[#075E54]">KabiTech Solution SMS</h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  बाएँ से कोई भी राइडर, एडमिन या ग्रुप चुनें और तुरंत सुरक्षित रियल-टाइम मैसेज, फोटो, वॉइस नोट या बल्क SMS भेजें।
                </p>
                <div className="flex items-center justify-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsNewChatOpen(true)}
                    className="px-4 py-2.5 rounded-xl bg-[#008069] hover:bg-[#016a57] text-white text-xs font-bold cursor-pointer"
                  >
                    + नई चैट
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCreateGroupOpen(true)}
                    className="px-4 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-[#075E54] border border-emerald-200 text-xs font-bold cursor-pointer"
                  >
                    नया ग्रुप बनाएं
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* ACTIVE CHAT HEADER */}
              <header
                className="bg-[#008069] text-white px-2.5 sm:px-4 py-2.5 flex items-center justify-between gap-2 shrink-0 shadow-sm relative z-20"
                style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top, 0.625rem))' }}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedChatId(null);
                      setSelectedMsgMenu(null);
                      setShowChatOverflow(false);
                    }}
                    className="md:hidden w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center shrink-0 cursor-pointer"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (activeChat.type === 'group') setIsGroupInfoOpen(true);
                    }}
                    className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                  >
                    <div
                      className="w-10 h-10 rounded-full text-white font-bold text-sm flex items-center justify-center shrink-0 ring-2 ring-white/25"
                      style={{ backgroundColor: activeChat.avatarColor || pickAvatarColor(activeChat.id) }}
                    >
                      {activeChat.type === 'group' ? (
                        <Users className="w-5 h-5" />
                      ) : (
                        getInitials(activeChatTitle)
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-bold truncate leading-tight">
                        {activeChatTitle}
                      </div>
                      <div className="text-[11px] text-emerald-100 truncate">
                        {activeTypingText
                          ? activeTypingText
                          : isReadOnlyMonitorView
                          ? 'एडमिन निगरानी मोड (Live Audit)'
                          : activeChat.type === 'group'
                          ? `${activeChat.participantIds.length} सदस्य · जानकारी के लिए टैप करें`
                          : formatLastSeen(activePeerPresence)}
                      </div>
                    </div>
                  </button>
                </div>

                {/* Call Icons (Coming Soon) + Search + Menu */}
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setCallComingSoonMode('video')}
                    className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center cursor-pointer"
                    title="वीडियो कॉल (Coming Soon)"
                  >
                    <Video className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCallComingSoonMode('audio')}
                    className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center cursor-pointer"
                    title="ऑडियो कॉल (Coming Soon)"
                  >
                    <Phone className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowChatSearch((v) => !v);
                      setChatSearchQuery('');
                    }}
                    className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center cursor-pointer"
                    title="चैट में खोजें"
                  >
                    <Search className="w-4 h-4" />
                  </button>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowChatOverflow((v) => !v)}
                      className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center cursor-pointer"
                      title="अधिक विकल्प"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>

                    {showChatOverflow && (
                      <div
                        className="absolute right-0 top-11 w-52 bg-white text-slate-800 rounded-2xl shadow-2xl border border-slate-200 py-1.5 z-50 text-xs font-semibold"
                        onClick={() => setShowChatOverflow(false)}
                      >
                        {activeChat.type === 'group' && (
                          <button
                            type="button"
                            onClick={() => setIsGroupInfoOpen(true)}
                            className="w-full px-4 py-2.5 hover:bg-slate-50 flex items-center gap-2.5 text-left cursor-pointer"
                          >
                            <Users className="w-4 h-4 text-[#008069]" />
                            <span>ग्रुप जानकारी (Group Info)</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setIsStarredOpen(true)}
                          className="w-full px-4 py-2.5 hover:bg-slate-50 flex items-center gap-2.5 text-left cursor-pointer"
                        >
                          <Star className="w-4 h-4 text-amber-500" />
                          <span>स्टार किए गए मैसेज</span>
                        </button>
                        {!isReadOnlyMonitorView && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                togglePinChat(hubId, activeChat.id, me.id, Boolean(activeChat.pinnedBy?.[me.id]))
                              }
                              className="w-full px-4 py-2.5 hover:bg-slate-50 flex items-center gap-2.5 text-left cursor-pointer"
                            >
                              <Pin className="w-4 h-4 text-slate-600" />
                              <span>{activeChat.pinnedBy?.[me.id] ? 'पिन हटाएं' : 'चैट पिन करें'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                toggleMuteChat(hubId, activeChat.id, me.id, Boolean(activeChat.mutedBy?.[me.id]))
                              }
                              className="w-full px-4 py-2.5 hover:bg-slate-50 flex items-center gap-2.5 text-left cursor-pointer"
                            >
                              {activeChat.mutedBy?.[me.id] ? (
                                <>
                                  <Volume2 className="w-4 h-4 text-emerald-600" />
                                  <span>नोटिफिकेशन चालू करें</span>
                                </>
                              ) : (
                                <>
                                  <VolumeX className="w-4 h-4 text-slate-600" />
                                  <span>नोटिफिकेशन म्यूट करें</span>
                                </>
                              )}
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={handleExportChat}
                          className="w-full px-4 py-2.5 hover:bg-slate-50 flex items-center gap-2.5 text-left cursor-pointer"
                        >
                          <Download className="w-4 h-4 text-sky-600" />
                          <span>चैट एक्सपोर्ट करें (.txt)</span>
                        </button>
                        <div className="px-4 py-2 border-t border-slate-100 text-[10px] text-slate-500 leading-snug">
                          ऑटो-डिलीट: SMS <strong>365 दिन (1 साल)</strong> · फोटो/वीडियो <strong>5 माह (150 दिन)</strong>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </header>

              {/* Admin Monitor Banner */}
              {isReadOnlyMonitorView && (
                <div className="bg-amber-50/95 border-b border-amber-200 px-4 py-2 text-xs text-amber-900 flex items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <Eye className="w-4 h-4 text-amber-600 shrink-0" />
                    <span className="truncate font-semibold">
                      एडमिन निगरानी व्यू: आप <strong>{activeChatTitle}</strong> की पूरी बातचीत देख रहे हैं।
                    </span>
                  </div>
                </div>
              )}

              {/* In-Chat Search Bar */}
              {showChatSearch && (
                <div className="bg-white/95 border-b border-slate-200 px-3 py-2 flex items-center gap-2 shrink-0">
                  <Search className="w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    autoFocus
                    value={chatSearchQuery}
                    onChange={(e) => setChatSearchQuery(e.target.value)}
                    placeholder="इस चैट में मैसेज खोजें..."
                    className="flex-1 text-sm text-slate-900 focus:outline-none"
                  />
                  <span className="text-xs text-slate-500 tabular-nums">
                    {visibleMessages.length} मिले
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowChatSearch(false);
                      setChatSearchQuery('');
                    }}
                    className="p-1 text-slate-500 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* MESSAGES SCROLL AREA OVER WHITE FLORAL WALLPAPER */}
              <div
                className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-2 min-h-0"
                onClick={() => {
                  if (selectedMsgMenu) setSelectedMsgMenu(null);
                  if (showChatOverflow) setShowChatOverflow(false);
                }}
              >
                {visibleMessages.length === 0 ? (
                  <div className="my-12 mx-auto max-w-xs bg-white/90 backdrop-blur-xs border border-emerald-100 rounded-2xl px-4 py-3 text-center text-xs text-slate-600 shadow-xs">
                    <p className="font-bold text-[#075E54]">KabiTech Solution SMS</p>
                    <p className="mt-1">
                      यह बातचीत आपके हब में सुरक्षित है। पहला मैसेज लिखकर बात शुरू करें।
                    </p>
                  </div>
                ) : (
                  visibleMessages.map((msg, idx) => {
                    const prevMsg = idx > 0 ? visibleMessages[idx - 1] : null;
                    const showDateHeader =
                      !prevMsg ||
                      new Date(prevMsg.createdAt).toDateString() !==
                        new Date(msg.createdAt).toDateString();

                    if (msg.type === 'system') {
                      return (
                        <React.Fragment key={msg.id}>
                          {showDateHeader && (
                            <div className="flex justify-center my-3">
                              <span className="px-3 py-1 rounded-lg bg-white/92 border border-slate-200/80 text-[11px] font-bold text-slate-600 shadow-2xs">
                                {formatDateDivider(msg.createdAt)}
                              </span>
                            </div>
                          )}
                          <div className="flex justify-center my-1.5">
                            <span className="px-3 py-1 rounded-xl bg-emerald-50/95 border border-emerald-200/70 text-[11px] font-semibold text-emerald-900 shadow-2xs text-center">
                              {msg.text}
                            </span>
                          </div>
                        </React.Fragment>
                      );
                    }

                    const isMine = msg.senderId === me.id;
                    const otherParticipants = activeChat.participantIds.filter((pid) => pid !== msg.senderId);
                    const isReadByOther =
                      otherParticipants.length > 0 &&
                      otherParticipants.some((pid) => Boolean(msg.readBy?.[pid]));

                    const reactionsList = Object.values(msg.reactions || {}).filter(Boolean);
                    const isStarred = Boolean(msg.starredBy?.[me.id]);

                    return (
                      <React.Fragment key={msg.id}>
                        {showDateHeader && (
                          <div className="flex justify-center my-3">
                            <span className="px-3 py-1 rounded-lg bg-white/92 border border-slate-200/80 text-[11px] font-bold text-slate-600 shadow-2xs">
                              {formatDateDivider(msg.createdAt)}
                            </span>
                          </div>
                        )}

                        <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedMsgMenu((cur) => (cur?.id === msg.id ? null : msg));
                            }}
                            className={`relative max-w-[84%] sm:max-w-[68%] rounded-2xl px-3 py-2 shadow-sm cursor-pointer transition-shadow ${
                              isMine
                                ? 'bg-[#D9FDD3] text-slate-900 rounded-tr-sm border border-emerald-200/80'
                                : 'bg-white text-slate-900 rounded-tl-sm border border-slate-200/90'
                            } ${selectedMsgMenu?.id === msg.id ? 'ring-2 ring-[#008069]' : ''}`}
                          >
                            {/* Sender name in Group chats or Monitor mode */}
                            {(!isMine || isReadOnlyMonitorView) &&
                              (activeChat.type === 'group' || isReadOnlyMonitorView) && (
                                <div
                                  className="text-[11px] font-extrabold mb-0.5"
                                  style={{ color: pickAvatarColor(msg.senderId) }}
                                >
                                  {msg.senderName}
                                </div>
                              )}

                            {/* Forwarded Indicator */}
                            {msg.forwarded && !msg.deletedForEveryone && (
                              <div className="text-[10px] italic text-slate-500 flex items-center gap-1 mb-0.5">
                                <Forward className="w-3 h-3" />
                                <span>फॉरवर्ड किया गया (Forwarded)</span>
                              </div>
                            )}

                            {/* Quoted Reply Preview */}
                            {msg.replyTo && !msg.deletedForEveryone && (
                              <div className="mb-1.5 rounded-lg bg-black/5 px-2.5 py-1.5 border border-black/10 text-xs">
                                <div className="font-bold text-[#008069] truncate">
                                  {msg.replyTo.senderName}
                                </div>
                                <div className="text-slate-600 truncate">
                                  {msg.replyTo.text ||
                                    (msg.replyTo.type === 'image'
                                      ? '📷 HD फोटो'
                                      : msg.replyTo.type === 'video'
                                      ? '🎬 वीडियो'
                                      : '🎤 वॉइस नोट')}
                                </div>
                              </div>
                            )}

                            {/* Message Body */}
                            {msg.deletedForEveryone ? (
                              <div className="text-xs italic text-slate-500 py-0.5">
                                🚫 यह मैसेज डिलीट कर दिया गया है
                              </div>
                            ) : (
                              <>
                                {msg.imageDataUrl && (
                                  <div className="mb-1.5">
                                    <img
                                      src={msg.imageDataUrl}
                                      alt="HD Photo message"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setLightboxImage(msg.imageDataUrl || null);
                                      }}
                                      className="rounded-xl max-h-64 w-full object-cover border border-black/10 cursor-zoom-in"
                                    />
                                    {msg.compressedSizeBytes && (
                                      <div className="text-[10px] text-slate-500 mt-0.5 tabular-nums">
                                        HD · {formatBytesReadable(msg.compressedSizeBytes)}
                                        {msg.originalSizeBytes && msg.originalSizeBytes > msg.compressedSizeBytes
                                          ? ` (${formatBytesReadable(msg.originalSizeBytes)} से कंप्रेस्ड)`
                                          : ''}
                                      </div>
                                    )}
                                  </div>
                                )}
                                {msg.videoDataUrl && (
                                  <div className="mb-1.5" onClick={(e) => e.stopPropagation()}>
                                    <video
                                      controls
                                      playsInline
                                      preload="metadata"
                                      src={msg.videoDataUrl}
                                      className="rounded-xl max-h-64 w-full bg-black border border-black/10"
                                    />
                                    {msg.compressedSizeBytes && (
                                      <div className="text-[10px] text-slate-500 mt-0.5 tabular-nums">
                                        वीडियो{msg.videoDurationSec ? ` (${msg.videoDurationSec}s)` : ''} · {formatBytesReadable(msg.compressedSizeBytes)}
                                        {msg.originalSizeBytes && msg.originalSizeBytes > msg.compressedSizeBytes
                                          ? ` (${formatBytesReadable(msg.originalSizeBytes)} से कंप्रेस्ड)`
                                          : ''}
                                      </div>
                                    )}
                                  </div>
                                )}
                                {msg.audioDataUrl && (
                                  <div className="py-1" onClick={(e) => e.stopPropagation()}>
                                    <audio
                                      controls
                                      src={msg.audioDataUrl}
                                      className="h-9 max-w-[230px] sm:max-w-[260px]"
                                    />
                                  </div>
                                )}
                                {msg.text && (
                                  <div className="text-[14.5px] leading-snug whitespace-pre-wrap break-words">
                                    {msg.text}
                                  </div>
                                )}
                              </>
                            )}

                            {/* Timestamp + Star + Edited + Double Blue Ticks */}
                            <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-slate-500 select-none">
                              {isStarred && <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-500" />}
                              {msg.editedAt && !msg.deletedForEveryone && <span>संपादित</span>}
                              <span className="tabular-nums">{formatBubbleTime(msg.createdAt)}</span>
                              {isMine && !msg.deletedForEveryone && (
                                isReadByOther ? (
                                  <CheckCheck className="w-3.5 h-3.5 text-[#53BDEB]" />
                                ) : (
                                  <Check className="w-3.5 h-3.5 text-slate-400" />
                                )
                              )}
                            </div>

                            {/* Reactions Pill below bubble */}
                            {reactionsList.length > 0 && !msg.deletedForEveryone && (
                              <div className="flex items-center gap-0.5 mt-1 -mb-1">
                                <span className="px-1.5 py-0.5 rounded-full bg-white border border-slate-200 shadow-2xs text-xs">
                                  {reactionsList.slice(0, 5).join('')}
                                  {reactionsList.length > 1 ? ` ${reactionsList.length}` : ''}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* MESSAGE CONTEXT ACTION BAR (When any bubble is tapped) */}
              {selectedMsgMenu && (
                <div className="bg-white border-t border-slate-200 px-3 py-2.5 shadow-xl space-y-2 shrink-0 z-20">
                  {!selectedMsgMenu.deletedForEveryone && !isReadOnlyMonitorView && (
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5">
                        {['👍', '❤️', '😂', '😮', '🙏', '✅'].map((em) => (
                          <button
                            key={em}
                            type="button"
                            onClick={() => {
                              toggleMessageReaction(
                                hubId,
                                activeChat.id,
                                selectedMsgMenu.id,
                                me.id,
                                em,
                                selectedMsgMenu.reactions?.[me.id]
                              );
                              setSelectedMsgMenu(null);
                            }}
                            className="w-9 h-9 rounded-full hover:bg-slate-100 text-lg flex items-center justify-center cursor-pointer active:scale-110 transition"
                          >
                            {em}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedMsgMenu(null)}
                        className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 flex-wrap text-xs font-bold">
                    {!isReadOnlyMonitorView && !selectedMsgMenu.deletedForEveryone && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setReplyTo({
                              id: selectedMsgMenu.id,
                              senderName: selectedMsgMenu.senderName,
                              text: selectedMsgMenu.text,
                              type: selectedMsgMenu.type,
                            });
                            setSelectedMsgMenu(null);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center gap-1 cursor-pointer"
                        >
                          <Reply className="w-3.5 h-3.5" /> रिप्लाई
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setForwardMsg(selectedMsgMenu);
                            setSelectedMsgMenu(null);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center gap-1 cursor-pointer"
                        >
                          <Forward className="w-3.5 h-3.5" /> फॉरवर्ड
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            toggleStarMessage(
                              hubId,
                              activeChat.id,
                              selectedMsgMenu.id,
                              me.id,
                              Boolean(selectedMsgMenu.starredBy?.[me.id])
                            );
                            setSelectedMsgMenu(null);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center gap-1 cursor-pointer"
                        >
                          <Star className="w-3.5 h-3.5 text-amber-500" /> स्टार
                        </button>
                      </>
                    )}

                    {selectedMsgMenu.text && !selectedMsgMenu.deletedForEveryone && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(selectedMsgMenu.text).catch(() => {});
                          showTempToast('मैसेज कॉपी हो गया');
                          setSelectedMsgMenu(null);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" /> कॉपी
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setInfoMsg(selectedMsgMenu);
                        setSelectedMsgMenu(null);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center gap-1 cursor-pointer"
                    >
                      <Info className="w-3.5 h-3.5 text-sky-600" /> जानकारी
                    </button>

                    {selectedMsgMenu.senderId === me.id &&
                      selectedMsgMenu.type === 'text' &&
                      !selectedMsgMenu.deletedForEveryone && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingMsg(selectedMsgMenu);
                            setInputText(selectedMsgMenu.text);
                            setSelectedMsgMenu(null);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center gap-1 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" /> एडिट
                        </button>
                      )}

                    {!isReadOnlyMonitorView && (
                      <button
                        type="button"
                        onClick={() => {
                          deleteMessageForMe(hubId, activeChat.id, selectedMsgMenu.id, me.id);
                          setSelectedMsgMenu(null);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> मेरे लिए हटाएं
                      </button>
                    )}

                    {(selectedMsgMenu.senderId === me.id || isHubAdmin) &&
                      !selectedMsgMenu.deletedForEveryone && (
                        <button
                          type="button"
                          onClick={() => {
                            deleteMessageForEveryone(hubId, activeChat.id, selectedMsgMenu.id);
                            setSelectedMsgMenu(null);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> सबके लिए डिलीट
                        </button>
                      )}
                  </div>
                </div>
              )}

              {/* COMPOSER BAR (Hidden in Read-Only Admin Monitor View) */}
              {!isReadOnlyMonitorView && (
                <div
                  className="bg-[#F0F2F5]/95 backdrop-blur-xs border-t border-slate-200 px-2.5 py-2 shrink-0 space-y-2"
                  style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0.5rem))' }}
                >
                  {/* Reply or Edit Preview */}
                  {(replyTo || editingMsg) && (
                    <div className="bg-white rounded-xl px-3 py-2 border border-emerald-200 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <div className="font-bold text-[#008069]">
                          {editingMsg ? 'मैसेज एडिट करें' : `रिप्लाई: ${replyTo?.senderName}`}
                        </div>
                        <div className="text-slate-600 truncate">
                          {editingMsg
                            ? editingMsg.text
                            : replyTo?.text ||
                              (replyTo?.type === 'image'
                                ? '📷 HD फोटो'
                                : replyTo?.type === 'video'
                                ? '🎬 वीडियो'
                                : '🎤 वॉइस नोट')}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setReplyTo(null);
                          setEditingMsg(null);
                          if (editingMsg) setInputText('');
                        }}
                        className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Smart Compression Progress Bar */}
                  {compressingState && (
                    <div className="bg-emerald-50 rounded-xl p-2.5 border border-emerald-200 space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-bold text-emerald-900">
                        <span>
                          {compressingState.kind === 'video'
                            ? 'वीडियो ऑटो-कंप्रेस हो रहा है (क्वालिटी सुरक्षित रखकर MB घटाया जा रहा है)...'
                            : 'HD फोटो ऑटो-कंप्रेस हो रही है...'}
                        </span>
                        <span className="tabular-nums">{compressingState.percent}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-emerald-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#008069] transition-all duration-200"
                          style={{ width: `${compressingState.percent}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Pending HD Photo or Compressed Video Preview */}
                  {pendingMedia && !compressingState && (
                    <div className="bg-white rounded-xl p-2 border border-emerald-200 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {pendingMedia.kind === 'image' ? (
                          <img
                            src={pendingMedia.dataUrl}
                            alt="Ready to send"
                            className="w-14 h-14 rounded-lg object-cover border border-slate-200 shrink-0"
                          />
                        ) : (
                          <video
                            src={pendingMedia.dataUrl}
                            className="w-16 h-14 rounded-lg object-cover bg-black border border-slate-200 shrink-0"
                            muted
                          />
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-800 truncate">
                            {pendingMedia.kind === 'video'
                              ? `वीडियो तैयार (${pendingMedia.durationSec || 1}s)`
                              : 'HD फोटो भेजने के लिए तैयार'}
                          </div>
                          <div className="text-[11px] text-emerald-700 font-semibold tabular-nums">
                            {formatBytesReadable(pendingMedia.originalBytes)} → {formatBytesReadable(pendingMedia.compressedBytes)} (ऑटो-कंप्रेस्ड)
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPendingMedia(null)}
                        className="w-8 h-8 rounded-full hover:bg-slate-100 text-red-500 flex items-center justify-center shrink-0 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Emoji Picker Tray */}
                  {showEmojiPicker && (
                    <div className="bg-white rounded-2xl p-2.5 border border-slate-200 shadow-md flex flex-wrap gap-1.5">
                      {QUICK_EMOJIS.map((em) => (
                        <button
                          key={em}
                          type="button"
                          onClick={() => setInputText((prev) => prev + em)}
                          className="w-9 h-9 rounded-lg hover:bg-slate-100 text-xl flex items-center justify-center cursor-pointer"
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Quick Hindi Courier Templates Tray */}
                  {showQuickTemplates && (
                    <div className="bg-white rounded-2xl p-2 border border-slate-200 shadow-md max-h-40 overflow-y-auto divide-y divide-slate-100">
                      {QUICK_TEMPLATES.map((tpl) => (
                        <button
                          key={tpl}
                          type="button"
                          onClick={() => {
                            setInputText(tpl);
                            setShowQuickTemplates(false);
                          }}
                          className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-800 hover:bg-emerald-50 rounded-lg cursor-pointer"
                        >
                          {tpl}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Main Input Row */}
                  <div className="flex items-end gap-1.5 sm:gap-2 min-w-0">
                    <div className="flex-1 min-w-0 bg-white rounded-3xl border border-slate-200 px-1.5 sm:px-2 py-1 flex items-center gap-0.5 sm:gap-1 shadow-2xs">
                      <button
                        type="button"
                        onClick={() => {
                          setShowEmojiPicker((v) => !v);
                          setShowQuickTemplates(false);
                        }}
                        className="w-8 h-8 sm:w-9 sm:h-9 rounded-full hover:bg-slate-100 text-slate-500 flex items-center justify-center shrink-0 cursor-pointer"
                        title="इमोजी"
                      >
                        <Smile className="w-5 h-5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowQuickTemplates((v) => !v);
                          setShowEmojiPicker(false);
                        }}
                        className="w-8 h-8 sm:w-9 sm:h-9 rounded-full hover:bg-slate-100 text-[#008069] flex items-center justify-center shrink-0 cursor-pointer"
                        title="त्वरित टेम्पलेट (Quick Templates)"
                      >
                        <Sparkles className="w-4 h-4" />
                      </button>

                      {isRecording ? (
                        <div className="flex-1 min-w-0 px-2 py-2 text-xs font-bold text-red-600 flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse shrink-0" />
                          <span className="truncate">वॉइस रिकॉर्डिंग... {recordSeconds}s</span>
                        </div>
                      ) : (
                        <textarea
                          rows={1}
                          value={inputText}
                          onChange={(e) => handleInputChange(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSend();
                            }
                          }}
                          placeholder="मैसेज लिखें..."
                          className="flex-1 min-w-0 w-full max-h-28 py-2 px-1 text-sm text-slate-900 placeholder-slate-400 focus:outline-none resize-none bg-transparent"
                        />
                      )}

                      <label
                        className="w-8 h-8 sm:w-9 sm:h-9 rounded-full hover:bg-slate-100 text-slate-500 flex items-center justify-center shrink-0 cursor-pointer"
                        title="HD फोटो भेजें (ऑटो MB कम्प्रेशन)"
                      >
                        <Paperclip className="w-4 h-4 sm:w-5 sm:h-5" />
                        <input type="file" accept="image/*" onChange={handlePickPhoto} className="hidden" />
                      </label>

                      <label
                        className="w-8 h-8 sm:w-9 sm:h-9 rounded-full hover:bg-slate-100 text-slate-500 flex items-center justify-center shrink-0 cursor-pointer"
                        title="वीडियो भेजें (ऑटो MB कम्प्रेशन)"
                      >
                        <Film className="w-4 h-4 sm:w-5 sm:h-5" />
                        <input type="file" accept="video/*" onChange={handlePickVideo} className="hidden" />
                      </label>

                      <label
                        className="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-500 hidden sm:flex items-center justify-center shrink-0 cursor-pointer"
                        title="कैमरा फोटो"
                      >
                        <Camera className="w-5 h-5" />
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={handlePickPhoto}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {inputText.trim() || pendingMedia ? (
                      <button
                        type="button"
                        disabled={isSendingMsg || Boolean(compressingState)}
                        onClick={handleSend}
                        className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[#008069] hover:bg-[#016a57] text-white shadow-md flex items-center justify-center shrink-0 active:scale-95 transition cursor-pointer"
                        title="भेजें"
                      >
                        <Send className="w-5 h-5" />
                      </button>
                    ) : isRecording ? (
                      <button
                        type="button"
                        onClick={stopVoiceRecording}
                        className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-md flex items-center justify-center shrink-0 active:scale-95 transition cursor-pointer"
                        title="रिकॉर्डिंग रोकें और भेजें"
                      >
                        <Square className="w-5 h-5 fill-white" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={startVoiceRecording}
                        className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[#008069] hover:bg-[#016a57] text-white shadow-md flex items-center justify-center shrink-0 active:scale-95 transition cursor-pointer"
                        title="वॉइस नोट रिकॉर्ड करें"
                      >
                        <Mic className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* FULL-SCREEN IMAGE LIGHTBOX */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[140] bg-black/92 flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={lightboxImage}
            alt="Full view"
            className="max-w-full max-h-[88vh] rounded-2xl object-contain shadow-2xl"
          />
        </div>
      )}

      {/* ALL MODALS */}
      <CallComingSoonModal
        mode={callComingSoonMode}
        targetName={activeChatTitle}
        onClose={() => setCallComingSoonMode(null)}
      />

      <NewChatModal
        open={isNewChatOpen}
        me={me}
        contacts={hubContacts}
        isAdmin={isHubAdmin}
        onSelectContact={handleStartDirectChat}
        onOpenCreateGroup={() => setIsCreateGroupOpen(true)}
        onOpenBulkBroadcast={() => setIsBulkBroadcastOpen(true)}
        onClose={() => setIsNewChatOpen(false)}
      />

      <CreateGroupModal
        open={isCreateGroupOpen}
        me={me}
        contacts={hubContacts}
        onCreate={async (name, desc, members) => {
          const grp = await createGroupChat({
            hubId,
            creator: me,
            groupName: name,
            description: desc,
            members,
          });
          setLocalChatCache((prev) => ({ ...prev, [grp.id]: grp }));
          setIsMonitorInspecting(false);
          setActiveTab('chats');
          setSelectedChatId(grp.id);
          showTempToast(`ग्रुप "${name}" बन गया`);
        }}
        onClose={() => setIsCreateGroupOpen(false)}
      />

      <BulkBroadcastModal
        open={isBulkBroadcastOpen}
        contacts={hubContacts}
        onSendBroadcast={async (recipients, text, imgUrl) => {
          const count = await sendBulkBroadcastMessage({
            hubId,
            sender: me,
            recipients,
            text,
            imageDataUrl: imgUrl,
          });
          playKabiSmsSendTone();
          showTempToast(`${count} राइडर्स को बल्क SMS भेज दिया गया`);
        }}
        onClose={() => setIsBulkBroadcastOpen(false)}
      />

      <GroupInfoModal
        open={isGroupInfoOpen}
        chat={activeChat}
        me={me}
        allContacts={hubContacts}
        isHubAdmin={isHubAdmin}
        onUpdateDetails={async (name, desc) => {
          if (!activeChat) return;
          await updateGroupDetails(hubId, activeChat.id, me, name, desc);
          showTempToast('ग्रुप जानकारी अपडेट हो गई');
        }}
        onAddMembers={async (newMembers) => {
          if (!activeChat) return;
          await addGroupMembers(hubId, activeChat, me, newMembers);
          showTempToast('सदस्य जोड़े गए');
        }}
        onRemoveMember={async (targetId) => {
          if (!activeChat) return;
          await removeGroupMember(hubId, activeChat, me, targetId);
          showTempToast('ग्रुप सदस्य अपडेट हुए');
        }}
        onClose={() => setIsGroupInfoOpen(false)}
      />

      <ForwardMessageModal
        message={forwardMsg}
        chats={myChats}
        contacts={hubContacts}
        me={me}
        onForwardToChat={async (targetChat) => {
          if (!forwardMsg) return;
          await sendChatMessage({
            hubId,
            chat: targetChat,
            sender: me,
            text: forwardMsg.text,
            type: forwardMsg.type === 'system' ? 'text' : forwardMsg.type,
            imageDataUrl: forwardMsg.imageDataUrl,
            videoDataUrl: forwardMsg.videoDataUrl,
            videoDurationSec: forwardMsg.videoDurationSec,
            audioDataUrl: forwardMsg.audioDataUrl,
            audioDurationSec: forwardMsg.audioDurationSec,
            forwarded: true,
          });
          playKabiSmsSendTone();
          showTempToast('मैसेज फॉरवर्ड हो गया');
        }}
        onForwardToContact={async (ct) => {
          if (!forwardMsg) return;
          const targetChat = await getOrCreateDirectChat(hubId, me, ct);
          await sendChatMessage({
            hubId,
            chat: targetChat,
            sender: me,
            text: forwardMsg.text,
            type: forwardMsg.type === 'system' ? 'text' : forwardMsg.type,
            imageDataUrl: forwardMsg.imageDataUrl,
            videoDataUrl: forwardMsg.videoDataUrl,
            videoDurationSec: forwardMsg.videoDurationSec,
            audioDataUrl: forwardMsg.audioDataUrl,
            audioDurationSec: forwardMsg.audioDurationSec,
            forwarded: true,
          });
          playKabiSmsSendTone();
          showTempToast(`${ct.name} को फॉरवर्ड हो गया`);
        }}
        onClose={() => setForwardMsg(null)}
      />

      <MessageInfoModal message={infoMsg} chat={activeChat} onClose={() => setInfoMsg(null)} />

      <StarredMessagesModal
        open={isStarredOpen}
        messages={messages}
        myId={me.id}
        onUnstar={(m) => {
          if (!activeChat) return;
          toggleStarMessage(hubId, activeChat.id, m.id, me.id, true);
        }}
        onClose={() => setIsStarredOpen(false)}
      />

      <StatusComposerModal
        open={isStatusComposerOpen}
        onPost={async (text, bgColor, imageDataUrl) => {
          await postHubStatus({ hubId, author: me, text, bgColor, imageDataUrl });
          showTempToast('स्टेटस पोस्ट हो गया (24 घंटे के लिए)');
        }}
        onClose={() => setIsStatusComposerOpen(false)}
      />

      <StatusViewerModal
        status={viewingStatus}
        canDelete={Boolean(
          viewingStatus && (viewingStatus.authorId === me.id || isHubAdmin)
        )}
        onDelete={async (id) => {
          await deleteHubStatus(hubId, id);
          showTempToast('स्टेटस हटाया गया');
        }}
        onClose={() => setViewingStatus(null)}
      />
    </div>
  );
};
