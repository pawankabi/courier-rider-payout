import React, { useState, useEffect } from 'react';
import { Users, Calendar, Check, X, Clock, Briefcase, Search, CheckCircle2 } from 'lucide-react';
import { Rider, RiderAttendanceRecord } from '../types';
import { loadRiderAttendance, saveRiderAttendance } from '../services/hubOperationsService';
import { formatDateDisplay, getTodayDateString } from '../utils/formatters';

interface RiderAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  hubId: string;
  riders: Rider[];
  selectedDate?: string;
}

export const RiderAttendanceModal: React.FC<RiderAttendanceModalProps> = ({
  isOpen,
  onClose,
  hubId,
  riders,
  selectedDate = getTodayDateString(),
}) => {
  const [currentDate, setCurrentDate] = useState(selectedDate);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, RiderAttendanceRecord>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const activeRiders = (riders || []).filter((r) => !r.isDeleted && r.active);

  const fetchAttendance = async () => {
    try {
      const records = await loadRiderAttendance(hubId, currentDate);
      const map: Record<string, RiderAttendanceRecord> = {};
      records.forEach((rec) => {
        map[rec.riderId] = rec;
      });
      setAttendanceMap(map);
    } catch (err) {
      console.warn('Failed to load attendance:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAttendance();
    }
  }, [isOpen, hubId, currentDate]);

  if (!isOpen) return null;

  const handleStatusChange = async (rider: Rider, status: 'PRESENT' | 'ABSENT' | 'HALF_DAY') => {
    const existing = attendanceMap[rider.id];
    const updated: RiderAttendanceRecord = {
      id: existing?.id || `att_${currentDate}_${rider.id}`,
      date: currentDate,
      riderId: rider.id,
      riderName: rider.name,
      status,
      markedAt: new Date().toISOString(),
      bagNumber: existing?.bagNumber || '',
      assignedParcelsCount: existing?.assignedParcelsCount || 0,
      notes: existing?.notes || '',
    };

    setAttendanceMap((prev) => ({ ...prev, [rider.id]: updated }));
    await saveRiderAttendance(hubId, updated);
    setSaveNotice(`${rider.name}: ${status === 'PRESENT' ? 'उपस्थित (Present)' : status === 'HALF_DAY' ? 'आधा दिन' : 'अनुपस्थित'} दर्ज!`);
    setTimeout(() => setSaveNotice(null), 2500);
  };

  const handleBagChange = async (rider: Rider, bagNumber: string) => {
    const existing = attendanceMap[rider.id];
    const updated: RiderAttendanceRecord = {
      id: existing?.id || `att_${currentDate}_${rider.id}`,
      date: currentDate,
      riderId: rider.id,
      riderName: rider.name,
      status: existing?.status || 'PRESENT',
      markedAt: existing?.markedAt || new Date().toISOString(),
      bagNumber,
      assignedParcelsCount: existing?.assignedParcelsCount || 0,
    };

    setAttendanceMap((prev) => ({ ...prev, [rider.id]: updated }));
    await saveRiderAttendance(hubId, updated);
  };

  const filteredRiders = activeRiders.filter((r) =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (r.phone && r.phone.includes(searchQuery))
  );

  const presentCount = Object.values(attendanceMap).filter((a) => a.status === 'PRESENT').length;
  const halfDayCount = Object.values(attendanceMap).filter((a) => a.status === 'HALF_DAY').length;
  const absentCount = Object.values(attendanceMap).filter((a) => a.status === 'ABSENT').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-xs animate-in fade-in">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-blue-500/20 text-blue-300 border border-blue-400/30">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                <span>दैनिक राइडर हाजिरी व बैग आवंटन</span>
                <span className="px-2 py-0.5 rounded-full bg-blue-500/30 text-blue-200 text-xs font-mono font-bold">
                  Attendance
                </span>
              </h3>
              <p className="text-xs text-slate-300 font-medium mt-0.5">
                सुबह की हाजिरी (Present/Absent) और रूट/बैग नंबर रिकॉर्ड रखें।
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action / Date / Summary Bar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-500" />
            <input
              type="date"
              value={currentDate}
              onChange={(e) => setCurrentDate(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-mono text-xs font-bold text-slate-800 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-bold">
              उपस्थित: {presentCount}
            </span>
            <span className="px-2 py-1 rounded-lg bg-amber-100 text-amber-800 font-bold">
              हाफ-डे: {halfDayCount}
            </span>
            <span className="px-2 py-1 rounded-lg bg-rose-100 text-rose-800 font-bold">
              अनुपस्थित: {absentCount}
            </span>
          </div>
        </div>

        {/* Search Input */}
        <div className="px-6 pt-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="राइडर का नाम या फोन नंबर खोजें..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Toast Save Notice */}
        {saveNotice && (
          <div className="mx-6 mt-2 p-2.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-semibold flex items-center gap-2 shadow-2xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{saveNotice}</span>
          </div>
        )}

        {/* Rider Attendance List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {filteredRiders.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Users className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-semibold">कोई सक्रिय राइडर नहीं मिला।</p>
            </div>
          ) : (
            filteredRiders.map((rider) => {
              const rec = attendanceMap[rider.id];
              const status = rec?.status;

              return (
                <div
                  key={rider.id}
                  className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">{rider.name}</span>
                      <span className="text-xs text-slate-500 font-mono">{rider.phone}</span>
                    </div>
                    {/* Bag assignment field */}
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <input
                        type="text"
                        placeholder="बैग/रनर नंबर (उदा. Bag-01)"
                        value={rec?.bagNumber || ''}
                        onChange={(e) => handleBagChange(rider, e.target.value)}
                        className="px-2 py-0.5 rounded-lg border border-slate-300 bg-white text-[11px] font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-36"
                      />
                    </div>
                  </div>

                  {/* Status Toggle Buttons */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleStatusChange(rider, 'PRESENT')}
                      className={`px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer ${
                        status === 'PRESENT'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-white border border-slate-300 text-slate-700 hover:bg-emerald-50'
                      }`}
                    >
                      ✓ उपस्थित
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusChange(rider, 'HALF_DAY')}
                      className={`px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer ${
                        status === 'HALF_DAY'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-white border border-slate-300 text-slate-700 hover:bg-amber-50'
                      }`}
                    >
                      ½ हाफ-डे
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusChange(rider, 'ABSENT')}
                      className={`px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer ${
                        status === 'ABSENT'
                          ? 'bg-rose-600 text-white shadow-xs'
                          : 'bg-white border border-slate-300 text-slate-700 hover:bg-rose-50'
                      }`}
                    >
                      ✕ अनुपस्थित
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-medium">
            कुल राइडर्स: <strong>{activeRiders.length}</strong>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs transition cursor-pointer"
          >
            पूर्ण (Done)
          </button>
        </div>
      </div>
    </div>
  );
};
