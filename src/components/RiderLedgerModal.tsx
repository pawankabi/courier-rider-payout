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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950 animate-in fade-in print:static print:overflow-visible print:bg-white print:p-0 print:m-0 print:h-auto print:w-auto">
      <RiderLedgerStatement
        {...props}
        onBackToApp={handleClose}
      />
    </div>
  );
};

export default RiderLedgerModal;
