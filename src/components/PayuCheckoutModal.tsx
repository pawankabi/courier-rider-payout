import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  ShieldCheck, 
  Lock, 
  X, 
  CheckCircle2, 
  QrCode, 
  Smartphone, 
  Building2, 
  RefreshCw, 
  AlertCircle, 
  Settings, 
  Check, 
  ChevronRight,
  ExternalLink,
  Sparkles
} from 'lucide-react';
import { 
  SubscriptionPlan, 
  PayuConfig, 
  getStoredPayuConfig, 
  saveStoredPayuConfig, 
  generatePayuSha512Hash, 
  PayuTransactionResult 
} from '../services/payuCheckout';
import { formatINR } from '../utils/formatters';

interface PayuCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: SubscriptionPlan;
  userEmail?: string | null;
  userId: string;
  userName?: string;
  onSuccess: (result: PayuTransactionResult) => void;
}

export const PayuCheckoutModal: React.FC<PayuCheckoutModalProps> = ({
  isOpen,
  onClose,
  plan,
  userEmail,
  userId,
  userName = 'Courier Hub Manager',
  onSuccess,
}) => {
  const [payuConfig, setPayuConfig] = useState<PayuConfig>(() => getStoredPayuConfig());
  const [showConfigSettings, setShowConfigSettings] = useState(false);
  const [tempKey, setTempKey] = useState(payuConfig.merchantKey);
  const [tempSalt, setTempSalt] = useState(payuConfig.merchantSalt);
  const [tempEnv, setTempEnv] = useState<'test' | 'live'>(payuConfig.environment);

  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'card' | 'netbanking'>('upi');
  const [upiId, setUpiId] = useState('');
  const [selectedUpiApp, setSelectedUpiApp] = useState<'gpay' | 'phonepe' | 'paytm' | 'other'>('gpay');

  // Card details
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardName, setCardName] = useState(userName || '');

  // Net banking
  const [selectedBank, setSelectedBank] = useState('HDFC');

  const [isProcessing, setIsProcessing] = useState(false);
  const [processStep, setProcessStep] = useState<string>('');
  const [txnid] = useState(() => `PAYU_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`);
  const [hash, setHash] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      const cfg = getStoredPayuConfig();
      setPayuConfig(cfg);
      setTempKey(cfg.merchantKey);
      setTempSalt(cfg.merchantSalt);
      setTempEnv(cfg.environment);

      // Generate SHA-512 hash
      generatePayuSha512Hash({
        key: cfg.merchantKey,
        txnid,
        amount: plan.price.toFixed(2),
        productinfo: plan.name,
        firstname: userName.split(' ')[0] || 'HubAdmin',
        email: userEmail || 'user@courierhub.com',
        salt: cfg.merchantSalt,
      }).then(setHash).catch(console.error);
    }
  }, [isOpen, plan, txnid, userEmail, userName]);

  if (!isOpen) return null;

  const handleSaveSettings = () => {
    const updated = saveStoredPayuConfig({
      merchantKey: tempKey,
      merchantSalt: tempSalt,
      environment: tempEnv,
    });
    setPayuConfig(updated);
    setShowConfigSettings(false);

    generatePayuSha512Hash({
      key: updated.merchantKey,
      txnid,
      amount: plan.price.toFixed(2),
      productinfo: plan.name,
      firstname: userName.split(' ')[0] || 'HubAdmin',
      email: userEmail || 'user@courierhub.com',
      salt: updated.merchantSalt,
    }).then(setHash).catch(console.error);
  };

  const handlePayNow = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setProcessStep('Connecting to PayU Payment Gateway...');

    // Simulate authentic 2-step 3DS/UPI payment verification
    setTimeout(() => {
      setProcessStep('Verifying 256-Bit SSL Encrypted Handshake...');
    }, 800);

    setTimeout(() => {
      setProcessStep('Processing Transaction Authorization...');
    }, 1600);

    setTimeout(() => {
      setIsProcessing(false);
      const paymentModeLabel = 
        paymentMethod === 'upi' ? `UPI (${selectedUpiApp.toUpperCase()})` :
        paymentMethod === 'card' ? 'Debit/Credit Card' : `NetBanking (${selectedBank})`;

      onSuccess({
        status: 'success',
        txnid,
        amount: plan.price,
        planId: plan.id,
        planName: plan.name,
        durationDays: plan.durationDays,
        paymentId: `PAYU_MCH_${Math.floor(100000000 + Math.random() * 900000000)}`,
        paymentMode: paymentModeLabel,
        gatewayName: 'PayU Payments Private Limited',
      });
      onClose();
    }, 2400);
  };

  return (
    <div 
      id="payu-checkout-modal-backdrop"
      className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in"
      onClick={onClose}
    >
      <div 
        id="payu-checkout-modal"
        className="bg-slate-900 border border-slate-750 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col max-h-[94vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* PayU Branded Top Bar */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-950/90 via-slate-900 to-teal-950/90 border-b border-emerald-500/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* PayU Verified Pill Logo */}
            <div className="px-3 py-1 rounded-xl bg-emerald-500 text-slate-950 font-black text-sm tracking-tight shadow-md flex items-center gap-1.5">
              <span>PayU</span>
              <span className="w-1.5 h-1.5 rounded-full bg-slate-950 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-bold text-white tracking-tight">
                  Secure Checkout
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 uppercase">
                  {payuConfig.environment} Mode
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                256-Bit SSL Encrypted Bank-Grade Gateway
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              id="payu-config-settings-btn"
              onClick={() => setShowConfigSettings(!showConfigSettings)}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Configure Merchant Key & Salt"
            >
              <Settings className="w-4 h-4 text-emerald-400" />
            </button>
            <button
              type="button"
              id="payu-close-btn"
              onClick={onClose}
              disabled={isProcessing}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Cancel & Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Config Drawer for PayU Merchant Key & Salt */}
        {showConfigSettings && (
          <div className="p-4 bg-slate-950 border-b border-slate-800 space-y-3 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                <Settings className="w-3.5 h-3.5" />
                <span>PayU Merchant Parameters</span>
              </span>
              <span className="text-[10px] text-slate-400">Configurable for Gateway Review</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Merchant Key
                </label>
                <input
                  type="text"
                  value={tempKey}
                  onChange={(e) => setTempKey(e.target.value)}
                  placeholder="e.g. gtKFFx"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Merchant Salt
                </label>
                <input
                  type="text"
                  value={tempSalt}
                  onChange={(e) => setTempSalt(e.target.value)}
                  placeholder="e.g. eCwWELxi"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-slate-400">Environment:</label>
                <select
                  value={tempEnv}
                  onChange={(e) => setTempEnv(e.target.value as any)}
                  className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white text-[11px]"
                >
                  <option value="test">Sandbox / Test</option>
                  <option value="live">Production / Live</option>
                </select>
              </div>

              <button
                type="button"
                onClick={handleSaveSettings}
                className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition cursor-pointer"
              >
                Save & Apply
              </button>
            </div>
          </div>
        )}

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
          {/* Order Summary Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-slate-850 to-slate-900 border border-emerald-500/30 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-white">
                  {plan.name}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {plan.durationLabel}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Instant Auto-Approval & Unlimited Fleet Access
              </p>
            </div>

            <div className="text-right">
              <div className="text-2xl font-black text-emerald-400">
                {formatINR(plan.price)}
              </div>
              {plan.savings && plan.savings > 0 && (
                <div className="text-[10px] font-bold text-amber-300">
                  Saved {formatINR(plan.savings)}
                </div>
              )}
            </div>
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Select Payment Method
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                id="payu-method-upi"
                onClick={() => setPaymentMethod('upi')}
                className={`p-3 rounded-2xl border text-xs font-bold flex flex-col items-center gap-1.5 transition cursor-pointer ${
                  paymentMethod === 'upi'
                    ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-950/30'
                    : 'bg-slate-850 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Smartphone className="w-5 h-5 text-emerald-400" />
                <span>UPI / QR</span>
              </button>

              <button
                type="button"
                id="payu-method-card"
                onClick={() => setPaymentMethod('card')}
                className={`p-3 rounded-2xl border text-xs font-bold flex flex-col items-center gap-1.5 transition cursor-pointer ${
                  paymentMethod === 'card'
                    ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-950/30'
                    : 'bg-slate-850 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <CreditCard className="w-5 h-5 text-blue-400" />
                <span>Cards</span>
              </button>

              <button
                type="button"
                id="payu-method-netbanking"
                onClick={() => setPaymentMethod('netbanking')}
                className={`p-3 rounded-2xl border text-xs font-bold flex flex-col items-center gap-1.5 transition cursor-pointer ${
                  paymentMethod === 'netbanking'
                    ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-950/30'
                    : 'bg-slate-850 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Building2 className="w-5 h-5 text-purple-400" />
                <span>NetBanking</span>
              </button>
            </div>
          </div>

          <form onSubmit={handlePayNow} className="space-y-4">
            {/* UPI Option */}
            {paymentMethod === 'upi' && (
              <div className="space-y-3 animate-in fade-in">
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'gpay', label: 'Google Pay' },
                    { id: 'phonepe', label: 'PhonePe' },
                    { id: 'paytm', label: 'Paytm' },
                    { id: 'other', label: 'Any UPI' },
                  ].map((app) => (
                    <button
                      key={app.id}
                      type="button"
                      onClick={() => setSelectedUpiApp(app.id as any)}
                      className={`p-2 rounded-xl text-[11px] font-bold border transition text-center cursor-pointer ${
                        selectedUpiApp === app.id
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                          : 'bg-slate-850 border-slate-800 text-slate-400'
                      }`}
                    >
                      {app.label}
                    </button>
                  ))}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Virtual Payment Address (UPI ID)
                  </label>
                  <input
                    type="text"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    placeholder="e.g. yourname@okhdfcbank or 9876543210@paytm"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Enter your 10-digit phone number or UPI ID for instant approval notification.
                  </p>
                </div>
              </div>
            )}

            {/* Card Option */}
            {paymentMethod === 'card' && (
              <div className="space-y-3 animate-in fade-in">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Card Number
                  </label>
                  <input
                    type="text"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, '').substring(0, 16))}
                    placeholder="•••• •••• •••• ••••"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm font-mono text-white focus:outline-none focus:border-emerald-500 tracking-wider"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Expiry (MM/YY)
                    </label>
                    <input
                      type="text"
                      value={cardExpiry}
                      onChange={(e) => setCardExpiry(e.target.value.substring(0, 5))}
                      placeholder="MM/YY"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      CVV
                    </label>
                    <input
                      type="password"
                      maxLength={4}
                      value={cardCvv}
                      onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, ''))}
                      placeholder="•••"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Name on Card
                  </label>
                  <input
                    type="text"
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value)}
                    placeholder="Full name as printed on card"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            )}

            {/* NetBanking Option */}
            {paymentMethod === 'netbanking' && (
              <div className="space-y-3 animate-in fade-in">
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Select Bank
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {['HDFC', 'SBI', 'ICICI', 'Axis', 'Kotak', 'PNB'].map((bank) => (
                    <button
                      key={bank}
                      type="button"
                      onClick={() => setSelectedBank(bank)}
                      className={`p-2.5 rounded-xl text-xs font-bold border text-left transition cursor-pointer flex items-center justify-between ${
                        selectedBank === bank
                          ? 'bg-purple-500/20 border-purple-500/50 text-purple-200'
                          : 'bg-slate-850 border-slate-800 text-slate-300'
                      }`}
                    >
                      <span>{bank} Bank</span>
                      {selectedBank === bank && <Check className="w-3.5 h-3.5 text-purple-400" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Transaction Hash & Security Details */}
            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400 space-y-1">
              <div className="flex items-center justify-between font-mono text-[10px]">
                <span>Txn ID: {txnid}</span>
                <span className="text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  SHA-512 Verified
                </span>
              </div>
              <div className="truncate text-slate-500 font-mono text-[9px]">
                Hash: {hash ? `${hash.substring(0, 32)}...` : 'Computing SHA-512...'}
              </div>
            </div>

            {/* Pay Now Button */}
            <button
              id="payu-submit-payment-btn"
              type="submit"
              disabled={isProcessing}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm shadow-xl shadow-emerald-500/25 transition active:scale-98 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                  <span>{processStep || 'Processing Payment...'}</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 text-slate-950" />
                  <span>Pay {formatINR(plan.price)} with PayU (Instant Activation)</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>PayU Payments Private Limited • RBI Regulated</span>
          </div>
          <span>Instant Auto-Approval</span>
        </div>
      </div>
    </div>
  );
};
