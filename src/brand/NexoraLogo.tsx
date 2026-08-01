/**
 * NEXORA Innovations mark.
 *
 * Rendered as inline SVG so it scales cleanly on screen, in print and in the
 * exported PDF with no external asset. If a raster copy of the official logo is
 * placed at `public/assets/nexora-logo.png` the component uses that instead —
 * the vector below is a faithful stand-in, not a replacement for the original
 * artwork.
 */
import { useEffect, useState } from 'react';

/**
 * Optional override with the original artwork.
 *
 * Supplied through Settings and kept in local storage rather than probed for
 * at a fixed path: probing logs a 404 on every load when the file is absent,
 * which is the normal case, and dropping a file into a folder is not something
 * that can be done on a phone at all.
 */
const STORAGE_KEY = 'nexora.clinician-assistant.brand-logo.v1';

let overrideDataUrl: string | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function readOverride(): string | null {
  if (!loaded) {
    try { overrideDataUrl = localStorage.getItem(STORAGE_KEY); } catch { overrideDataUrl = null; }
    loaded = true;
  }
  return overrideDataUrl;
}

export function setBrandLogo(dataUrl: string | null): void {
  overrideDataUrl = dataUrl;
  loaded = true;
  try {
    if (dataUrl) localStorage.setItem(STORAGE_KEY, dataUrl);
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* private mode — the override simply does not persist */ }
  listeners.forEach((l) => l());
}

export function getBrandLogo(): string | null {
  return readOverride();
}

function useBrandLogo(): string | null {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return readOverride();
}

export interface LogoProps {
  /** Height in pixels. */
  size?: number;
  /** Monogram only, without the wordmark. */
  markOnly?: boolean;
  /** Flat ink for print and PDF — no glow, no gradients. */
  print?: boolean;
  className?: string;
}

/** The interlocking N monogram. */
function Monogram({ print }: { print?: boolean }) {
  const blue = print ? '#0B63A8' : 'url(#nx-blue)';
  const white = print ? '#12181f' : 'url(#nx-white)';
  return (
    <g filter={print ? undefined : 'url(#nx-glow)'}>
      <polygon points="0,0 20,0 70,48 20,48 20,86 0,100" fill={blue} />
      <polygon points="100,116 80,116 30,68 80,68 80,30 100,16" fill={white} />
    </g>
  );
}

export function NexoraLogo({ size = 40, markOnly = false, print = false, className }: LogoProps) {
  const override = useBrandLogo();

  if (override && !markOnly) {
    return (
      <img
        src={override}
        alt="NEXORA Innovations — Building Solutions"
        height={size}
        style={{ height: size, width: 'auto', display: 'block' }}
        className={className}
      />
    );
  }

  // The wordmark is letter-spaced, so the viewBox must be wide enough to
  // contain "NEXORA" at 52px and the full subtitle at 15px without clipping.
  const w = markOnly ? size * (100 / 116) : size * (520 / 116);
  const viewBox = markOnly ? '0 0 100 116' : '0 0 520 116';

  return (
    <svg
      width={w}
      height={size}
      viewBox={viewBox}
      className={className}
      role="img"
      aria-label="NEXORA Innovations — Building Solutions"
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id="nx-blue" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4FD2FF" />
          <stop offset="55%" stopColor="#00A3FF" />
          <stop offset="100%" stopColor="#0075D6" />
        </linearGradient>
        <linearGradient id="nx-white" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#D7EBFA" />
        </linearGradient>
        <filter id="nx-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.2" result="b" />
          <feFlood floodColor="#0AA6FF" floodOpacity="0.85" result="c" />
          <feComposite in="c" in2="b" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="nx-textglow" x="-30%" y="-60%" width="160%" height="240%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feFlood floodColor="#38BDFF" floodOpacity="0.75" result="c" />
          <feComposite in="c" in2="b" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <Monogram print={print} />

      {!markOnly && (
        <g transform="translate(120, 0)">
          <text
            x="0"
            y="62"
            fontFamily="'Segoe UI Semibold', 'Helvetica Neue', Arial, sans-serif"
            fontSize="52"
            fontWeight="700"
            letterSpacing="6"
            fill={print ? '#12181f' : '#FFFFFF'}
            filter={print ? undefined : 'url(#nx-textglow)'}
          >
            NEXORA
          </text>
          <line x1="0" y1="80" x2="14" y2="80" stroke={print ? '#0B63A8' : '#22B5FF'} strokeWidth="2.5" />
          <text
            x="22"
            y="85"
            fontFamily="'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
            fontSize="15"
            fontWeight="600"
            letterSpacing="2.6"
            fill={print ? '#0B63A8' : '#3FC2FF'}
          >
            INNOVATIONS
          </text>
          <text
            x="152"
            y="85"
            fontFamily="'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
            fontSize="15"
            fontWeight="600"
            letterSpacing="2.6"
            fill={print ? '#12181f' : '#EAF6FF'}
          >
            : BUILDING SOLUTIONS
          </text>
        </g>
      )}
    </svg>
  );
}

/** Static SVG markup for the HTML export and the print header. */
export function nexoraLogoSvgString(print = true): string {
  const blue = print ? '#0B63A8' : '#00A3FF';
  const dark = print ? '#12181f' : '#FFFFFF';
  return `<svg width="404" height="90" viewBox="0 0 520 116" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="NEXORA Innovations">
  <polygon points="0,0 20,0 70,48 20,48 20,86 0,100" fill="${blue}"/>
  <polygon points="100,116 80,116 30,68 80,68 80,30 100,16" fill="${dark}"/>
  <g transform="translate(120,0)">
    <text x="0" y="62" font-family="Segoe UI, Helvetica Neue, Arial, sans-serif" font-size="52" font-weight="700" letter-spacing="6" fill="${dark}">NEXORA</text>
    <line x1="0" y1="80" x2="14" y2="80" stroke="${blue}" stroke-width="2.5"/>
    <text x="22" y="85" font-family="Segoe UI, Helvetica Neue, Arial, sans-serif" font-size="15" font-weight="600" letter-spacing="2.6" fill="${blue}">INNOVATIONS</text>
    <text x="152" y="85" font-family="Segoe UI, Helvetica Neue, Arial, sans-serif" font-size="15" font-weight="600" letter-spacing="2.6" fill="${dark}">: BUILDING SOLUTIONS</text>
  </g>
</svg>`;
}

export const CREDIT_LINE = 'Clinician Assistant — developed by NEXORA Innovations : Building Solutions';
