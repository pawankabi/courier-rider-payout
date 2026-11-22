import { useEffect, useMemo, useRef, useState } from 'react';
import {
  KabiChat,
  KabiParticipant,
  getChatDisplayTitle,
  subscribeToHubChats,
  updateMyPresence,
} from '../services/kabiChatService';
import {
  clearNativeBackgroundChatSync,
  configureNativeBackgroundChatSync,
  initKabiAudioUnlock,
  requestKabiNotificationPermission,
  syncAppUnreadBadge,
  triggerIncomingKabiNotification,
} from '../services/kabiChatNotification';

export interface IncomingKabiBanner {
  chatId: string;
  senderName: string;
  chatTitle: string;
  messageText: string;
  timestamp: number;
}

interface UseKabiChatNotificationsParams {
  hubId: string;
  me: KabiParticipant | null;
  isKabiAppOpen: boolean;
  activeChatId?: string | null;
}

export function useKabiChatNotifications({
  hubId,
  me,
  isKabiAppOpen,
  activeChatId,
}: UseKabiChatNotificationsParams) {
  const [hubChats, setHubChats] = useState<KabiChat[]>([]);
  const [incomingBanner, setIncomingBanner] = useState<IncomingKabiBanner | null>(null);

  const initializedRef = useRef(false);
  const lastSeenMsgAtByChatRef = useRef<Record<string, number>>({});
  const isKabiAppOpenRef = useRef(isKabiAppOpen);
  const activeChatIdRef = useRef(activeChatId);
  isKabiAppOpenRef.current = isKabiAppOpen;
  activeChatIdRef.current = activeChatId;

  const myId = me?.id || '';

  // Unlock audio on first gesture & configure native Android background sync
  useEffect(() => {
    initKabiAudioUnlock();
  }, []);

  useEffect(() => {
    if (!hubId || !myId) {
      clearNativeBackgroundChatSync();
      return;
    }
    configureNativeBackgroundChatSync(hubId, myId);
    // Request notification permission politely once per session
    requestKabiNotificationPermission().catch(() => {});
  }, [hubId, myId]);

  // Online / Last-seen presence heartbeat
  useEffect(() => {
    if (!hubId || !me?.id) return;
    updateMyPresence(hubId, me, true);
    const interval = window.setInterval(() => {
      if (!document.hidden) {
        updateMyPresence(hubId, me, true);
      }
    }, 45000);

    const handleVisibility = () => {
      updateMyPresence(hubId, me, !document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      updateMyPresence(hubId, me, false);
    };
  }, [hubId, me?.id, me?.name, me?.role]);

  // Real-time Hub Chats Listener -> computes unread badge + fires tone + native notification!
  useEffect(() => {
    initializedRef.current = false;
    lastSeenMsgAtByChatRef.current = {};

    if (!hubId || !myId) {
      setHubChats([]);
      syncAppUnreadBadge(0);
      return;
    }

    const unsub = subscribeToHubChats(hubId, (chats) => {
      setHubChats(chats);

      // Compute my unread counts across chats where I am a participant
      let totalUnread = 0;
      let newestAlertChat: KabiChat | null = null;

      for (const chat of chats) {
        if (!chat.participantIds?.includes(myId)) continue;
        const count = Number(chat.unreadCounts?.[myId] || 0);
        if (count > 0) {
          totalUnread += count;
        }

        const prevAt = lastSeenMsgAtByChatRef.current[chat.id] || 0;
        const currAt = Number(chat.lastMessageAt || 0);

        if (initializedRef.current && currAt > prevAt && count > 0) {
          const isFromOther = chat.lastMessageSenderId && chat.lastMessageSenderId !== myId;
          const isMuted = Boolean(chat.mutedBy?.[myId]);
          const isCurrentlyViewingThisChat =
            isKabiAppOpenRef.current && activeChatIdRef.current === chat.id && !document.hidden;

          if (isFromOther && !isMuted && !isCurrentlyViewingThisChat) {
            if (!newestAlertChat || currAt > (newestAlertChat.lastMessageAt || 0)) {
              newestAlertChat = chat;
            }
          }
        }
        lastSeenMsgAtByChatRef.current[chat.id] = Math.max(prevAt, currAt);
      }

      initializedRef.current = true;

      if (newestAlertChat) {
        const chatTitle = getChatDisplayTitle(newestAlertChat, myId);
        const senderLabel =
          newestAlertChat.type === 'group'
            ? `${newestAlertChat.lastMessageSenderName || 'सदस्य'} (${chatTitle})`
            : newestAlertChat.lastMessageSenderName || chatTitle;
        const bodyText = newestAlertChat.lastMessageText || 'नया मैसेज आया है';

        triggerIncomingKabiNotification({
          senderName: senderLabel,
          messageText: bodyText,
          chatId: newestAlertChat.id,
          totalUnread,
          playAudioTone: true,
          showSystemBanner: !isKabiAppOpenRef.current || document.hidden,
        });

        if (!isKabiAppOpenRef.current) {
          setIncomingBanner({
            chatId: newestAlertChat.id,
            senderName: senderLabel,
            chatTitle,
            messageText: bodyText,
            timestamp: newestAlertChat.lastMessageAt || Date.now(),
          });
        }
      } else {
        syncAppUnreadBadge(totalUnread);
      }
    });

    return () => unsub();
  }, [hubId, myId]);

  // Auto-dismiss floating incoming banner after 6.5 seconds
  useEffect(() => {
    if (!incomingBanner) return;
    const t = window.setTimeout(() => setIncomingBanner(null), 6500);
    return () => window.clearTimeout(t);
  }, [incomingBanner]);

  const myChats = useMemo(() => {
    if (!myId) return [];
    return hubChats.filter((c) => c.participantIds?.includes(myId));
  }, [hubChats, myId]);

  const totalUnreadCount = useMemo(() => {
    if (!myId) return 0;
    return myChats.reduce((sum, c) => sum + Math.max(0, Number(c.unreadCounts?.[myId] || 0)), 0);
  }, [myChats, myId]);

  return {
    hubChats,
    myChats,
    totalUnreadCount,
    incomingBanner,
    dismissIncomingBanner: () => setIncomingBanner(null),
  };
}
