import React from 'react';

interface AradadLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'gold-on-dark' | 'gold-on-light' | 'white' | 'monochrome';
  showText?: boolean;
}

export const AradadLogo: React.FC<AradadLogoProps> = ({
  className = '',
  size = 'md',
  variant = 'gold-on-dark',
  showText = true,
}) => {
  const goldColor = '#C89B3C';
  const lightGold = '#DFB76C';
  const darkBg = '#0D0D0C';

  const dimensions = {
    sm: { icon: 28, text: 'text-sm' },
    md: { icon: 38, text: 'text-lg' },
    lg: { icon: 52, text: 'text-2xl' },
    xl: { icon: 72, text: 'text-3xl' },
  }[size];

  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* Official Aradad Homes Emblem SVG matching upload */}
      <svg
        width={dimensions.icon}
        height={dimensions.icon}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 transition-transform duration-300 group-hover:scale-105"
      >
        {/* Dark container box */}
        <rect width="100" height="100" rx="8" fill={darkBg} />

        {/* Outer Square Gold Border */}
        <rect
          x="14"
          y="14"
          width="72"
          height="72"
          stroke={goldColor}
          strokeWidth="4"
          fill="none"
        />

        {/* Inner House Roof & Walls Outline */}
        <path
          d="M 50 26 L 72 44 L 72 70 L 28 70 L 28 44 Z"
          stroke={goldColor}
          strokeWidth="4"
          strokeLinejoin="miter"
          strokeLinecap="square"
          fill="none"
        />

        {/* 4-Pane Square Window inside House */}
        {/* Pane 1 (Top Left) */}
        <rect x="42" y="47" width="6.5" height="6.5" fill={goldColor} />
        {/* Pane 2 (Top Right) */}
        <rect x="51.5" y="47" width="6.5" height="6.5" fill={goldColor} />
        {/* Pane 3 (Bottom Left) */}
        <rect x="42" y="56.5" width="6.5" height="6.5" fill={goldColor} />
        {/* Pane 4 (Bottom Right) */}
        <rect x="51.5" y="56.5" width="6.5" height="6.5" fill={goldColor} />
      </svg>

      {showText && (
        <div className="flex flex-col leading-tight">
          <span
            className={`font-serif font-bold tracking-[0.16em] uppercase ${dimensions.text} text-[#DFB76C]`}
            style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
          >
            Aradad
          </span>
          <span
            className="font-serif text-[10px] tracking-[0.32em] uppercase text-[#C89B3C] font-semibold -mt-0.5"
            style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
          >
            Homes
          </span>
        </div>
      )}
    </div>
  );
};
