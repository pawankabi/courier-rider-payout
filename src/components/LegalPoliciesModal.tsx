import React, { useState } from 'react';
import { 
  Building2, 
  Phone, 
  Mail, 
  MapPin, 
  Clock, 
  CreditCard, 
  ShieldCheck, 
  FileText, 
  RotateCcw, 
  CheckCircle2, 
  ArrowLeft, 
  X, 
  Lock, 
  Scale, 
  Receipt,
  HelpCircle,
  Copy,
  Check,
  ExternalLink,
  Layers,
  Sparkles
} from 'lucide-react';
import { formatINR } from '../utils/formatters';

export type PolicyTab = 'about' | 'pricing' | 'privacy' | 'refund';

interface LegalPoliciesModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: PolicyTab;
  platformName?: string;
  supportEmail?: string;
  supportPhone?: string;
  supportAddress?: string;
}

export const LegalPoliciesModal: React.FC<LegalPoliciesModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'about',
  platformName = 'Courier Rider Payout',
  supportEmail = 'support@courierpayoutpro.com',
  supportPhone = '+91 9110913070',
  supportAddress = 'Courier Rider Payout Operations, Main Road, Seraikella, Jharkhand - 833219, India'
}) => {
  const [activeTab, setActiveTab] = useState<PolicyTab>(initialTab);
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen) return null;

  const handleCopySummary = () => {
    const summary = `${platformName} (Courier Payout Pro SaaS)\nOfficial Support Phone: ${supportPhone}\nOfficial Support Email: ${supportEmail}\nOperating Address: ${supportAddress}\nOperating Hours: 10:00 AM - 7:00 PM IST (Mon-Sat)\nRefund Window: 48-72 Hours (Processed within 5-7 business days)`;
    navigator.clipboard?.writeText(summary);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  return (
    <div 
      id="legal-policies-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
    >
      <div 
        className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-6 bg-slate-850/90 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              id="back-close-policies-btn"
              onClick={onClose}
              className="p-2 sm:px-3 sm:py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 text-xs font-bold transition flex items-center gap-1.5 active:scale-95 cursor-pointer"
              title="Close and return to app"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Close</span>
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  <Scale className="w-4 h-4" />
                </span>
                <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
                  Legal & Payment Gateway Compliance Hub
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {platformName} • PayU Gateway, Google Play & Merchant Compliance Standard Policies
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              id="copy-compliance-info-btn"
              onClick={handleCopySummary}
              className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 text-xs font-medium transition flex items-center gap-1.5 cursor-pointer"
              title="Copy Compliance & Support Info"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{copiedLink ? 'Copied' : 'Copy Info'}</span>
            </button>
            <button
              type="button"
              id="close-legal-modal-x-btn"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Close Dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Policy Tab Switcher */}
        <div className="flex items-center gap-1 p-2 bg-slate-950/70 border-b border-slate-800/80 overflow-x-auto">
          <button
            type="button"
            id="tab-policy-about"
            onClick={() => setActiveTab('about')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
              activeTab === 'about'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>1. About & Contact Us</span>
          </button>

          <button
            type="button"
            id="tab-policy-pricing"
            onClick={() => setActiveTab('pricing')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
              activeTab === 'pricing'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>2. Pricing & Services</span>
          </button>

          <button
            type="button"
            id="tab-policy-privacy"
            onClick={() => setActiveTab('privacy')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
              activeTab === 'privacy'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>3. Privacy Policy & Terms</span>
          </button>

          <button
            type="button"
            id="tab-policy-refund"
            onClick={() => setActiveTab('refund')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
              activeTab === 'refund'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>4. Refund & Cancellation</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 text-slate-200 text-xs sm:text-sm leading-relaxed">
          
          {/* TAB 1: About Us & Contact Us */}
          {activeTab === 'about' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div className="bg-slate-850 border border-slate-750 rounded-2xl p-5 sm:p-6 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400">
                      SaaS Platform & Commercial Overview
                    </span>
                    <h3 className="text-lg font-black text-white mt-0.5">
                      {platformName}
                    </h3>
                    <p className="text-xs text-slate-300 mt-1">
                      Multi-Hub Courier Delivery Fleet Management, Rider Payout Settlement, Advance Ledger & SIM Communication Software.
                    </p>
                  </div>
                  <span className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
                    <Building2 className="w-6 h-6" />
                  </span>
                </div>

                <div className="border-t border-slate-800 pt-4 text-xs text-slate-300 space-y-2">
                  <p>
                    <strong>About Our Platform:</strong> <strong>{platformName}</strong> (also operated as Courier Payout Pro SaaS) is an enterprise logistics accounting application designed for courier franchisees, delivery branch managers, and dispatch fleet operators across India. The software simplifies daily parcel logging, dynamic incentive rate configuration, cash advance tracking, and digital settlement receipts for delivery riders.
                  </p>
                  <p>
                    Our platform is built as a multi-hub SaaS system that allows each delivery coordinator to manage their independent delivery fleet, configure customizable parcel payout contracts, generate public audit sheets, and dispatch native SIM SMS notifications directly to delivery partners.
                  </p>
                </div>
              </div>

              {/* Official Contact Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Contact Card: Phone */}
                <div className="p-4 rounded-2xl bg-slate-850 border border-slate-800 flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
                    <Phone className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Official Support Phone Helpline
                    </h4>
                    <p className="text-sm font-bold text-white mt-0.5 font-mono">
                      {supportPhone}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Dedicated Voice & WhatsApp Support Desk
                    </p>
                  </div>
                </div>

                {/* Contact Card: Email */}
                <div className="p-4 rounded-2xl bg-slate-850 border border-slate-800 flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/30 shrink-0">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div className="overflow-hidden">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Official Support Email
                    </h4>
                    <p className="text-sm font-bold text-white mt-0.5 font-mono truncate">
                      {supportEmail}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Customer query turnaround: within 24 hours
                    </p>
                  </div>
                </div>

                {/* Contact Card: Operating Address */}
                <div className="p-4 rounded-2xl bg-slate-850 border border-slate-800 flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Operating Operations Address
                    </h4>
                    <p className="text-xs font-medium text-slate-200 mt-0.5">
                      {supportAddress}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Jharkhand - 833219, India
                    </p>
                  </div>
                </div>

                {/* Contact Card: Operating Hours */}
                <div className="p-4 rounded-2xl bg-slate-850 border border-slate-800 flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30 shrink-0">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Support Desk Operating Hours
                    </h4>
                    <p className="text-sm font-bold text-white mt-0.5">
                      10:00 AM – 7:00 PM IST
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Monday to Saturday (Excluding Public Holidays)
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Pricing & Services (सेवाएं और मूल्य निर्धारण) */}
          {activeTab === 'pricing' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div className="bg-slate-850 border border-slate-755 rounded-2xl p-5 sm:p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    <Receipt className="w-4 h-4" />
                  </span>
                  <h3 className="text-base font-bold text-white">
                    Core Platform Services (सेवाओं का विवरण)
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                    <div className="font-bold text-emerald-300 flex items-center gap-1.5 text-xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Customizable Rate Cards & Slabs Architecture</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-normal">
                      Fully customizable rate card architecture tailored to each delivery hub. Hub managers can configure their own custom base rate per parcel, dynamic incentive slabs, and tiered delivery payouts based on their hub agreements.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                    <div className="font-bold text-emerald-300 flex items-center gap-1.5 text-xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Two-Way Cash Advance & Loan Accounting</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-normal">
                      Central advance records with reason tracking (Fuel, Bike Repair, Emergency), two-way synchronization across tabs, and automatic lifetime advance deduction on settlements.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                    <div className="font-bold text-emerald-300 flex items-center gap-1.5 text-xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Automated SIM SMS Payout Receipts</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-normal">
                      Background SIM SMS dispatching directly from device telephony hardware without requiring manual composer intervention, confirming exact settled dates, gross pay, advance adjusted, and net payout.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                    <div className="font-bold text-emerald-300 flex items-center gap-1.5 text-xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Online Passbook & PDF Slip Slates</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-normal">
                      Rider-accessible statement web ledger with 1-click WhatsApp slips, print-ready PDF payout invoices, and complete CSV/Excel data backups.
                    </p>
                  </div>
                </div>
              </div>

              {/* Transparent Pricing Slabs Card */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-white">
                    Transparent Commercial Pricing Tiers (शुल्क व योजनाएं)
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    All prices in Indian Rupees (INR)
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
                  {/* Tier 0: Free Starter */}
                  <div className="p-4 rounded-2xl bg-slate-850 border border-slate-800 flex flex-col justify-between space-y-3">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Starter Evaluation
                      </span>
                      <div className="text-xl font-black text-white mt-1">₹0 <span className="text-xs font-normal text-slate-400">/ Free</span></div>
                      <p className="text-[11px] text-slate-300 mt-1">
                        Free evaluation tier for individual hub supervisors.
                      </p>
                    </div>
                    <ul className="space-y-1.5 text-[11px] text-slate-400 border-t border-slate-800 pt-3">
                      <li className="flex items-center gap-1.5">✓ Up to 3 active riders</li>
                      <li className="flex items-center gap-1.5">✓ Local offline cache storage</li>
                      <li className="flex items-center gap-1.5">✗ No Cloud Backup</li>
                    </ul>
                  </div>

                  {/* Tier 1: 1 Month Plan */}
                  <div className="p-4 rounded-2xl bg-slate-850 border border-emerald-500/30 flex flex-col justify-between space-y-3">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                        1 Month Pro
                      </span>
                      <div className="text-xl font-black text-emerald-300 mt-1">₹499 <span className="text-xs font-normal text-slate-400">/ 30 Days</span></div>
                      <p className="text-[11px] text-slate-300 mt-1">
                        Full-featured commercial license for active courier franchises.
                      </p>
                    </div>
                    <ul className="space-y-1.5 text-[11px] text-slate-300 border-t border-slate-800 pt-3">
                      <li className="flex items-center gap-1.5">✓ Unlimited delivery fleet riders</li>
                      <li className="flex items-center gap-1.5">✓ Real-time Firestore cloud backup</li>
                      <li className="flex items-center gap-1.5">✓ Native SIM SMS receipts</li>
                    </ul>
                  </div>

                  {/* Tier 2: 3 Months Plan (Most Popular) */}
                  <div className="p-4 rounded-2xl bg-gradient-to-b from-amber-950/40 via-slate-850 to-slate-850 border border-amber-500/50 flex flex-col justify-between space-y-3 relative">
                    <div className="absolute -top-2.5 right-3 px-2 py-0.5 rounded-full text-[9px] font-black bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 uppercase shadow">
                      Most Popular
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                        3 Months Pro (Save ₹98)
                      </span>
                      <div className="text-xl font-black text-amber-300 mt-1">₹1,399 <span className="text-xs font-normal text-slate-400">/ 90 Days</span></div>
                      <p className="text-[11px] text-slate-300 mt-1">
                        Best seller for quarterly courier operations with instant savings.
                      </p>
                    </div>
                    <ul className="space-y-1.5 text-[11px] text-slate-300 border-t border-slate-800 pt-3">
                      <li className="flex items-center gap-1.5">✓ All 1-Month Pro features</li>
                      <li className="flex items-center gap-1.5">✓ Instant PayU Auto-Approval</li>
                      <li className="flex items-center gap-1.5">✓ Advance recovery ledger sync</li>
                    </ul>
                  </div>

                  {/* Tier 3: 1 Year Plan (Best Value) */}
                  <div className="p-4 rounded-2xl bg-slate-850 border border-blue-500/30 flex flex-col justify-between space-y-3 relative">
                    <div className="absolute -top-2.5 right-3 px-2 py-0.5 rounded-full text-[9px] font-black bg-blue-500 text-slate-950 uppercase shadow">
                      Save ₹989
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">
                        1 Year Pro
                      </span>
                      <div className="text-xl font-black text-blue-300 mt-1">₹4,999 <span className="text-xs font-normal text-slate-400">/ Year</span></div>
                      <p className="text-[11px] text-slate-300 mt-1">
                        Annual enterprise license with priority telephone support.
                      </p>
                    </div>
                    <ul className="space-y-1.5 text-[11px] text-slate-400 border-t border-slate-800 pt-3">
                      <li className="flex items-center gap-1.5">✓ All Pro features + VIP support</li>
                      <li className="flex items-center gap-1.5">✓ Multi-device & Excel backups</li>
                      <li className="flex items-center gap-1.5">✓ Guaranteed 99.9% uptime SLA</li>
                    </ul>
                  </div>
                </div>

                <div className="mt-3.5 p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 text-[11px] text-slate-400 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    Payment Security: All transactions are processed through RBI-authorized payment aggregators (PayU / UPI / NetBanking / Cards) with 256-bit SSL encryption.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Privacy Policy & Terms of Service */}
          {activeTab === 'privacy' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="bg-slate-850 border border-slate-755 rounded-2xl p-5 sm:p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-purple-500/15 text-purple-400 border border-purple-500/30">
                    <Lock className="w-4 h-4" />
                  </span>
                  <h3 className="text-base font-bold text-white">
                    Privacy Policy & Data Security (गोपनीयता नीति)
                  </h3>
                </div>

                <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
                  <p>
                    <strong>1. Information Collection & Purpose:</strong> We collect necessary courier hub operational data including Rider Name, 10-digit mobile phone number, vehicle type, daily delivery counts, and payout settlement amounts. This information is used strictly to compute rider remuneration, calculate cash advance balances, and send automated salary receipts requested by the administrator.
                  </p>

                  <p>
                    <strong>2. Zero Third-Party Sharing Policy:</strong> We uphold strict confidentiality. We NEVER sell, lease, rent, trade, or disclose rider contact numbers, customer delivery parcels, or financial balances to any third-party marketing, advertising, or data collection networks.
                  </p>

                  <p>
                    <strong>3. Data Storage & Encryption:</strong> All delivery entries, advances, and settlement transactions are protected with industry-standard cryptographic encryption both in transit (TLS 1.3) and at rest on secure cloud servers.
                  </p>

                  <p>
                    <strong>4. Telephony & SMS Compliance:</strong> When sending operational SMS notifications (such as advance cash receipts or salary settlements), messages are dispatched solely for transactional communication requested by the hub administrator.
                  </p>
                </div>
              </div>

              {/* Terms of Service Section */}
              <div className="bg-slate-850 border border-slate-755 rounded-2xl p-5 sm:p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/30">
                    <FileText className="w-4 h-4" />
                  </span>
                  <h3 className="text-base font-bold text-white">
                    Terms of Service & Platform Usage (उपयोग के नियम)
                  </h3>
                </div>

                <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
                  <p>
                    <strong>1. Authorized Account Access:</strong> Hub management accounts are intended for verified courier business owners, dispatch supervisors, and logistics coordinators. Users are responsible for safeguarding their login credentials.
                  </p>

                  <p>
                    <strong>2. Accurate Accounting:</strong> Hub administrators are responsible for verifying actual courier parcel delivery counts before final mark-as-paid actions. System calculations serve as an automated ledger tool for franchisee operations.
                  </p>

                  <p>
                    <strong>3. Applicable Laws & Jurisdiction:</strong> Any dispute arising from using {platformName} shall be governed by the laws of India and subject to the jurisdiction of the competent courts in Jharkhand, India.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Refund & Cancellation Policy */}
          {activeTab === 'refund' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="bg-slate-850 border border-slate-755 rounded-2xl p-5 sm:p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-rose-500/15 text-rose-400 border border-rose-500/30">
                    <RotateCcw className="w-4 h-4" />
                  </span>
                  <h3 className="text-base font-bold text-white">
                    Refund & Cancellation Policy (रिफंड व रद्दीकरण नीति)
                  </h3>
                </div>

                <p className="text-xs text-slate-300">
                  Our refund and cancellation policy complies fully with consumer protection norms and digital payment gateway guidelines:
                </p>

                <div className="space-y-3 pt-2 text-xs text-slate-300">
                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                    <h4 className="font-bold text-rose-300 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-rose-400" />
                      <span>1. Cancellation Request Window (48 to 72 Hours)</span>
                    </h4>
                    <p className="text-slate-300">
                      Hub administrators who purchase a Monthly or Annual Hub License may request cancellation within <strong>48 to 72 hours</strong> of transaction completion if they experience technical issues or if the service does not meet operational expectations.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                    <h4 className="font-bold text-emerald-300 flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                      <span>2. Refund Processing Time (5 to 7 Business Days)</span>
                    </h4>
                    <p className="text-slate-300">
                      Once a refund request is validated, the payment is initiated for reversal immediately and credited back to the <strong>original source of payment</strong> (Credit Card, Debit Card, Net Banking, UPI, or PayU Wallet) within <strong>5 to 7 business days</strong> as per banking turnaround standards.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                    <h4 className="font-bold text-blue-300 flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 text-blue-400" />
                      <span>3. How to Request a Refund</span>
                    </h4>
                    <p className="text-slate-300">
                      To initiate a refund, write directly to <strong className="text-white font-mono">{supportEmail}</strong> or call <strong className="text-white font-mono">{supportPhone}</strong> with your registered User Email, Payment Transaction ID, and Reason for Refund. Our billing support team acknowledges within 24 hours.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                    <h4 className="font-bold text-amber-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                      <span>4. Subscription Renewal Cancellation</span>
                    </h4>
                    <p className="text-slate-300">
                      Hub licenses do not auto-debit without explicit user authorization. You can choose not to renew at the end of your validity period with zero cancellation fees or penalties.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 bg-slate-850/90 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Compliant with Indian IT Act, RBI Payment Aggregator Guidelines & Google Play Developer Policy</span>
          </div>

          <button
            type="button"
            id="close-legal-modal-bottom-btn"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-white font-bold text-xs border border-slate-700 transition active:scale-95 text-center cursor-pointer"
          >
            Close Policies Dialog
          </button>
        </div>
      </div>
    </div>
  );
};
