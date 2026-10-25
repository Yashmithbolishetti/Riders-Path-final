import React, { useState } from 'react';

interface VehicleImageProps {
  src?: string;
  alt: string;
  brand?: string;
  model?: string;
  bikeType?: string;
  className?: string;
}

export const VehicleImage: React.FC<VehicleImageProps> = ({
  src,
  alt,
  brand = 'Riders Path',
  model = 'Campus Vehicle',
  bikeType = 'Motorcycle',
  className = 'w-full h-full object-cover object-center',
}) => {
  const [hasError, setHasError] = useState(false);

  const isScooterOrEv =
    bikeType.toLowerCase().includes('scooter') ||
    bikeType.toLowerCase().includes('electric');

  if (!src || hasError) {
    return (
      <div
        className="w-full h-full bg-[#EFEEE8] flex flex-col items-center justify-center p-6 select-none relative overflow-hidden"
        role="img"
        aria-label={alt}
      >
        {/* Subtle architectural grid lines */}
        <div
          className="absolute inset-0 opacity-35 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(to right, #E5E4DE 1px, transparent 1px), linear-gradient(to bottom, #E5E4DE 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        {/* Minimalist Automotive Silhouette SVG */}
        <div className="relative z-10 flex flex-col items-center text-center max-w-xs">
          {isScooterOrEv ? (
            <svg
              viewBox="0 0 240 130"
              className="w-40 h-24 text-[#29483B]"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Ground line */}
              <line x1="20" y1="112" x2="220" y2="112" stroke="#D4D2C8" strokeWidth="2" />
              {/* Wheels */}
              <circle cx="62" cy="92" r="19" stroke="#202522" strokeWidth="4" fill="#F7F6F2" />
              <circle cx="62" cy="92" r="7" fill="#29483B" />
              <circle cx="176" cy="92" r="19" stroke="#202522" strokeWidth="4" fill="#F7F6F2" />
              <circle cx="176" cy="92" r="7" fill="#29483B" />
              {/* Scooter Body & Floorboard */}
              <path
                d="M52 74 C52 56, 86 54, 108 66 L112 88 L158 88 L148 40 L166 36"
                stroke="#29483B"
                strokeWidth="4.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Seat */}
              <path
                d="M60 58 L106 58"
                stroke="#202522"
                strokeWidth="6"
                strokeLinecap="round"
              />
              {/* Front Apron & Fork */}
              <path
                d="M154 44 L176 92"
                stroke="#202522"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              {/* Headlight */}
              <circle cx="163" cy="42" r="4.5" fill="#29483B" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 260 130"
              className="w-44 h-24 text-[#29483B]"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Ground line */}
              <line x1="16" y1="112" x2="244" y2="112" stroke="#D4D2C8" strokeWidth="2" />
              {/* Rear & Front Wheels */}
              <circle cx="64" cy="88" r="23" stroke="#202522" strokeWidth="4" fill="#F7F6F2" />
              <circle cx="64" cy="88" r="8" fill="#29483B" />
              <circle cx="196" cy="88" r="23" stroke="#202522" strokeWidth="4" fill="#F7F6F2" />
              <circle cx="196" cy="88" r="8" fill="#29483B" />
              {/* Frame & Swingarm */}
              <path
                d="M64 88 L112 86 L138 52 L96 56 Z"
                stroke="#202522"
                strokeWidth="3.5"
                strokeLinejoin="round"
              />
              {/* Fuel Tank & Seat */}
              <path
                d="M62 56 L104 56 L124 42 C142 40, 156 46, 160 54 L126 58"
                fill="#29483B"
              />
              <path
                d="M54 54 L102 56"
                stroke="#202522"
                strokeWidth="5.5"
                strokeLinecap="round"
              />
              {/* Front Fork & Handlebar */}
              <path
                d="M148 34 L164 34 L196 88"
                stroke="#202522"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Round Roadster Headlamp */}
              <circle cx="172" cy="46" r="6" fill="#29483B" stroke="#202522" strokeWidth="2" />
              {/* Engine Block Detail */}
              <rect x="108" y="62" width="26" height="20" rx="3" fill="#D4D2C8" stroke="#202522" strokeWidth="2" />
            </svg>
          )}

          <div className="mt-2 space-y-0.5">
            <p className="text-[11px] font-medium text-[#70756F] tracking-tight">
              {brand} · {bikeType}
            </p>
            <p className="font-display font-semibold text-xs text-[#202522] line-clamp-1">
              {model}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setHasError(true)}
    />
  );
};
