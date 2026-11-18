import React from 'react';

interface HisabKitabLabelProps {
  text?: string;
  variant?: 'inline' | 'badge';
  className?: string;
}

/**
 * Signature multi-color neon lighting branding for "हिसाब किताब".
 * Use variant="badge" on light surfaces/buttons so the multi-lighting text stays crystal clear,
 * and variant="inline" on dark headers/cards.
 */
export const HisabKitabLabel: React.FC<HisabKitabLabelProps> = ({
  text = 'हिसाब किताब',
  variant = 'inline',
  className = '',
}) => {
  if (variant === 'badge') {
    return (
      <span className={`hisab-kitab-badge ${className}`}>
        <span className="hisab-kitab-lighting">{text}</span>
      </span>
    );
  }

  return <span className={`hisab-kitab-lighting ${className}`}>{text}</span>;
};

export default HisabKitabLabel;
