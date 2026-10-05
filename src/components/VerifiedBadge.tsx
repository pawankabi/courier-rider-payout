import React from 'react';

interface VerifiedBadgeProps {
  className?: string;
  size?: number;
  showTooltip?: boolean;
}

export const VerifiedBadge: React.FC<VerifiedBadgeProps> = ({ 
  className = "inline-block flex-shrink-0 align-middle", 
  size = 18,
  showTooltip = true
}) => {
  return (
    <span 
      className="inline-flex items-center group relative cursor-pointer align-middle flex-shrink-0"
      title="Verified Official Logistics Hub"
    >
      <svg 
        width={size} 
        height={size} 
        viewBox="0 0 24 24" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg" 
        className={className}
        style={{ width: `${size}px`, height: `${size}px`, minWidth: `${size}px`, minHeight: `${size}px` }}
        aria-label="Verified Official Logistics Hub"
      >
        {/* Official Scalloped Rosette Path */}
        <path 
          d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.67-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.34 2.19c-1.39-.46-2.9-.2-3.91.81s-1.27 2.52-.81 3.91C2.63 9.33 1.75 10.57 1.75 12s.88 2.67 2.19 3.34c-.46 1.39-.2 2.9.81 3.91s2.52 1.27 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.67-.88 3.34-2.19c1.39.46 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34z" 
          fill="#1D9BF0" 
        />
        {/* Crisp White Centered Checkmark */}
        <path 
          d="M9.86 16.5l-4.11-4.11 1.41-1.41 2.7 2.7 6.84-6.84 1.41 1.41-8.25 8.25z" 
          fill="#FFFFFF" 
        />
      </svg>
      {showTooltip && (
        <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[10px] font-bold text-white shadow-xl border border-slate-700 opacity-0 group-hover:opacity-100 transition-opacity z-50">
          Verified Official Logistics Hub
        </span>
      )}
    </span>
  );
};
