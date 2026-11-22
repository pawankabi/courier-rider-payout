import React from 'react';
import { X, MessageSquare } from 'lucide-react';
import kabiLogoImg from '../../assets/images/kabitech_sms_3d_logo_1795276676617.jpg';
import { IncomingKabiBanner } from '../../hooks/useKabiChatNotifications';

interface LauncherProps {
  unreadCount: number;
  onClick: () => void;
  variant?: 'header-dark' | 'header-light' | 'strip-dark' | 'rider-tab';
  className?: string;
}

export const KabiSmsLauncherButton: React.FC<LauncherProps> = ({
  unreadCount,
  onClick,
  variant = 'header-dark',
  className = '',
}) => {
  const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount);

  if (variant === 'rider-tab') {
    return (
      <button
        type="button"
        id="kabi-sms-rider-tab-btn"
        onClick={onClick}
        className={`relative min-w-0 w-full py-2.5 px-2.5 sm:px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-xs ${className}`}
        title="KabiTech Solution SMS खोलें"
      >
        <span className="relative inline-flex items-center justify-center w-6 h-6 rounded-lg overflow-hidden shadow-sm shrink-0 bg-emerald-700">
          <img
            src={kabiLogoImg}
            alt="KabiTech Solution SMS"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        </span>
        <span className="truncate font-extrabold">KabiTech Solution SMS</span>
        {unreadCount > 0 && (
          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-600 text-white text-[11px] font-black flex items-center justify-center shadow-md tabular-nums shrink-0">
            {badgeLabel}
          </span>
        )}
      </button>
    );
  }

  if (variant === 'strip-dark') {
    return (
      <button
        type="button"
        id="kabi-sms-strip-btn"
        onClick={onClick}
        className={`relative px-2 py-0.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-400/50 flex items-center gap-1 font-bold transition active:scale-95 cursor-pointer text-[11px] shadow-sm whitespace-nowrap ${className}`}
        title="KabiTech Solution SMS खोलें"
      >
        <img
          src={kabiLogoImg}
          alt="KabiTech SMS"
          referrerPolicy="no-referrer"
          className="w-3.5 h-3.5 rounded object-cover shadow-xs shrink-0"
        />
        <span>KabiTech SMS</span>
        {unreadCount > 0 && (
          <span className="min-w-[16px] h-[16px] px-1 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center leading-none shadow-md tabular-nums">
            {badgeLabel}
          </span>
        )}
      </button>
    );
  }

  const isLight = variant === 'header-light';

  return (
    <button
      type="button"
      id="kabi-sms-header-launcher-btn"
      onClick={onClick}
      className={`relative group flex items-center gap-1.5 p-1 sm:px-2.5 sm:py-1.5 rounded-xl border transition-all active:scale-95 cursor-pointer shadow-sm shrink-0 min-h-[34px] sm:min-h-[38px] ${
        isLight
          ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-900'
          : 'bg-emerald-950/80 hover:bg-emerald-900/90 border-emerald-500/40 text-emerald-100'
      } ${className}`}
      title="KabiTech Solution SMS खोलें"
    >
      <div className="relative w-6 h-6 sm:w-7 sm:h-7 rounded-lg overflow-hidden shadow-md ring-1 ring-emerald-400/40 shrink-0 transform transition-transform duration-200 group-hover:scale-105 group-hover:-rotate-3 bg-emerald-700 flex items-center justify-center">
        <img
          src={kabiLogoImg}
          alt="KabiTech Solution SMS"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
      </div>
      <div className="hidden md:flex flex-col items-start leading-none">
        <span className={`text-[11px] font-extrabold whitespace-nowrap ${isLight ? 'text-emerald-900' : 'text-white'}`}>
          KabiTech SMS
        </span>
        <span className={`text-[9px] font-semibold whitespace-nowrap ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`}>
          {unreadCount > 0 ? `${unreadCount} नया मैसेज` : 'चैट खोलें'}
        </span>
      </div>
      {unreadCount > 0 && (
        <span
          aria-label={`${unreadCount} अपठित मैसेज`}
          className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center shadow-lg ring-2 ring-white tabular-nums"
        >
          {badgeLabel}
        </span>
      )}
    </button>
  );
};

interface IncomingBannerProps {
  banner: IncomingKabiBanner | null;
  onOpenChat: (chatId: string) => void;
  onDismiss: () => void;
}

export const KabiSmsIncomingBanner: React.FC<IncomingBannerProps> = ({
  banner,
  onOpenChat,
  onDismiss,
}) => {
  if (!banner) return null;

  return (
    <div
      className="fixed top-3 left-3 right-3 sm:left-auto sm:right-4 sm:w-[370px] z-[120] bg-white text-slate-900 rounded-2xl shadow-2xl border border-emerald-200 p-3 flex items-center gap-3 cursor-pointer transition-transform active:scale-[0.99]"
      style={{ top: 'max(0.75rem, env(safe-area-inset-top, 0.75rem))' }}
      onClick={() => onOpenChat(banner.chatId)}
      role="alert"
    >
      <div className="w-11 h-11 rounded-xl overflow-hidden shadow-md shrink-0 bg-emerald-700 flex items-center justify-center ring-1 ring-emerald-200">
        <img
          src={kabiLogoImg}
          alt="KabiTech Solution SMS"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700">
          <MessageSquare className="w-3 h-3 shrink-0" />
          <span className="truncate">KabiTech Solution SMS</span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-500 font-medium shrink-0">अभी</span>
        </div>
        <div className="text-sm font-extrabold text-slate-900 truncate">{banner.senderName}</div>
        <div className="text-xs text-slate-600 truncate">{banner.messageText}</div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center shrink-0 cursor-pointer"
        aria-label="बंद करें"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
