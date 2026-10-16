import React, { useState, useMemo } from 'react';
import { 
  Banknote, 
  ChevronDown, 
  ChevronUp, 
  Share2, 
  Copy, 
  Check, 
  Coins, 
  AlertCircle,
  FileSpreadsheet
} from 'lucide-react';
import { CodDailyEntry } from '../../types';
import { formatINR } from '../../utils/formatters';
import { 
  aggregateDailyDenominations, 
  formatDenominationShareText 
} from '../../utils/denominationUtils';

export interface DailyConsolidatedDenominationSummaryProps {
  entries: CodDailyEntry[];
  selectedDate: string;
  hubName?: string;
  isDarkTheme?: boolean;
}

export const DailyConsolidatedDenominationSummary: React.FC<DailyConsolidatedDenominationSummaryProps> = ({
  entries,
  selectedDate,
  hubName = 'सरायकेला कूरियर हब',
  isDarkTheme = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showAllNotes, setShowAllNotes] = useState(false);
  const [copied, setCopied] = useState(false);

  const summary = useMemo(() => {
    return aggregateDailyDenominations(entries);
  }, [entries]);

  const displayedItems = showAllNotes ? summary.allItems : summary.activeItems;

  const handleCopy = () => {
    const text = formatDenominationShareText(selectedDate, summary, hubName);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const handleWhatsApp = () => {
    const text = formatDenominationShareText(selectedDate, summary, hubName);
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Base background styling matching surrounding theme
  const containerClass = isDarkTheme
    ? 'bg-slate-900 border-slate-800 text-white'
    : 'bg-white border-slate-200 text-slate-900';

  const headerClass = isDarkTheme
    ? 'bg-slate-850 border-slate-800'
    : 'bg-gradient-to-r from-emerald-50/60 via-slate-50 to-teal-50/60 border-slate-200';

  const cardBgClass = isDarkTheme
    ? 'bg-slate-950/70 border-slate-800'
    : 'bg-slate-50/80 border-slate-200';

  const totalRowClass = isDarkTheme
    ? 'bg-slate-950 border-emerald-500/30'
    : 'bg-emerald-50/80 border-emerald-200';

  return (
    <div 
      id="daily-consolidated-denomination-summary"
      className={`rounded-2xl border shadow-sm overflow-hidden transition-all duration-200 ${containerClass}`}
    >
      {/* 1. Header / Accordion Toggle Bar */}
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className={`px-4 sm:px-5 py-3.5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none transition ${headerClass}`}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
            <Banknote className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold flex items-center gap-2 flex-wrap">
              <span>📊 आज का कुल कैश नोट विवरण</span>
              <span className={`text-[11px] font-semibold ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                (Daily Consolidated Denomination Summary)
              </span>
            </h3>
            <p className={`text-xs mt-0.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
              तारीख: <strong className={isDarkTheme ? 'text-emerald-300' : 'text-emerald-700'}>{selectedDate}</strong> • {summary.totalRidersWithCash} राइडर्स ने कैश जमा किया
            </p>
          </div>
        </div>

        {/* Quick Stats Badges & Actions */}
        <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
          <div className={`px-3 py-1 rounded-xl text-xs font-mono font-bold border ${
            isDarkTheme 
              ? 'bg-slate-800 border-slate-700 text-slate-300' 
              : 'bg-white border-slate-200 text-slate-700 shadow-2xs'
          }`}>
            <span>कुल नोट: </span>
            <strong className={isDarkTheme ? 'text-emerald-400' : 'text-emerald-600'}>
              {summary.totalNotes}
            </strong>
          </div>

          <div className={`px-3 py-1 rounded-xl text-xs font-mono font-bold border ${
            isDarkTheme 
              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300' 
              : 'bg-emerald-100/70 border-emerald-300 text-emerald-800'
          }`}>
            <span>कुल कैश: </span>
            <strong className="text-sm font-black">
              ₹{formatINR(summary.totalAmount || summary.totalCashDeposited)}
            </strong>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            className={`p-2 rounded-xl border text-xs font-semibold transition cursor-pointer ${
              isDarkTheme 
                ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300' 
                : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700 shadow-2xs'
            }`}
            title="नोट विवरण कॉपी करें"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleWhatsApp();
            }}
            className="p-2 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-slate-950 font-bold transition shadow-2xs cursor-pointer"
            title="WhatsApp पर सारांश भेजें"
          >
            <Share2 className="w-4 h-4" />
          </button>

          <div className={`p-1.5 rounded-lg ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
        </div>
      </div>

      {/* 2. Expandable Body Content */}
      {isExpanded && (
        <div className="p-4 sm:p-5 space-y-4">
          {/* Filter Toolbar: Active only vs Show All Standard Notes */}
          <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
            <span className={`font-medium ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
              दैनिक बैंक कैश जमा व तिजोरी मिलान हेतु समेकित विवरण:
            </span>

            <button
              type="button"
              onClick={() => setShowAllNotes(!showAllNotes)}
              className={`px-3 py-1 rounded-lg border font-semibold transition cursor-pointer ${
                showAllNotes
                  ? isDarkTheme 
                    ? 'bg-blue-950 border-blue-600 text-blue-300' 
                    : 'bg-blue-50 border-blue-300 text-blue-700'
                  : isDarkTheme 
                    ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' 
                    : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {showAllNotes ? 'सक्रिय नोट ही दिखाएं (Active Only)' : 'सभी नोट दिखाएं (Show All ₹1-₹2000)'}
            </button>
          </div>

          {/* Empty State */}
          {displayedItems.length === 0 ? (
            <div className={`p-8 text-center rounded-2xl border ${
              isDarkTheme ? 'bg-slate-950/40 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'
            }`}>
              <Coins className="w-8 h-8 mx-auto mb-2 text-slate-400 stroke-1" />
              <p className="text-sm font-semibold">
                इस तारीख ({selectedDate}) के लिए अभी तक कोई नोट विवरण दर्ज नहीं किया गया है।
              </p>
              <p className="text-xs mt-1 text-slate-400">
                राइडर या इंचार्ज द्वारा कैश एंट्री करते समय 💵 आइकॉन पर क्लिक करके नोटों का विवरण दर्ज करें।
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Responsive Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {displayedItems.map((item) => {
                  const hasCount = item.count > 0;
                  return (
                    <div 
                      key={item.value} 
                      className={`p-3 rounded-xl border flex items-center justify-between transition ${cardBgClass} ${
                        hasCount ? 'ring-1 ring-emerald-500/20' : 'opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`w-9 h-9 rounded-xl flex items-center justify-center font-mono font-black text-xs ${
                          item.value >= 500
                            ? isDarkTheme ? 'bg-purple-950/80 text-purple-300 border border-purple-800' : 'bg-purple-100 text-purple-800 border border-purple-200'
                            : item.value >= 100
                            ? isDarkTheme ? 'bg-blue-950/80 text-blue-300 border border-blue-800' : 'bg-blue-100 text-blue-800 border border-blue-200'
                            : isDarkTheme ? 'bg-amber-950/80 text-amber-300 border border-amber-800' : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}>
                          ₹{item.value}
                        </span>
                        <div>
                          <div className={`font-mono text-xs ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                            ₹{item.value} × <strong className={`text-sm ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{item.count}</strong> नोट
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {hasCount ? 'उप-योग (Subtotal)' : 'कोई नोट नहीं'}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className={`font-mono font-extrabold text-sm ${
                          hasCount 
                            ? isDarkTheme ? 'text-emerald-400' : 'text-emerald-700'
                            : isDarkTheme ? 'text-slate-500' : 'text-slate-400'
                        }`}>
                          ₹{formatINR(item.subtotal)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Grand Total Row */}
              <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-3 ${totalRowClass}`}>
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-emerald-600 text-white font-bold text-xs">
                    GRAND TOTAL
                  </div>
                  <div>
                    <h4 className={`text-sm font-extrabold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                      कुल नोट योग (Consolidated Hub Total)
                    </h4>
                    <p className={`text-xs ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                      सभी राइडर्स के कैश नोटों का कुल योग
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-6 text-right">
                  <div>
                    <span className={`text-[10px] uppercase font-bold tracking-wider block ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                      कुल नोट (Total Notes)
                    </span>
                    <span className={`font-mono font-black text-lg ${isDarkTheme ? 'text-slate-200' : 'text-slate-800'}`}>
                      {summary.totalNotes}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-600 block">
                      कुल कैश (Total Cash)
                    </span>
                    <span className={`font-mono font-black text-xl sm:text-2xl ${
                      isDarkTheme ? 'text-emerald-400' : 'text-emerald-700'
                    }`}>
                      ₹{formatINR(summary.totalAmount)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Reconciliation Warning if physical cash deposited exceeds denomination breakdown */}
              {summary.totalCashDeposited > summary.totalAmount && (
                <div className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                  isDarkTheme ? 'bg-amber-950/40 border-amber-800 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}>
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                    <span>
                      कुछ राइडर्स का कुल कैश <strong>₹{formatINR(summary.totalCashDeposited)}</strong> है, जिसमें से <strong>₹{formatINR(summary.totalAmount)}</strong> का नोट विवरण दर्ज है (शेष: ₹{formatINR(summary.totalCashDeposited - summary.totalAmount)} का नोट विवरण पेंडिंग है)।
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DailyConsolidatedDenominationSummary;
