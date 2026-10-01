import React, { useState, useEffect } from 'react';
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
  Zap,
  UserCheck
} from 'lucide-react';
import { formatINR } from '../utils/formatters';

export type PolicyTab = 'about' | 'pricing' | 'terms' | 'privacy' | 'refund';

interface LegalPoliciesModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: PolicyTab;
  platformName?: string;
  merchantName?: string;
  supportEmail?: string;
  supportPhone?: string;
  supportAddress?: string;
  operatingHours?: string;
}

export const LegalPoliciesModal: React.FC<LegalPoliciesModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'about',
  platformName = 'Courier Rider Payout',
  merchantName = 'Pawan Kabi',
  supportEmail = 'pawankabiseraikella@gmail.com',
  supportPhone = '+91 9110913070',
  supportAddress = 'Saraikela, Jharkhand, India',
  operatingHours = 'Mon - Sat, 10:00 AM - 07:00 PM IST',
}) => {
  const [activeTab, setActiveTab] = useState<PolicyTab>(initialTab);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const handleCopySummary = () => {
    const summary = `${platformName} (${merchantName})\nOfficial Support Phone: ${supportPhone}\nOfficial Support Email: ${supportEmail}\nOperating Address: ${supportAddress}\nOperating Hours: ${operatingHours}\nRefund Window: 48-72 Hours (Processed within 5-7 business days)\nService Fulfillment: Instant Digital Service Activation`;
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
        <div className="p-4 sm:p-5 bg-slate-850/90 border-b border-slate-800 flex items-center justify-between gap-3">
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
                  Legal & Compliance Hub
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {platformName} ({merchantName}) • Official Regulatory & Merchant Policies
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

        {/* 5-Tab Policy Switcher */}
        <div className="flex items-center gap-1 p-2 bg-slate-950/70 border-b border-slate-800/80 overflow-x-auto no-scrollbar">
          <button
            type="button"
            id="tab-policy-about"
            onClick={() => setActiveTab('about')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
              activeTab === 'about'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>1. About & Contact</span>
          </button>

          <button
            type="button"
            id="tab-policy-pricing"
            onClick={() => setActiveTab('pricing')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
              activeTab === 'pricing'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>2. Pricing & Delivery</span>
          </button>

          <button
            type="button"
            id="tab-policy-terms"
            onClick={() => setActiveTab('terms')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
              activeTab === 'terms'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>3. Terms & Conditions</span>
          </button>

          <button
            type="button"
            id="tab-policy-privacy"
            onClick={() => setActiveTab('privacy')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
              activeTab === 'privacy'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>4. Privacy Policy</span>
          </button>

          <button
            type="button"
            id="tab-policy-refund"
            onClick={() => setActiveTab('refund')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
              activeTab === 'refund'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>5. Refund & Cancellation</span>
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
                      SaaS Platform & Merchant Information
                    </span>
                    <h3 className="text-lg font-black text-white mt-0.5">
                      {platformName}
                    </h3>
                    <p className="text-xs text-slate-300 mt-1">
                      Logistics SaaS & Fleet Payout Management Platform operated by <strong>{merchantName}</strong>.
                    </p>
                  </div>
                  <span className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
                    <Building2 className="w-6 h-6" />
                  </span>
                </div>

                <div className="border-t border-slate-800 pt-4 text-xs text-slate-300 space-y-2">
                  <p>
                    <strong>About Our Platform:</strong> <strong>{platformName}</strong> is an enterprise-grade logistics payout accounting platform developed to empower courier delivery franchisees, hub managers, and fleet coordinators across India. The software provides an end-to-end digital system for parcel dispatch logging, customizable per-parcel incentive rate cards, two-way cash advance ledgers, automated 15-day settlements, and direct native SIM SMS payout receipts.
                  </p>
                  <p>
                    <strong>Nature of Business:</strong> Logistics SaaS & Fleet Payout Management Platform.
                  </p>
                </div>
              </div>

              {/* Mandatory Merchant & Contact Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Founder / Merchant */}
                <div className="p-4 rounded-2xl bg-slate-850 border border-slate-800 flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 shrink-0">
                    <UserCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Founder & Merchant Name
                    </h4>
                    <p className="text-sm font-bold text-white mt-0.5">
                      {merchantName}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Primary Operator & Business Entity
                    </p>
                  </div>
                </div>

                {/* Contact Phone */}
                <div className="p-4 rounded-2xl bg-slate-850 border border-slate-800 flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
                    <Phone className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Contact Mobile / WhatsApp
                    </h4>
                    <p className="text-sm font-bold text-white mt-0.5 font-mono">
                      {supportPhone}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Direct Voice Helpline & WhatsApp Support
                    </p>
                  </div>
                </div>

                {/* Contact Email */}
                <div className="p-4 rounded-2xl bg-slate-850 border border-slate-800 flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/30 shrink-0">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div className="overflow-hidden">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Official Contact Email
                    </h4>
                    <p className="text-sm font-bold text-white mt-0.5 font-mono truncate">
                      {supportEmail}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Inquiries & Billing Support (Response within 24h)
                    </p>
                  </div>
                </div>

                {/* Operating Address */}
                <div className="p-4 rounded-2xl bg-slate-850 border border-slate-800 flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Operating Address
                    </h4>
                    <p className="text-xs font-bold text-slate-200 mt-0.5">
                      {supportAddress}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Saraikela, Jharkhand, India
                    </p>
                  </div>
                </div>

                {/* Operating Hours */}
                <div className="p-4 rounded-2xl bg-slate-850 border border-slate-800 flex items-start gap-3 sm:col-span-2">
                  <div className="p-2.5 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30 shrink-0">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Operational Business Hours
                    </h4>
                    <p className="text-sm font-bold text-white mt-0.5">
                      {operatingHours}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Monday to Saturday (Excluding National Public Holidays)
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Pricing & Service Delivery */}
          {activeTab === 'pricing' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Service Delivery & Instant Fulfillment Highlight */}
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-950/70 via-slate-850 to-teal-950/70 border border-emerald-500/40 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="p-1 rounded-lg bg-emerald-500/20 text-emerald-400">
                    <Zap className="w-4 h-4" />
                  </span>
                  <h4 className="text-sm font-black text-white uppercase tracking-wider">
                    Service Fulfillment Policy (तत्काल सेवा वितरण)
                  </h4>
                </div>
                <p className="text-xs text-emerald-200/90 leading-relaxed">
                  <strong>Instant Digital Service Activation:</strong> {platformName} is a cloud-hosted SaaS digital service. Upon successful payment confirmation via our PayU / UPI payment gateway, the user's subscription license is <strong>immediately activated within 0 to 60 seconds</strong>. Unlimited riders, Firebase multi-device cloud synchronization, automated SMS dispatch, and PDF settlement exports unlock automatically with zero manual delays.
                </p>
              </div>

              {/* Transparent Pricing Slabs Card */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-white">
                    Commercial Subscription Plans (योजनाएं एवं शुल्क)
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    All prices in Indian Rupees (INR) • Taxes included
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
                  {/* Starter / Free Tier */}
                  <div className="p-4 rounded-2xl bg-slate-850 border border-slate-800 flex flex-col justify-between space-y-3">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Starter Evaluation
                      </span>
                      <div className="text-xl font-black text-white mt-1">₹0 <span className="text-xs font-normal text-slate-400">/ Free</span></div>
                      <p className="text-[11px] text-slate-300 mt-1">
                        Evaluation tier for independent hub supervisors.
                      </p>
                    </div>
                    <ul className="space-y-1.5 text-[11px] text-slate-400 border-t border-slate-800 pt-3">
                      <li className="flex items-center gap-1.5">✓ Up to 3 active delivery riders</li>
                      <li className="flex items-center gap-1.5">✓ Local device offline cache storage</li>
                      <li className="flex items-center gap-1.5">✓ Basic payout calculation</li>
                      <li className="flex items-center gap-1.5 text-slate-500">✗ No Firebase Cloud Sync</li>
                    </ul>
                  </div>

                  {/* Pro Monthly */}
                  <div className="p-4 rounded-2xl bg-slate-850 border border-emerald-500/40 flex flex-col justify-between space-y-3">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                        Pro Monthly Plan
                      </span>
                      <div className="text-xl font-black text-emerald-300 mt-1">₹499 <span className="text-xs font-normal text-slate-400">/ 30 Days</span></div>
                      <p className="text-[11px] text-slate-300 mt-1">
                        Full-featured commercial license for active delivery franchises.
                      </p>
                    </div>
                    <ul className="space-y-1.5 text-[11px] text-slate-300 border-t border-slate-800 pt-3">
                      <li className="flex items-center gap-1.5">✓ Unlimited delivery fleet riders</li>
                      <li className="flex items-center gap-1.5">✓ Realtime Firebase cloud backup</li>
                      <li className="flex items-center gap-1.5">✓ Automated SIM SMS dispatch</li>
                      <li className="flex items-center gap-1.5">✓ Instant digital activation</li>
                    </ul>
                  </div>

                  {/* Pro Quarterly (Most Popular) */}
                  <div className="p-4 rounded-2xl bg-gradient-to-b from-amber-950/40 via-slate-850 to-slate-850 border border-amber-500/50 flex flex-col justify-between space-y-3 relative">
                    <div className="absolute -top-2.5 right-3 px-2 py-0.5 rounded-full text-[9px] font-black bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 uppercase shadow">
                      Most Popular
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                        Pro Quarterly (Save ₹98)
                      </span>
                      <div className="text-xl font-black text-amber-300 mt-1">₹1,399 <span className="text-xs font-normal text-slate-400">/ 90 Days</span></div>
                      <p className="text-[11px] text-slate-300 mt-1">
                        Best seller for quarterly courier operations with instant savings.
                      </p>
                    </div>
                    <ul className="space-y-1.5 text-[11px] text-slate-300 border-t border-slate-800 pt-3">
                      <li className="flex items-center gap-1.5">✓ All Pro Monthly capabilities</li>
                      <li className="flex items-center gap-1.5">✓ Advance ledger auto-reconciliation</li>
                      <li className="flex items-center gap-1.5">✓ Multi-device real-time sync</li>
                      <li className="flex items-center gap-1.5">✓ Instant digital activation</li>
                    </ul>
                  </div>

                  {/* Pro Annual (Best Value) */}
                  <div className="p-4 rounded-2xl bg-slate-850 border border-blue-500/40 flex flex-col justify-between space-y-3 relative">
                    <div className="absolute -top-2.5 right-3 px-2 py-0.5 rounded-full text-[9px] font-black bg-blue-500 text-slate-950 uppercase shadow">
                      Save ₹989
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">
                        Pro Annual (Best Value)
                      </span>
                      <div className="text-xl font-black text-blue-300 mt-1">₹4,999 <span className="text-xs font-normal text-slate-400">/ 365 Days</span></div>
                      <p className="text-[11px] text-slate-300 mt-1">
                        Annual enterprise license with priority support and maximum savings.
                      </p>
                    </div>
                    <ul className="space-y-1.5 text-[11px] text-slate-300 border-t border-slate-800 pt-3">
                      <li className="flex items-center gap-1.5">✓ All Pro features + VIP telephone support</li>
                      <li className="flex items-center gap-1.5">✓ Multi-device & Excel ledger backups</li>
                      <li className="flex items-center gap-1.5">✓ Guaranteed 99.9% uptime SLA</li>
                      <li className="flex items-center gap-1.5">✓ Instant digital activation</li>
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

              {/* Core Platform Capabilities */}
              <div className="bg-slate-850 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-sm font-bold text-white">Platform Architectural Capabilities</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-300">
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <strong className="text-emerald-300 block mb-1">Customizable Rate Cards:</strong>
                    Hub managers configure dynamic base rates, incentive slabs, and custom payout logic tailored to their hub agreements.
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <strong className="text-emerald-300 block mb-1">Two-Way Advance Accounting:</strong>
                    Real-time cash advance tracking with automated deductions against fortnightly and monthly settlement amounts.
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <strong className="text-emerald-300 block mb-1">SIM SMS Payout Receipts:</strong>
                    Native telephony background SMS triggers dispatching exact pay calculations, deductions, and net dues directly to riders.
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <strong className="text-emerald-300 block mb-1">PDF & WhatsApp Slates:</strong>
                    1-Click rider passbooks, print-ready PDF settlement invoices, and WhatsApp shareable payout summaries.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Terms & Conditions */}
          {activeTab === 'terms' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="bg-slate-850 border border-slate-755 rounded-2xl p-5 sm:p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                    <FileText className="w-4 h-4" />
                  </span>
                  <h3 className="text-base font-bold text-white">
                    Terms & Conditions of Service (नियम व शर्तें)
                  </h3>
                </div>

                <div className="space-y-3.5 text-xs text-slate-300 leading-relaxed">
                  <p>
                    <strong>1. Acceptance of Terms:</strong> By creating an account, accessing, or subscribing to <strong>{platformName}</strong>, operated by <strong>{merchantName}</strong>, you agree to comply with and be bound by these Terms and Conditions. If you disagree with any part, you must refrain from using the service.
                  </p>

                  <p>
                    <strong>2. Service Description & Fulfillment:</strong> {platformName} provides digital cloud-based tools for courier fleet management, parcel ledger computations, advance adjustments, and communications. Being a digital SaaS platform, service fulfillment occurs instantaneously upon payment confirmation.
                  </p>

                  <p>
                    <strong>3. Authorized Account Responsibility:</strong> Accounts are intended for verified courier franchisees, depot supervisors, and fleet operators. You are responsible for safeguarding your login credentials and ensuring the legitimacy of all parcel data recorded.
                  </p>

                  <p>
                    <strong>4. Accurate Ledger Audits:</strong> Hub managers are solely responsible for auditing physical parcel deliveries and confirming settlement calculations before executing final mark-as-paid operations or sending SMS slips.
                  </p>

                  <p>
                    <strong>5. Intellectual Property:</strong> All software code, user interface designs, logos, and documentation related to {platformName} are the intellectual property of {merchantName}.
                  </p>

                  <p>
                    <strong>6. Governing Law & Jurisdiction:</strong> These Terms shall be governed by and construed in accordance with the laws of India. Any legal dispute or controversy arising out of or relating to this agreement shall be subject exclusively to the jurisdiction of the competent courts in <strong>Jharkhand, India</strong>.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Privacy Policy */}
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

                <div className="space-y-3.5 text-xs text-slate-300 leading-relaxed">
                  <p>
                    <strong>1. Information Collection & Usage:</strong> We collect necessary operational details strictly required to perform courier dispatch accounting, including Rider Name, 10-digit mobile number, vehicle details, daily parcel delivery numbers, cash advances, and settlement totals. This information is utilized exclusively for salary and payout computations.
                  </p>

                  <p>
                    <strong>2. Strict Zero Third-Party Sharing Policy:</strong> We uphold strict confidentiality. We <strong>NEVER</strong> sell, rent, lease, trade, or share rider mobile numbers, delivery counts, or financial records with any third-party marketing, advertising, or data brokerage firms.
                  </p>

                  <p>
                    <strong>3. Bank-Grade 256-Bit SSL Encryption:</strong> All client data, ledger entries, and payment interactions are encrypted in transit using 256-bit SSL / TLS 1.3 encryption and stored securely on cloud database architecture compliant with Indian Information Technology (IT) Act, 2000 standards.
                  </p>

                  <p>
                    <strong>4. Telephony & SMS Consent:</strong> Automated SIM SMS receipts (for cash advances and settled payout receipts) are initiated only upon the explicit dispatch trigger of the hub manager to provide transparent remuneration records to riders.
                  </p>

                  <p>
                    <strong>5. Data Retention & Erasure:</strong> Hub managers have complete control over their workspace and can export their full data ledger (JSON/CSV) or request account erasure by contacting <strong className="text-white font-mono">{supportEmail}</strong>.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: Refund & Cancellation Policy */}
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
                  Our refund and cancellation policies strictly adhere to Indian consumer protection regulations and PayU payment gateway merchant guidelines:
                </p>

                <div className="space-y-3 pt-2 text-xs text-slate-300">
                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                    <h4 className="font-bold text-rose-300 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-rose-400" />
                      <span>1. Cancellation Window: 48 to 72 Hours</span>
                    </h4>
                    <p className="text-slate-300">
                      Subscribers who purchase a Monthly, Quarterly, or Annual Hub License may submit a cancellation request within <strong>48 to 72 hours</strong> of transaction completion if they experience technical non-performance or if the SaaS application does not suit their hub operations.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                    <h4 className="font-bold text-emerald-300 flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                      <span>2. Refund Processing Time: 5 to 7 Business Days</span>
                    </h4>
                    <p className="text-slate-300">
                      Upon validation of the cancellation request, approved refunds are initiated immediately and credited back to the <strong>original source of payment</strong> (UPI account, Credit/Debit Card, Net Banking, or PayU Wallet) within <strong>5 to 7 business days</strong> subject to banking settlement cycles.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                    <h4 className="font-bold text-blue-300 flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 text-blue-400" />
                      <span>3. How to Request a Refund</span>
                    </h4>
                    <p className="text-slate-300">
                      To initiate a refund, write directly to <strong className="text-white font-mono">{supportEmail}</strong> or call <strong className="text-white font-mono">{supportPhone}</strong> with your registered Email ID, PayU Transaction ID / Bank UTR number, and Reason for Refund. Our support desk responds within 24 hours.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                    <h4 className="font-bold text-amber-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                      <span>4. Zero Cancellation Charges</span>
                    </h4>
                    <p className="text-slate-300">
                      Subscriptions do not carry automatic recurring deductions without authorization. You can choose not to renew at the end of your billing cycle with zero cancellation fees or penalty deductions.
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
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            <span>Compliant with Indian IT Act 2000, RBI Payment Aggregator Guidelines & PayU Merchant Norms</span>
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
