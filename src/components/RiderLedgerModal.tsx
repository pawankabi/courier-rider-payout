import React from 'react';
import { RiderLedgerStatement, RiderLedgerStatementProps } from './RiderLedgerStatement';

export interface RiderLedgerModalProps extends RiderLedgerStatementProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const RiderLedgerModal: React.FC<RiderLedgerModalProps> = ({
  isOpen = true,
  onClose,
  onBackToApp,
  ...props
}) => {
  if (!isOpen) return null;

  const handleClose = onClose || onBackToApp;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950 animate-in fade-in">
      <RiderLedgerStatement
        {...props}
        onBackToApp={handleClose}
      />
    </div>
  );
};

export default RiderLedgerModal;
