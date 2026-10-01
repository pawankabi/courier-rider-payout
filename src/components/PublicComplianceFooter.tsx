import React from 'react';
import { 
  Building2, 
  Phone, 
  Mail, 
  MapPin, 
  Clock, 
  ShieldCheck, 
  Lock, 
  CheckCircle2, 
  Scale, 
  FileText, 
  RotateCcw, 
  CreditCard,
  Zap,
  ExternalLink
} from 'lucide-react';
import { PolicyTab } from './LegalPoliciesModal';

interface PublicComplianceFooterProps {
  onOpenPolicy: (tab: PolicyTab) => void;
  platformName?: string;
  merchantName?: string;
  supportPhone?: string;
  supportEmail?: string;
  supportAddress?: string;
  operatingHours?: string;
}

export const PublicComplianceFooter: React.FC<PublicComplianceFooterProps> = ({
  onOpenPolicy,
  platformName = 'Courier Rider Payout',
  merchantName = 'Pawan Kabi',
  supportPhone = '+91 9110913070',
  supportEmail = 'pawankabiseraikella@gmail.com',
  supportAddress = 'Saraikela, Jharkhand, India',
  operatingHours = 'Mon - Sat, 10:00 AM - 07:00 PM IST',
}) => {
  return (
    <footer 
      id="public-compliance-footer"
      className="w-full mt-10 border-t border-slate-800/90 bg-gradient-to-b from-slate-900/90 via-slate-950 to-slate-950 text-slate-300 pb-28 sm:pb-12 pt-8 sm:pt-10 transition-colors"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-8">
        {/* Top Tier: Brand, Trust Badges, and Mission Statement */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-800/80">
          <div className="space-y-1.5 max-w-xl">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="p-1.5 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 text-slate-950 font-black shadow-md shadow-amber-500/20">
                <Scale className="w-4 h-4 text-slate-950" />
              </span>
              <h3 className="text-base sm:text-lg font-black text-white tracking-tight">
                {platformName} <span className="text-xs font-semibold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/25">({merchantName})</span>
              </h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              India's dedicated Logistics Software-as-a-Service (SaaS) and Courier Fleet Payout Management Platform. Empowering courier franchisees and hub managers with automated parcel remunations, loan advance accounting, and SIM communications.
            </p>
          </div>

          {/* Security & Verification Badges */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold shadow-sm">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>PayU Verified Merchant</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-950/40 border border-blue-500/40 text-blue-300 text-[11px] font-bold shadow-sm">
              <Lock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>256-Bit SSL Encrypted</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-950/40 border border-purple-500/40 text-purple-300 text-[11px] font-bold shadow-sm">
              <CheckCircle2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <span>RBI & IT Act Compliant</span>
            </div>
          </div>
        </div>

        {/* Middle Tier: Grid of Navigation, Merchant Contact, Operational Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-xs">
          {/* Column 1: Mandatory Legal & Compliance Links */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5" />
              <span>Legal & Policies</span>
            </h4>
            <ul className="space-y-2">
              <li>
                <button
                  type="button"
                  id="footer-link-about"
                  onClick={() => onOpenPolicy('about')}
                  className="text-slate-300 hover:text-amber-300 transition-colors flex items-center gap-1.5 font-medium cursor-pointer text-left"
                >
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  <span>About Us & Contact Us</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  id="footer-link-pricing"
                  onClick={() => onOpenPolicy('pricing')}
                  className="text-slate-300 hover:text-emerald-300 transition-colors flex items-center gap-1.5 font-medium cursor-pointer text-left"
                >
                  <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                  <span>Pricing & Services</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  id="footer-link-terms"
                  onClick={() => onOpenPolicy('terms')}
                  className="text-slate-300 hover:text-indigo-300 transition-colors flex items-center gap-1.5 font-medium cursor-pointer text-left"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  <span>Terms & Conditions</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  id="footer-link-privacy"
                  onClick={() => onOpenPolicy('privacy')}
                  className="text-slate-300 hover:text-purple-300 transition-colors flex items-center gap-1.5 font-medium cursor-pointer text-left"
                >
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Privacy Policy</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  id="footer-link-refund"
                  onClick={() => onOpenPolicy('refund')}
                  className="text-slate-300 hover:text-rose-300 transition-colors flex items-center gap-1.5 font-medium cursor-pointer text-left"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                  <span>Refund & Cancellation Policy</span>
                </button>
              </li>
            </ul>
          </div>

          {/* Column 2: Merchant & Entity Details */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-blue-400" />
              <span>Merchant Information</span>
            </h4>
            <div className="space-y-2 text-slate-400">
              <div>
                <span className="text-[10px] uppercase text-slate-500 font-bold block">Operating Entity:</span>
                <span className="text-slate-200 font-semibold">{platformName}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-500 font-bold block">Founder / Merchant:</span>
                <span className="text-slate-200 font-semibold">{merchantName}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-500 font-bold block">Nature of Business:</span>
                <span className="text-slate-300">Logistics SaaS & Fleet Payout Management Platform</span>
              </div>
            </div>
          </div>

          {/* Column 3: Contact & Support Desk */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-emerald-400" />
              <span>Official Support Desk</span>
            </h4>
            <div className="space-y-2 text-slate-400">
              <div>
                <span className="text-[10px] uppercase text-slate-500 font-bold block">Mobile / Helpline:</span>
                <a 
                  href={`tel:${supportPhone.replace(/\s+/g, '')}`} 
                  className="text-slate-200 hover:text-emerald-400 font-mono font-bold transition-colors inline-block"
                >
                  {supportPhone}
                </a>
              </div>
              <div className="overflow-hidden">
                <span className="text-[10px] uppercase text-slate-500 font-bold block">Email Address:</span>
                <a 
                  href={`mailto:${supportEmail}`} 
                  className="text-slate-200 hover:text-blue-400 font-mono transition-colors block truncate"
                  title={supportEmail}
                >
                  {supportEmail}
                </a>
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-500 font-bold block">Turnaround SLA:</span>
                <span className="text-slate-300">Within 24 Hours Response</span>
              </div>
            </div>
          </div>

          {/* Column 4: Address, Hours & Fulfillment */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-amber-400" />
              <span>Office & Operations</span>
            </h4>
            <div className="space-y-2 text-slate-400">
              <div>
                <span className="text-[10px] uppercase text-slate-500 font-bold block">Registered Location:</span>
                <span className="text-slate-300 block">{supportAddress}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-500 font-bold block">Business Hours:</span>
                <span className="text-slate-300 block">{operatingHours}</span>
              </div>
              <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 flex items-start gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span className="text-[11px] text-amber-200 leading-tight">
                  <strong>Service Delivery:</strong> Instant digital activation upon PayU payment receipt.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Tier: Copyright, Statutory Statement, and Refund Notice */}
        <div className="pt-6 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[11px] text-slate-500">
          <div>
            © {new Date().getFullYear()} <strong>{platformName}</strong> ({merchantName}). All rights reserved.
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => onOpenPolicy('refund')}
              className="text-slate-400 hover:text-slate-200 transition-colors underline cursor-pointer"
            >
              48–72h Refund Policy (5–7 Business Days Settlement)
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={() => onOpenPolicy('privacy')}
              className="text-slate-400 hover:text-slate-200 transition-colors underline cursor-pointer"
            >
              Zero Third-Party Data Sharing
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};
