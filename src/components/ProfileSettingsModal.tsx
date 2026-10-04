import React from 'react';
import { X } from 'lucide-react';
import { Profile } from '../pages/Profile';
import { User as FirebaseUser } from 'firebase/auth';

interface ProfileSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: FirebaseUser | null;
  onOpenSubscription?: () => void;
}

export const ProfileSettingsModal: React.FC<ProfileSettingsModalProps> = ({
  isOpen,
  onClose,
  user,
  onOpenSubscription,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto animate-in fade-in">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-750 rounded-3xl shadow-2xl overflow-hidden my-auto">
        <Profile
          user={user}
          onClose={onClose}
          onOpenSubscription={onOpenSubscription}
        />
      </div>
    </div>
  );
};
