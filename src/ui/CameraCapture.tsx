import { useCallback, useEffect, useRef, useState } from 'react';
import { BLUR_THRESHOLD, focusScore } from './focus';

/**
 * Multi-shot camera capture.
 *
 * A report is rarely one page and a ward round rarely allows a second visit,
 * so this takes as many photographs as the clinician needs in one sitting and
 * hands them all to the ingestion pipeline together.
 *
 * The platform file input with `capture` was the previous route. It returns a
 * single image per invocation on both iOS and Android whatever `multiple`
 * says, which meant reopening the camera for every page. It remains here as
 * the fallback for browsers that will not give a live stream.
 *
 * Each shot is checked for focus as it is taken. A blurred photograph is by
 * far the commonest cause of a failed scan, and it is worth almost nothing to
 * discover that after the patient's notes have been closed — so it is flagged
 * on the thumbnail, while the camera is still open and the report still in
 * front of the clinician.
 */

interface Shot {
  id: string;
  blob: Blob;
  url: string;
  width: number;
  height: number;
  /** Variance of the Laplacian — low means out of focus. */
  focus: number;
}

export function CameraCapture({
  onCapture,
  onClose,
}: {
  onCapture: (files: File[]) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const shotsRef = useRef<Shot[]>([]);
  /** Serialises captures so no shutter press is ever dropped. */
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const [shots, setShots] = useState<Shot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [cameraCount, setCameraCount] = useState(0);
  const [torchOn, setTorchOn] = useState(false);
  const [torchable, setTorchable] = useState(false);
  const [flash, setFlash] = useState(false);
  const [capturing, setCapturing] = useState(false);

  shotsRef.current = shots;

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Open the stream, and reopen it whenever the camera is switched.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      stop();
      setReady(false);
      setError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            // Ask for as much detail as the device will give: small print on a
            // laboratory report is what has to survive.
            width: { ideal: 3840 },
            height: { ideal: 2160 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }

        const track = stream.getVideoTracks()[0];
        const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
        setTorchable(Boolean(caps.torch));
        setTorchOn(false);
        setReady(true);

        // Only offer the switch where there is something to switch to.
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        if (!cancelled) setCameraCount(devices.filter((d) => d.kind === 'videoinput').length);
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : '';
        setError(
          name === 'NotAllowedError'
            ? 'Camera permission was refused. Allow camera access for this site in your browser settings, or use the single-photo fallback below.'
            : name === 'NotFoundError'
              ? 'No camera was found on this device.'
              : name === 'NotReadableError'
                ? 'The camera is already in use by another application.'
                : `The camera could not be opened. ${err instanceof Error ? err.message : ''}`.trim(),
        );
      }
    })();

    return () => { cancelled = true; };
  }, [facing, stop]);

  // Release the camera and the object URLs on unmount, whatever route the
  // component leaves by.
  useEffect(() => () => {
    stop();
    shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url));
  }, [stop]);

  const captureOne = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setCapturing(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0);

      const focus = focusScore(canvas);
      const blob = await new Promise<Blob | null>((resolve) =>
        // 0.92 rather than 1.0: a visually lossless JPEG of a document page,
        // without the size of a PNG on a phone with no signal.
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92),
      );
      if (!blob) return;

      setShots((prev) => [
        ...prev,
        {
          id: `${prev.length + 1}-${blob.size}`,
          blob,
          url: URL.createObjectURL(blob),
          width: canvas.width,
          height: canvas.height,
          focus,
        },
      ]);
      setFlash(true);
      setTimeout(() => setFlash(false), 140);
    } finally {
      setCapturing(false);
    }
  }, []);

  /**
   * Every press of the shutter yields exactly one photograph.
   *
   * Encoding a 4K frame takes long enough that a second tap can land while
   * the first is still in flight. Guarding that by disabling the button lost
   * the press silently — the clinician taps, nothing appears, and they have
   * no way to know whether the page was taken. Serialising instead means a
   * quick double tap produces two photographs, which is a moment's work to
   * delete, rather than one photograph and a missing page nobody noticed.
   */
  const shoot = useCallback(() => {
    queueRef.current = queueRef.current.then(captureOne).catch(() => undefined);
    return queueRef.current;
  }, [captureOne]);

  const remove = (id: string) => {
    setShots((prev) => {
      const gone = prev.find((s) => s.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((s) => s.id !== id);
    });
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      // `torch` is not in the standard MediaTrackConstraintSet typing, but it
      // is how every browser that supports a torch exposes it.
      await track.applyConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints);
      setTorchOn(next);
    } catch {
      setTorchable(false);
    }
  };

  const finish = () => {
    if (!shots.length) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const files = shots.map(
      (s, i) => new File([s.blob], `camera-${stamp}-page-${String(i + 1).padStart(2, '0')}.jpg`, { type: 'image/jpeg' }),
    );
    stop();
    shots.forEach((s) => URL.revokeObjectURL(s.url));
    onCapture(files);
  };

  const cancel = () => {
    stop();
    shots.forEach((s) => URL.revokeObjectURL(s.url));
    onClose();
  };

  const blurred = shots.filter((s) => s.focus < BLUR_THRESHOLD).length;

  // Space and Enter fire the shutter; Escape cancels.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { cancel(); return; }
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'BUTTON' || target.tagName === 'INPUT')) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); void shoot(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="cam-backdrop" role="dialog" aria-modal="true" aria-label="Camera capture">
      <div className="cam">
        <header className="cam-head">
          <strong>Photograph reports</strong>
          <span className="small muted">
            Take as many pages as you need — they are analysed together when you finish.
          </span>
          <button className="btn small" onClick={cancel} style={{ marginLeft: 'auto' }}>Close</button>
        </header>

        <div className="cam-stage">
          {error ? (
            <div className="cam-error">
              <p>{error}</p>
              <label className="btn primary">
                Take a single photo instead
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onCapture([f]);
                  }}
                />
              </label>
            </div>
          ) : (
            <>
              <video ref={videoRef} playsInline muted autoPlay className="cam-video" />
              {/* Framing guide — a report filling the frame reads far better. */}
              <div className="cam-guide" aria-hidden="true">
                <span /><span /><span /><span />
              </div>
              {flash && <div className="cam-flash" aria-hidden="true" />}
              {!ready && <div className="cam-wait"><span className="spinner" /> Opening camera…</div>}
            </>
          )}
        </div>

        <div className="cam-controls">
          {cameraCount > 1 && (
            <button
              className="btn"
              disabled={!ready}
              onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
              title="Switch between the front and rear camera"
            >
              Switch camera
            </button>
          )}
          {torchable && (
            <button className={`btn${torchOn ? ' primary' : ''}`} disabled={!ready} onClick={() => void toggleTorch()}>
              {torchOn ? 'Light on' : 'Light'}
            </button>
          )}

          <button
            className={`shutter${capturing ? ' busy' : ''}`}
            onClick={() => void shoot()}
            disabled={!ready || !!error}
            aria-label="Take photograph"
            title="Take photograph (space)"
          >
            <span />
          </button>

          <span className="chip accent">{shots.length} photo{shots.length === 1 ? '' : 's'}</span>
          <button className="btn primary" disabled={!shots.length} onClick={finish}>
            Analyse {shots.length || ''} photo{shots.length === 1 ? '' : 's'}
          </button>
        </div>

        {shots.length > 0 && (
          <div className="cam-strip">
            {shots.map((s, i) => (
              <figure key={s.id} className={`cam-thumb${s.focus < BLUR_THRESHOLD ? ' blurred' : ''}`}>
                <img src={s.url} alt={`Photograph ${i + 1}`} />
                <button className="cam-del" onClick={() => remove(s.id)} aria-label={`Remove photograph ${i + 1}`}>×</button>
                <figcaption>
                  {i + 1}
                  {s.focus < BLUR_THRESHOLD && <span className="warn" title="This photograph may not be sharp enough to read reliably — consider retaking it"> · blurred?</span>}
                </figcaption>
              </figure>
            ))}
          </div>
        )}

        {blurred > 0 && (
          <p className="cam-note">
            {blurred} photograph{blurred === 1 ? ' may not be' : 's may not be'} sharp enough to read reliably. Small
            print is the first thing lost to blur, so it is worth retaking {blurred === 1 ? 'it' : 'them'} while the
            report is still to hand. Hold steady, fill the frame with the page, and let the camera focus before
            pressing the shutter.
          </p>
        )}
      </div>
    </div>
  );
}
