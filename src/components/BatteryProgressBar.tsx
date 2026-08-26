import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { AlertCircle, CheckCircle2, Clock, Scissors } from 'lucide-react';

interface BatteryProgressBarProps {
  startTime: string | null;
  isActive: boolean;
  totalDurationMins?: number; // default 18
  showSegments?: boolean;
  variant?: 'customer' | 'owner' | 'minimal';
  customerName?: string;
  serviceName?: string;
  queueNumber?: number;
}

export const BatteryProgressBar: React.FC<BatteryProgressBarProps> = ({
  startTime,
  isActive,
  totalDurationMins = 18,
  customerName,
  serviceName,
  queueNumber,
}) => {
  const [progressRatio, setProgressRatio] = useState<number>(0);
  const [isFull, setIsFull] = useState<boolean>(false);
  const [isNear15MinMark, setIsNear15MinMark] = useState<boolean>(false);
  const [elapsedMinutes, setElapsedMinutes] = useState<number>(0);

  const totalDurationMs = totalDurationMins * 60 * 1000;

  useEffect(() => {
    if (!isActive || !startTime) {
      setProgressRatio(0);
      setIsFull(false);
      setIsNear15MinMark(false);
      setElapsedMinutes(0);
      return;
    }

    const calculate = () => {
      const startMs = new Date(startTime).getTime();
      const nowMs = Date.now();
      const elapsedMs = Math.max(0, nowMs - startMs);
      const ratio = Math.min(1, elapsedMs / totalDurationMs);
      const mins = Math.floor(elapsedMs / 60000);

      setProgressRatio(ratio);
      setElapsedMinutes(mins);
      setIsFull(ratio >= 1);
      // Notice when session is running
      setIsNear15MinMark(ratio >= 0.15 && ratio < 1);
    };

    calculate();
    const interval = setInterval(calculate, 1000);
    return () => clearInterval(interval);
  }, [startTime, isActive, totalDurationMs]);

  const percentage = Math.round(progressRatio * 100);

  return (
    <div
      id="session-progress-container"
      className="w-full bg-[#FFFFFF] border border-[#E5E5DF] p-3.5 sm:p-4 rounded-[14px] shadow-[0_2px_8px_rgba(32,35,31,0.02)]"
    >
      {/* Session Top Header */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          {queueNumber ? (
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-[7px] bg-[#26362E] text-[#FFFFFF] font-mono text-xs font-semibold shrink-0">
              #{queueNumber}
            </span>
          ) : (
            <div className="w-7 h-7 rounded-[7px] bg-[#E8ECE8] text-[#26362E] flex items-center justify-center shrink-0">
              <Scissors className="w-3.5 h-3.5" />
            </div>
          )}
          <div className="min-w-0">
            <span className="text-[9px] tracking-wider uppercase text-[#686D66] font-semibold leading-none block">
              Sesi Sedang Berjalan
            </span>
            <h4 className="text-xs sm:text-sm font-semibold text-[#20231F] truncate mt-0.5">
              {customerName || 'Pelanggan di Kursi'}
            </h4>
          </div>
        </div>

        {serviceName && (
          <span className="text-[11px] font-medium text-[#26362E] bg-[#E8ECE8] px-2 py-0.5 rounded-[6px] border border-[#E5E5DF] truncate max-w-[120px] shrink-0">
            {serviceName}
          </span>
        )}
      </div>

      {/* Progress Track & Fill */}
      <div className="space-y-1.5">
        <div className="w-full h-2.5 bg-[#E8ECE8] border border-[#E5E5DF] rounded-full overflow-hidden p-0.5 relative">
          <motion.div
            className={`h-full rounded-full transition-all duration-1000 ease-linear ${
              isFull ? 'bg-[#4F7A5A]' : 'bg-[#26362E]'
            }`}
            style={{ width: `${Math.max(isActive ? 4 : 0, percentage)}%` }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(isActive ? 4 : 0, percentage)}%` }}
          />
        </div>

        {/* Progress Meta */}
        <div className="flex items-center justify-between text-xs text-[#686D66] pt-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <Clock className="w-3 h-3 text-[#26362E] shrink-0" />
            <span className="font-medium text-[#20231F] text-[11px]">
              {isActive ? `${elapsedMinutes}m / ${totalDurationMins}m` : 'Standby'}
            </span>
            <span className="text-[10px] text-[#92968F]">({percentage}%)</span>
          </div>

          <div className="text-right shrink-0">
            {isFull ? (
              <span className="inline-flex items-center gap-1 text-[#4F7A5A] font-semibold text-[10px]">
                <CheckCircle2 className="w-3 h-3 text-[#4F7A5A]" />
                Selesai
              </span>
            ) : isActive ? (
              <span className="text-[10px] text-[#A47C45] font-semibold">
                Pengerjaan Presisi
              </span>
            ) : (
              <span className="text-[10px] text-[#92968F]">Menunggu giliran</span>
            )}
          </div>
        </div>
      </div>

      {/* Polite Arrival Reminder */}
      {isNear15MinMark && (
        <div className="mt-2.5 bg-[#F7F6F2] border border-[#E5E5DF] p-2 rounded-[8px] text-[11px] text-[#20231F] flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-[#A47C45] shrink-0 mt-0.5" />
          <p className="text-[10px] text-[#686D66] leading-tight">
            Harap bersiap di ruang tunggu agar sesi pangkas dapat langsung dimulai tepat waktu saat giliran Anda tiba.
          </p>
        </div>
      )}
    </div>
  );
};
