import React, { useState, useMemo } from 'react';
import { Sparkles, MessageCircle, Calendar, Send, ChevronRight, Bell, Info } from 'lucide-react';
import { Rider } from '../types';
import { getFestivalAlert, FESTIVALS, Festival } from '../data/festivals';
import { FestivalGreetingsModal } from './FestivalGreetingsModal';

interface Props {
  riders: Rider[];
  hubSignature?: string;
}

export const FestivalBannerCard: React.FC<Props> = ({ riders, hubSignature }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Compute smart calendar alert
  const smartAlert = useMemo(() => getFestivalAlert(), []);

  // Selected festival in card preview
  const [selectedFestivalId, setSelectedFestivalId] = useState<string>(() => {
    return smartAlert.festival.id;
  });

  const activeFestival = useMemo(() => {
    return FESTIVALS.find((f) => f.id === selectedFestivalId) || smartAlert.festival;
  }, [selectedFestivalId, smartAlert.festival]);

  const handleOpenFestival = (festId: string) => {
    setSelectedFestivalId(festId);
    setIsModalOpen(true);
  };

  // Important local Seraikella & major folk pujas to display in quick pills
  const featuredQuickPills = useMemo(() => {
    const featuredIds = [
      'maa_manasa_puja',
      'vishwakarma_puja',
      'bhokta_parab',
      'chhau_parv',
      'gram_than_jaher_than',
      'buru_bonga',
      'sarhul',
      'karma',
      'tusu_parab',
      'saraswati_puja',
      'maha_shivratri',
      'diwali',
      'chhath',
      'durga_puja'
    ];
    return FESTIVALS.filter((f) => featuredIds.includes(f.id));
  }, []);

  return (
    <>
      <div 
        id="festival-greetings-card"
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-600/25 via-orange-600/20 to-amber-950/35 border border-amber-500/40 shadow-md shadow-orange-950/20 backdrop-blur-md p-4 sm:p-5 transition hover:border-amber-500/60 space-y-3"
      >
        {/* Decorative ambient light */}
        <div className="absolute -top-16 -right-16 w-56 h-56 bg-amber-500/12 rounded-full blur-3xl pointer-events-none" />

        {/* 1. Smart Tomorrow / Today / Upcoming Alert Badge Banner */}
        {smartAlert.status === 'today' && (
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold animate-pulse">
            <span className="flex items-center gap-1.5">
              <span>🎉</span>
              <span>आज का पावन पर्व: <strong className="text-white">{smartAlert.festival.nameHindi}</strong>!</span>
            </span>
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/30 text-white font-extrabold">
              Today Active
            </span>
          </div>
        )}

        {smartAlert.status === 'tomorrow' && (
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-amber-500/20 border border-yellow-500/40 text-yellow-300 text-xs font-bold">
            <span className="flex items-center gap-1.5">
              <span>🔔</span>
              <span>कल का परब: <strong className="text-white">{smartAlert.festival.nameHindi}</strong> — कल यह पर्व मनाया जाएगा!</span>
            </span>
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-yellow-500/30 text-slate-950 font-black">
              Tomorrow Alert
            </span>
          </div>
        )}

        {smartAlert.status === 'upcoming' && (
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-300 text-xs font-semibold">
            <span className="flex items-center gap-1.5">
              <span>🗓️</span>
              <span>आगामी पर्व: <strong className="text-white">{smartAlert.festival.nameHindi}</strong> ({smartAlert.daysDiff} दिन बाद - {smartAlert.festival.dateLabel})</span>
            </span>
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/25 text-blue-200 font-bold">
              Upcoming
            </span>
          </div>
        )}

        {/* 2. Main Card Content */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-slate-950 font-black flex items-center justify-center text-xl shadow-lg shrink-0">
              🎉
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {activeFestival.badge}
                </span>
                <span className="text-xs text-slate-400 font-medium">
                  {activeFestival.dateLabel}
                </span>
                <span className="text-[10px] px-2 py-0.2 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  {activeFestival.region}
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-extrabold text-white mt-0.5 tracking-tight flex items-center gap-2">
                <span>{activeFestival.nameHindi}</span>
              </h3>
              <p className="text-xs text-slate-300 mt-0.5 line-clamp-1">
                {activeFestival.description}
              </p>
            </div>
          </div>

          {/* Action button */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              id="open-festival-greetings-btn"
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-amber-500/20 active:scale-95 transition"
            >
              <MessageCircle className="w-4 h-4 text-slate-950" />
              <span>त्यौहार शुभकामना भेजें (WhatsApp/SMS)</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-950" />
            </button>
          </div>
        </div>

        {/* 3. Cultural summary snippet */}
        <div className="text-[11px] text-amber-200/90 bg-amber-950/25 px-3 py-1.5 rounded-lg border border-amber-500/20 line-clamp-2">
          <strong className="text-amber-300">सरायकेला परंपरा:</strong> {activeFestival.culturalSignificance}
        </div>

        {/* 4. Quick festival pills preview */}
        <div className="pt-2 border-t border-slate-800/80 flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] scrollbar-none">
          <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider shrink-0 mr-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>Pujas:</span>
          </span>
          {featuredQuickPills.map((fest) => {
            const isSelected = fest.id === activeFestival.id;
            return (
              <button
                key={fest.id}
                type="button"
                onClick={() => handleOpenFestival(fest.id)}
                className={`px-2.5 py-1 rounded-lg border whitespace-nowrap transition shrink-0 text-xs font-semibold ${
                  isSelected
                    ? 'bg-amber-500/25 text-amber-300 border-amber-500/50 font-bold'
                    : 'bg-slate-850/80 text-slate-300 border-slate-750 hover:text-white hover:border-slate-600'
                }`}
              >
                {fest.nameHindi.split(' ')[0]}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="px-2.5 py-1 rounded-lg text-amber-400 hover:text-amber-300 whitespace-nowrap transition font-bold text-xs shrink-0"
          >
            + All {FESTIVALS.length} Pujas
          </button>
        </div>
      </div>

      {isModalOpen && (
        <FestivalGreetingsModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          riders={riders}
          initialFestivalId={selectedFestivalId}
          hubSignature={hubSignature}
        />
      )}
    </>
  );
};
