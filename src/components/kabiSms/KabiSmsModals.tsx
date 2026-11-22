import React, { useMemo, useState } from 'react';
import {
  X,
  Search,
  Users,
  Check,
  Send,
  Phone,
  Video,
  Clock,
  Star,
  UserPlus,
  UserMinus,
  LogOut,
  CheckCheck,
  Megaphone,
  Edit3,
  Image as ImageIcon,
  Trash2,
  Eye,
  Shield,
} from 'lucide-react';
import {
  ADMIN_PARTICIPANT_ID,
  KabiChat,
  KabiMessage,
  KabiParticipant,
  KabiStatusItem,
  compressImageForChat,
  getChatDisplayTitle,
  pickAvatarColor,
} from '../../services/kabiChatService';

function formatFullTime(ts?: number): string {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString('hi-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function getInitials(name: string): string {
  const clean = (name || '?').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

/* ==================== 1. CALL COMING SOON MODAL ==================== */
export const CallComingSoonModal: React.FC<{
  mode: 'audio' | 'video' | null;
  targetName?: string;
  onClose: () => void;
}> = ({ mode, targetName, onClose }) => {
  if (!mode) return null;
  return (
    <div
      className="fixed inset-0 z-[130] bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#008069] px-6 py-6 text-white text-center relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center cursor-pointer"
            aria-label="बंद करें"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="w-16 h-16 rounded-2xl bg-white/15 mx-auto flex items-center justify-center mb-3 shadow-inner">
            {mode === 'video' ? <Video className="w-8 h-8 text-white" /> : <Phone className="w-8 h-8 text-white" />}
          </div>
          <h3 className="text-lg font-extrabold tracking-tight">
            {mode === 'video' ? 'वीडियो कॉल (Video Call)' : 'ऑडियो कॉल (Audio Call)'}
          </h3>
          {targetName && <p className="text-xs text-emerald-100 mt-1">{targetName}</p>}
        </div>
        <div className="p-6 text-center space-y-4">
          <div className="inline-flex items-center gap-2 text-sm font-black text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2">
            <Clock className="w-4 h-4 text-emerald-600" />
            <span>Coming Soon</span>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            <strong>KabiTech Solution SMS</strong> में सिंगल और ग्रुप ऑडियो/वीडियो कॉलिंग सुविधा अगले अपडेट में जल्द आ रही है। अभी आप अनलिमिटेड टेक्स्ट, फोटो, वॉइस नोट और ग्रुप चैट का उपयोग कर सकते हैं।
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-full h-11 rounded-xl bg-[#008069] hover:bg-[#016a57] text-white font-bold text-sm transition active:scale-[0.98] cursor-pointer"
          >
            ठीक है (OK)
          </button>
        </div>
      </div>
    </div>
  );
};

/* ==================== 2. NEW CHAT / CONTACTS PICKER ==================== */
export const NewChatModal: React.FC<{
  open: boolean;
  me: KabiParticipant;
  contacts: KabiParticipant[];
  isAdmin: boolean;
  onSelectContact: (contact: KabiParticipant) => void;
  onOpenCreateGroup: () => void;
  onOpenBulkBroadcast: () => void;
  onClose: () => void;
}> = ({
  open,
  me,
  contacts,
  isAdmin,
  onSelectContact,
  onOpenCreateGroup,
  onOpenBulkBroadcast,
  onClose,
}) => {
  const [search, setSearch] = useState('');
  if (!open) return null;

  const filtered = contacts.filter((c) => {
    if (c.id === me.id) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || (c.phone || '').includes(q);
  });

  return (
    <div className="fixed inset-0 z-[125] bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[88vh] flex flex-col overflow-hidden">
        <div className="bg-[#008069] text-white px-4 py-3.5 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold">नई चैट शुरू करें</h3>
            <p className="text-xs text-emerald-100">{filtered.length} हब सदस्य उपलब्ध</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full hover:bg-white/15 flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 border-b border-slate-100 space-y-2.5 bg-slate-50">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="नाम या मोबाइल नंबर से खोजें..."
              className="w-full h-10 pl-9 pr-3 rounded-xl bg-white border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#008069]"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenCreateGroup();
              }}
              className="h-11 px-3 rounded-xl bg-white hover:bg-emerald-50 border border-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <Users className="w-4 h-4 text-[#008069]" />
              <span>नया ग्रुप बनाएं</span>
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenBulkBroadcast();
                }}
                className="h-11 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition"
              >
                <Megaphone className="w-4 h-4 text-[#008069]" />
                <span>बल्क मैसेज भेजें</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              कोई सदस्य नहीं मिला।
            </div>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onSelectContact(c);
                  onClose();
                }}
                className="w-full px-4 py-3 hover:bg-slate-50 flex items-center gap-3 text-left transition cursor-pointer"
              >
                <div
                  className="w-11 h-11 rounded-full text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-xs"
                  style={{ backgroundColor: pickAvatarColor(c.id) }}
                >
                  {getInitials(c.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-900 truncate">{c.name}</div>
                  <div className="text-xs text-slate-500 flex items-center gap-1.5">
                    <span>{c.role === 'admin' ? 'हब एडमिन' : 'हब राइडर'}</span>
                    {c.phone && (
                      <>
                        <span>·</span>
                        <span className="tabular-nums">{c.phone}</span>
                      </>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

/* ==================== 3. CREATE GROUP MODAL ==================== */
export const CreateGroupModal: React.FC<{
  open: boolean;
  me: KabiParticipant;
  contacts: KabiParticipant[];
  onCreate: (name: string, description: string, members: KabiParticipant[]) => Promise<void>;
  onClose: () => void;
}> = ({ open, me, contacts, onCreate, onClose }) => {
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!open) return null;

  const eligible = contacts.filter((c) => c.id !== me.id);
  const filtered = eligible.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || (c.phone || '').includes(q);
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectAll = () => {
    if (selectedIds.length === eligible.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(eligible.map((c) => c.id));
    }
  };

  const handleSubmit = async () => {
    if (!groupName.trim() || selectedIds.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const members = eligible.filter((c) => selectedIds.includes(c.id));
      await onCreate(groupName.trim(), description.trim(), members);
      setGroupName('');
      setDescription('');
      setSelectedIds([]);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[125] bg-black/55 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="bg-[#008069] text-white px-4 py-3.5 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold">नया ग्रुप बनाएं (New Group)</h3>
            <p className="text-xs text-emerald-100">{selectedIds.length} सदस्य चुने गए</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full hover:bg-white/15 flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3 border-b border-slate-100 bg-slate-50">
          <input
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            maxLength={80}
            placeholder="ग्रुप का नाम लिखें (जैसे: Seraikela Hub Riders) *"
            className="w-full h-11 px-3.5 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#008069]"
          />
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
            placeholder="ग्रुप विवरण (वैकल्पिक)"
            className="w-full h-10 px-3.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#008069]"
          />
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="सदस्य खोजें..."
                className="w-full h-9 pl-9 pr-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#008069]"
              />
            </div>
            <button
              type="button"
              onClick={selectAll}
              className="h-9 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold whitespace-nowrap cursor-pointer"
            >
              {selectedIds.length === eligible.length && eligible.length > 0 ? 'सभी हटाएं' : 'सभी चुनें'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {filtered.map((c) => {
            const checked = selectedIds.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleSelect(c.id)}
                className={`w-full px-4 py-2.5 flex items-center gap-3 text-left transition cursor-pointer ${
                  checked ? 'bg-emerald-50/70' : 'hover:bg-slate-50'
                }`}
              >
                <div
                  className="w-10 h-10 rounded-full text-white font-bold text-xs flex items-center justify-center shrink-0"
                  style={{ backgroundColor: pickAvatarColor(c.id) }}
                >
                  {getInitials(c.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-900 truncate">{c.name}</div>
                  <div className="text-xs text-slate-500">
                    {c.role === 'admin' ? 'हब एडमिन' : 'राइडर'} {c.phone ? `· ${c.phone}` : ''}
                  </div>
                </div>
                <div
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    checked ? 'bg-[#008069] border-[#008069] text-white' : 'border-slate-300 bg-white'
                  }`}
                >
                  {checked && <Check className="w-3.5 h-3.5" />}
                </div>
              </button>
            );
          })}
        </div>

        <div className="p-3.5 border-t border-slate-200 bg-white">
          <button
            type="button"
            disabled={!groupName.trim() || selectedIds.length === 0 || isSubmitting}
            onClick={handleSubmit}
            className="w-full h-11 rounded-xl bg-[#008069] hover:bg-[#016a57] disabled:bg-slate-300 text-white font-bold text-sm flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <Users className="w-4 h-4" />
            <span>{isSubmitting ? 'ग्रुप बन रहा है...' : `ग्रुप बनाएं (${selectedIds.length + 1} सदस्य)`}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

/* ==================== 4. BULK BROADCAST MODAL (ADMIN) ==================== */
export const BulkBroadcastModal: React.FC<{
  open: boolean;
  contacts: KabiParticipant[];
  onSendBroadcast: (recipients: KabiParticipant[], text: string, imageDataUrl?: string) => Promise<void>;
  onClose: () => void;
}> = ({ open, contacts, onSendBroadcast, onClose }) => {
  const ridersOnly = useMemo(() => contacts.filter((c) => c.role !== 'admin'), [contacts]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [messageText, setMessageText] = useState('');
  const [imagePreview, setImagePreview] = useState<string>('');
  const [isSending, setIsSending] = useState(false);

  if (!open) return null;

  const toggleId = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleAll = () => {
    if (selectedIds.length === ridersOnly.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(ridersOnly.map((r) => r.id));
    }
  };

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageForChat(file);
      setImagePreview(compressed);
    } catch {
      // ignore
    }
    e.target.value = '';
  };

  const handleSend = async () => {
    if ((!messageText.trim() && !imagePreview) || selectedIds.length === 0 || isSending) return;
    setIsSending(true);
    try {
      const targets = ridersOnly.filter((r) => selectedIds.includes(r.id));
      await onSendBroadcast(targets, messageText.trim(), imagePreview || undefined);
      setMessageText('');
      setImagePreview('');
      setSelectedIds([]);
      onClose();
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[125] bg-black/55 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4">
      <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="bg-[#008069] text-white px-4 py-3.5 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold flex items-center gap-2">
              <Megaphone className="w-4 h-4" />
              <span>बल्क SMS ब्रॉडकास्ट (सभी राइडर्स को)</span>
            </h3>
            <p className="text-xs text-emerald-100">
              चुने गए हर राइडर के पर्सनल चैट में एक साथ मैसेज और टोन जाएगा
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full hover:bg-white/15 flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700">
            चुने गए राइडर: {selectedIds.length} / {ridersOnly.length}
          </span>
          <button
            type="button"
            onClick={toggleAll}
            className="px-3 py-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-xs font-bold cursor-pointer"
          >
            {selectedIds.length === ridersOnly.length && ridersOnly.length > 0 ? 'सभी अनचेक करें' : 'सभी राइडर चुनें'}
          </button>
        </div>

        <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 border-b border-slate-200">
          {ridersOnly.map((r) => {
            const checked = selectedIds.includes(r.id);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => toggleId(r.id)}
                className={`w-full px-4 py-2 flex items-center gap-3 text-left cursor-pointer ${
                  checked ? 'bg-emerald-50/70' : 'hover:bg-slate-50'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${
                    checked ? 'bg-[#008069] border-[#008069] text-white' : 'border-slate-300 bg-white'
                  }`}
                >
                  {checked && <Check className="w-3 h-3" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">{r.name}</div>
                </div>
                {r.phone && <span className="text-xs text-slate-500 tabular-nums">{r.phone}</span>}
              </button>
            );
          })}
        </div>

        <div className="p-4 space-y-3 bg-white">
          <textarea
            rows={3}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="सभी चुने गए राइडर्स के लिए मैसेज लिखें (जैसे: सभी राइडर आज शाम 7 बजे तक COD जमा कर दें)..."
            className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#008069]"
          />

          {imagePreview && (
            <div className="relative inline-block">
              <img
                src={imagePreview}
                alt="Broadcast preview"
                className="h-24 rounded-xl border border-slate-200 object-cover"
              />
              <button
                type="button"
                onClick={() => setImagePreview('')}
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center shadow cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <label className="h-11 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer shrink-0">
              <ImageIcon className="w-4 h-4 text-[#008069]" />
              <span>फोटो जोड़ें</span>
              <input type="file" accept="image/*" onChange={handleImagePick} className="hidden" />
            </label>
            <button
              type="button"
              disabled={(!messageText.trim() && !imagePreview) || selectedIds.length === 0 || isSending}
              onClick={handleSend}
              className="flex-1 h-11 rounded-xl bg-[#008069] hover:bg-[#016a57] disabled:bg-slate-300 text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <Send className="w-4 h-4" />
              <span>
                {isSending ? 'भेजा जा रहा है...' : `${selectedIds.length} राइडर्स को भेजें`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ==================== 5. GROUP INFO & MANAGEMENT MODAL ==================== */
export const GroupInfoModal: React.FC<{
  open: boolean;
  chat: KabiChat | null;
  me: KabiParticipant;
  allContacts: KabiParticipant[];
  isHubAdmin: boolean;
  onUpdateDetails: (name: string, desc: string) => Promise<void>;
  onAddMembers: (members: KabiParticipant[]) => Promise<void>;
  onRemoveMember: (memberId: string) => Promise<void>;
  onClose: () => void;
}> = ({
  open,
  chat,
  me,
  allContacts,
  isHubAdmin,
  onUpdateDetails,
  onAddMembers,
  onRemoveMember,
  onClose,
}) => {
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(chat?.name || '');
  const [descInput, setDescInput] = useState(chat?.description || '');
  const [showAddPicker, setShowAddPicker] = useState(false);

  if (!open || !chat) return null;

  const canManage = isHubAdmin || chat.adminIds?.includes(me.id) || chat.createdBy === me.id;
  const nonMembers = allContacts.filter((c) => !chat.participantIds.includes(c.id));

  return (
    <div className="fixed inset-0 z-[125] bg-black/55 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="bg-[#008069] text-white px-4 py-3.5 flex items-center justify-between">
          <h3 className="text-base font-bold">ग्रुप जानकारी (Group Info)</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full hover:bg-white/15 flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="text-center space-y-2">
            <div
              className="w-16 h-16 rounded-full text-white font-black text-xl flex items-center justify-center mx-auto shadow-md"
              style={{ backgroundColor: chat.avatarColor || '#008069' }}
            >
              {getInitials(chat.name || 'G')}
            </div>

            {editing ? (
              <div className="space-y-2 text-left bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="ग्रुप का नाम"
                  className="w-full h-10 px-3 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-900"
                />
                <input
                  type="text"
                  value={descInput}
                  onChange={(e) => setDescInput(e.target.value)}
                  placeholder="ग्रुप विवरण"
                  className="w-full h-9 px-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-800"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      if (!nameInput.trim()) return;
                      await onUpdateDetails(nameInput.trim(), descInput.trim());
                      setEditing(false);
                    }}
                    className="flex-1 h-9 rounded-lg bg-[#008069] text-white text-xs font-bold cursor-pointer"
                  >
                    सेव करें
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="px-3 h-9 rounded-lg bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                  >
                    रद्द करें
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-center gap-2">
                  <h4 className="text-lg font-extrabold text-slate-900">{chat.name}</h4>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => {
                        setNameInput(chat.name || '');
                        setDescInput(chat.description || '');
                        setEditing(true);
                      }}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
                      title="नाम बदलें"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {chat.description && <p className="text-xs text-slate-600">{chat.description}</p>}
                <p className="text-xs text-slate-400">
                  {chat.participantIds.length} सदस्य · बनाया गया: {formatFullTime(chat.createdAt)}
                </p>
              </>
            )}
          </div>

          {canManage && nonMembers.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowAddPicker((v) => !v)}
                className="w-full h-10 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <UserPlus className="w-4 h-4 text-[#008069]" />
                <span>नया सदस्य जोड़ें ({nonMembers.length} उपलब्ध)</span>
              </button>
              {showAddPicker && (
                <div className="mt-2 border border-slate-200 rounded-2xl max-h-40 overflow-y-auto divide-y divide-slate-100">
                  {nonMembers.map((nm) => (
                    <button
                      key={nm.id}
                      type="button"
                      onClick={async () => {
                        await onAddMembers([nm]);
                      }}
                      className="w-full px-3 py-2 hover:bg-emerald-50 flex items-center justify-between text-left text-xs cursor-pointer"
                    >
                      <span className="font-bold text-slate-800">{nm.name}</span>
                      <span className="text-[#008069] font-bold">+ जोड़ें</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">
              ग्रुप सदस्य ({chat.participantIds.length})
            </div>
            <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden">
              {chat.participantIds.map((pid) => {
                const prof = chat.participantProfiles?.[pid] || {
                  id: pid,
                  name: pid === ADMIN_PARTICIPANT_ID ? 'हब एडमिन' : pid,
                  role: pid === ADMIN_PARTICIPANT_ID ? 'admin' : 'rider',
                };
                const isGroupAdmin = chat.adminIds?.includes(pid) || pid === ADMIN_PARTICIPANT_ID;
                return (
                  <div key={pid} className="px-3 py-2.5 flex items-center gap-2.5 bg-white">
                    <div
                      className="w-9 h-9 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0"
                      style={{ backgroundColor: pickAvatarColor(pid) }}
                    >
                      {getInitials(prof.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-slate-900 truncate">
                        {prof.name} {pid === me.id ? '(आप)' : ''}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {isGroupAdmin ? 'ग्रुप एडमिन' : 'सदस्य'}
                        {prof.phone ? ` · ${prof.phone}` : ''}
                      </div>
                    </div>
                    {canManage && pid !== me.id && pid !== ADMIN_PARTICIPANT_ID && (
                      <button
                        type="button"
                        onClick={() => onRemoveMember(pid)}
                        className="p-2 rounded-lg hover:bg-red-50 text-red-600 cursor-pointer"
                        title="सदस्य हटाएं"
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {chat.participantIds.includes(me.id) && (
            <button
              type="button"
              onClick={async () => {
                await onRemoveMember(me.id);
                onClose();
              }}
              className="w-full h-11 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>ग्रुप छोड़ें (Exit Group)</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/* ==================== 6. FORWARD MESSAGE MODAL ==================== */
export const ForwardMessageModal: React.FC<{
  message: KabiMessage | null;
  chats: KabiChat[];
  contacts: KabiParticipant[];
  me: KabiParticipant;
  onForwardToChat: (chat: KabiChat) => Promise<void>;
  onForwardToContact: (contact: KabiParticipant) => Promise<void>;
  onClose: () => void;
}> = ({ message, chats, contacts, me, onForwardToChat, onForwardToContact, onClose }) => {
  const [search, setSearch] = useState('');
  const [sendingId, setSendingId] = useState<string | null>(null);
  if (!message) return null;

  const q = search.trim().toLowerCase();
  const filteredChats = chats.filter((c) => getChatDisplayTitle(c, me.id).toLowerCase().includes(q));
  const filteredContacts = contacts.filter(
    (c) => c.id !== me.id && (c.name.toLowerCase().includes(q) || (c.phone || '').includes(q))
  );

  return (
    <div className="fixed inset-0 z-[130] bg-black/55 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="bg-[#008069] text-white px-4 py-3.5 flex items-center justify-between">
          <h3 className="text-base font-bold">मैसेज फॉरवर्ड करें (Forward)</h3>
          <button type="button" onClick={onClose} className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-3 bg-slate-50 border-b border-slate-100">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="चैट या राइडर खोजें..."
            className="w-full h-10 px-3.5 rounded-xl bg-white border border-slate-200 text-sm text-slate-900"
          />
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {filteredChats.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={Boolean(sendingId)}
              onClick={async () => {
                setSendingId(c.id);
                await onForwardToChat(c);
                setSendingId(null);
                onClose();
              }}
              className="w-full px-4 py-3 hover:bg-emerald-50 flex items-center justify-between text-left cursor-pointer"
            >
              <span className="text-sm font-bold text-slate-900 truncate">
                {getChatDisplayTitle(c, me.id)} {c.type === 'group' ? '(ग्रुप)' : ''}
              </span>
              <Send className="w-4 h-4 text-[#008069] shrink-0" />
            </button>
          ))}
          {filteredContacts.map((ct) => (
            <button
              key={ct.id}
              type="button"
              disabled={Boolean(sendingId)}
              onClick={async () => {
                setSendingId(ct.id);
                await onForwardToContact(ct);
                setSendingId(null);
                onClose();
              }}
              className="w-full px-4 py-3 hover:bg-emerald-50 flex items-center justify-between text-left cursor-pointer"
            >
              <div>
                <div className="text-sm font-semibold text-slate-900">{ct.name}</div>
                <div className="text-xs text-slate-500">{ct.phone || 'हब सदस्य'}</div>
              </div>
              <Send className="w-4 h-4 text-[#008069] shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ==================== 7. MESSAGE INFO (READ RECEIPTS) ==================== */
export const MessageInfoModal: React.FC<{
  message: KabiMessage | null;
  chat: KabiChat | null;
  onClose: () => void;
}> = ({ message, chat, onClose }) => {
  if (!message || !chat) return null;
  const readers = Object.entries(message.readBy || {}).filter(([pid]) => pid !== message.senderId);

  return (
    <div className="fixed inset-0 z-[130] bg-black/55 backdrop-blur-xs flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-[#008069] text-white px-4 py-3.5 flex items-center justify-between">
          <h3 className="text-base font-bold">मैसेज जानकारी (Message Info)</h3>
          <button type="button" onClick={onClose} className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="p-3 rounded-2xl bg-[#D9FDD3] border border-emerald-200 text-sm text-slate-900">
            <div className="text-xs font-bold text-emerald-900 mb-1">{message.senderName}</div>
            <div>
              {message.text ||
                (message.type === 'image'
                  ? '📷 HD फोटो'
                  : message.type === 'video'
                  ? '🎬 वीडियो'
                  : '🎤 वॉइस नोट')}
            </div>
            <div className="text-[10px] text-slate-500 mt-1 text-right">{formatFullTime(message.createdAt)}</div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold text-sky-600 flex items-center gap-1.5">
              <CheckCheck className="w-4 h-4" />
              <span>किसने पढ़ा (Read By · {readers.length})</span>
            </div>
            {readers.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">अभी तक किसी ने नहीं पढ़ा है।</p>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
                {readers.map(([pid, ts]) => {
                  const prof = chat.participantProfiles?.[pid];
                  return (
                    <div key={pid} className="px-3 py-2 flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800">{prof?.name || pid}</span>
                      <span className="text-slate-500 tabular-nums">{formatFullTime(ts)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ==================== 8. STARRED MESSAGES MODAL ==================== */
export const StarredMessagesModal: React.FC<{
  open: boolean;
  messages: KabiMessage[];
  myId: string;
  onUnstar: (msg: KabiMessage) => void;
  onClose: () => void;
}> = ({ open, messages, myId, onUnstar, onClose }) => {
  if (!open) return null;
  const starred = messages.filter((m) => m.starredBy?.[myId] && !m.deletedForEveryone && !m.deletedFor?.[myId]);

  return (
    <div className="fixed inset-0 z-[130] bg-black/55 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="bg-[#008069] text-white px-4 py-3.5 flex items-center justify-between">
          <h3 className="text-base font-bold flex items-center gap-2">
            <Star className="w-4 h-4 fill-amber-300 text-amber-300" />
            <span>स्टार किए गए मैसेज ({starred.length})</span>
          </h3>
          <button type="button" onClick={onClose} className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-slate-50">
          {starred.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              कोई स्टार किया गया मैसेज नहीं है।
            </div>
          ) : (
            starred.map((m) => (
              <div key={m.id} className="bg-white rounded-2xl p-3 border border-slate-200 shadow-2xs space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-emerald-800">{m.senderName}</span>
                  <button
                    type="button"
                    onClick={() => onUnstar(m)}
                    className="text-amber-500 hover:text-slate-400 cursor-pointer"
                    title="स्टार हटाएं"
                  >
                    <Star className="w-4 h-4 fill-amber-400" />
                  </button>
                </div>
                {m.imageDataUrl && <img src={m.imageDataUrl} alt="" className="max-h-36 rounded-xl object-cover" />}
                {m.videoDataUrl && <video controls playsInline src={m.videoDataUrl} className="max-h-40 rounded-xl w-full bg-black" />}
                {m.text && <div className="text-sm text-slate-800 whitespace-pre-wrap">{m.text}</div>}
                <div className="text-[10px] text-slate-400 text-right">{formatFullTime(m.createdAt)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

/* ==================== 9. STATUS COMPOSER & VIEWER ==================== */
const STATUS_COLORS = ['#008069', '#0284c7', '#7c3aed', '#b45309', '#be123c', '#1e293b'];

export const StatusComposerModal: React.FC<{
  open: boolean;
  onPost: (text: string, bgColor: string, imageDataUrl?: string) => Promise<void>;
  onClose: () => void;
}> = ({ open, onPost, onClose }) => {
  const [text, setText] = useState('');
  const [bgColor, setBgColor] = useState(STATUS_COLORS[0]);
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [posting, setPosting] = useState(false);

  if (!open) return null;

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageForChat(file, 1280);
      setImageDataUrl(compressed);
    } catch {}
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-[130] bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl overflow-hidden shadow-2xl bg-white">
        <div
          className="min-h-[260px] p-6 flex flex-col justify-between text-white relative"
          style={{ backgroundColor: bgColor }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold opacity-90">24 घंटे का हब स्टेटस / अपडेट</span>
            <button type="button" onClick={onClose} className="w-9 h-9 rounded-full bg-black/20 flex items-center justify-center cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
          {imageDataUrl && (
            <img src={imageDataUrl} alt="Status" className="max-h-44 mx-auto rounded-2xl object-contain my-2 shadow-lg" />
          )}
          <textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="अपना अपडेट या सूचना लिखें..."
            className="w-full bg-transparent text-center text-lg font-bold placeholder-white/70 text-white focus:outline-none resize-none"
          />
          <div className="flex items-center justify-center gap-2 pt-2">
            {STATUS_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setBgColor(c)}
                className={`w-7 h-7 rounded-full border-2 cursor-pointer ${
                  bgColor === c ? 'border-white scale-110' : 'border-white/40'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <div className="p-3.5 bg-white flex items-center gap-2">
          <label className="h-11 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer">
            <ImageIcon className="w-4 h-4 text-[#008069]" />
            <span>फोटो</span>
            <input type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
          </label>
          <button
            type="button"
            disabled={(!text.trim() && !imageDataUrl) || posting}
            onClick={async () => {
              setPosting(true);
              try {
                await onPost(text.trim(), bgColor, imageDataUrl || undefined);
                setText('');
                setImageDataUrl('');
                onClose();
              } finally {
                setPosting(false);
              }
            }}
            className="flex-1 h-11 rounded-xl bg-[#008069] hover:bg-[#016a57] disabled:bg-slate-300 text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>{posting ? 'पोस्ट हो रहा...' : 'स्टेटस पोस्ट करें'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export const StatusViewerModal: React.FC<{
  status: KabiStatusItem | null;
  canDelete: boolean;
  onDelete: (id: string) => void;
  onClose: () => void;
}> = ({ status, canDelete, onDelete, onClose }) => {
  if (!status) return null;
  const viewCount = Object.keys(status.viewedBy || {}).length;
  return (
    <div className="fixed inset-0 z-[135] bg-black/90 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-3xl overflow-hidden shadow-2xl min-h-[420px] flex flex-col justify-between p-6 text-white relative"
        style={{ backgroundColor: status.bgColor || '#008069' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm">
              {getInitials(status.authorName)}
            </div>
            <div>
              <div className="text-sm font-bold flex items-center gap-1.5">
                <span>{status.authorName}</span>
                {status.authorRole === 'admin' && <Shield className="w-3.5 h-3.5 text-amber-300" />}
              </div>
              <div className="text-[11px] opacity-80">{formatFullTime(status.createdAt)}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {canDelete && (
              <button
                type="button"
                onClick={() => {
                  onDelete(status.id);
                  onClose();
                }}
                className="w-9 h-9 rounded-full bg-black/25 hover:bg-red-600/80 flex items-center justify-center cursor-pointer"
                title="डिलीट करें"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-black/25 hover:bg-black/40 flex items-center justify-center cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="my-6 text-center space-y-4">
          {status.imageDataUrl && (
            <img src={status.imageDataUrl} alt="" className="max-h-64 mx-auto rounded-2xl shadow-xl object-contain" />
          )}
          {status.text && <p className="text-xl font-bold leading-relaxed whitespace-pre-wrap">{status.text}</p>}
        </div>

        <div className="flex items-center justify-center gap-1.5 text-xs opacity-90 pt-2 border-t border-white/15">
          <Eye className="w-4 h-4" />
          <span>{viewCount} लोगों ने देखा</span>
        </div>
      </div>
    </div>
  );
};
