import { useEffect, useState } from 'react';
import { checkAvailability, isEnabled, subscribeEnabled, type AiAvailability } from '../ai/client';

/**
 * Where the patient's data is being processed, stated in the header.
 *
 * This was a fixed label asserting that nothing leaves the device. That claim
 * was true of every version of the application until assisted extraction was
 * added, and a badge in a clinical tool that asserts confidentiality must
 * never be able to say so while a feature that transmits is switched on. It
 * now reports the actual state and changes the moment that feature is toggled.
 */
export function StatusPill({ onOpen }: { onOpen: () => void }) {
  const [ai, setAi] = useState<AiAvailability | null>(null);
  const [enabled, setEnabledState] = useState(isEnabled());
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);

  useEffect(() => {
    void checkAvailability().then(setAi);
    const unsubscribe = subscribeEnabled(() => {
      setEnabledState(isEnabled());
      void checkAvailability().then(setAi);
    });
    const netChange = () => {
      setOnline(navigator.onLine);
      void checkAvailability().then(setAi);
    };
    window.addEventListener('online', netChange);
    window.addEventListener('offline', netChange);
    return () => {
      unsubscribe();
      window.removeEventListener('online', netChange);
      window.removeEventListener('offline', netChange);
    };
  }, []);

  const transmitting = enabled && ai?.available === true;

  const label = transmitting
    ? 'Assisted extraction on'
    : ai?.available
      ? 'On-device · assist available'
      : 'On-device analysis only';

  const title = transmitting
    ? 'Analysis still runs on this device. Assisted extraction is switched on, so images you explicitly choose to send are transmitted to a vision model — de-identified first, and only when you confirm.'
    : ai?.available
      ? 'Everything runs on this device. Assisted extraction is available on this deployment but is switched off, so nothing is transmitted.'
      : `Everything runs on this device and nothing is transmitted. ${ai?.reason ?? ''}`.trim();

  return (
    <button
      type="button"
      className={`offline-pill${transmitting ? ' transmitting' : ''}`}
      title={title}
      onClick={onOpen}
      aria-label={`${label}. ${title}`}
    >
      <span className="dot" />
      {label}
      {!online && <span className="small" style={{ opacity: 0.75 }}>· no network</span>}
    </button>
  );
}
