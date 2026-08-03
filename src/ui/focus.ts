/**
 * Focus estimate for a captured photograph, by variance of the Laplacian.
 *
 * A blurred photograph is the commonest cause of a report failing to scan,
 * and the clinician has no way to tell from a thumbnail. Measuring it at the
 * moment of capture means the problem surfaces while the camera is still open
 * and the report still in front of them, rather than after the notes have
 * been closed.
 *
 * Measured on a downscaled greyscale copy: absolute scale is irrelevant, only
 * whether edges in the frame are crisp, and working small keeps this well
 * under a frame time even on a modest phone.
 *
 * Kept in its own module so it can be exercised directly against images of
 * known sharpness rather than only through the camera.
 */

/**
 * Below this, a photograph is flagged to the clinician as possibly blurred.
 *
 * Measured, not chosen. `npm run calibrate:blur` renders a bordered full
 * blood count at a series of blur radii and puts each through the real
 * recognition and parsing path; the threshold sits where value recovery
 * collapses. On that report:
 *
 *     blur 0px    score 7.7    15/15 values recovered
 *     blur 1px    score 5.6    12/15
 *     blur 1.5px  score 4.2    10/15
 *     blur 2px    score 2.0     1/15
 *     blur 3px    score 0.7     0/15
 *
 * The first attempt at this was an eyeballed constant, and it was wrong by
 * nearly two orders of magnitude — it would have stayed silent on every
 * photograph from which nothing at all could be read.
 *
 * It remains a hint rather than a verdict. Sensor noise in a real photograph
 * adds high-frequency detail and raises the score, so the warning errs
 * towards silence on a marginal image rather than towards crying wolf; the
 * wording on screen is hedged accordingly.
 */
export const BLUR_THRESHOLD = 4.9;

export function focusScore(source: HTMLCanvasElement): number {
  const w = 320;
  const h = Math.max(1, Math.round((source.height / source.width) * w));
  const small = document.createElement('canvas');
  small.width = w;
  small.height = h;
  const sctx = small.getContext('2d', { willReadFrequently: true });
  if (!sctx) return Number.POSITIVE_INFINITY;
  sctx.drawImage(source, 0, 0, w, h);
  const { data } = sctx.getImageData(0, 0, w, h);

  const grey = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    grey[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  let lapSum = 0;
  let lapSumSq = 0;
  let greySum = 0;
  let greySumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = grey[i - 1] + grey[i + 1] + grey[i - w] + grey[i + w] - 4 * grey[i];
      lapSum += lap;
      lapSumSq += lap * lap;
      greySum += grey[i];
      greySumSq += grey[i] * grey[i];
      n++;
    }
  }
  if (n === 0) return Number.POSITIVE_INFINITY;

  const lapVar = lapSumSq / n - (lapSum / n) ** 2;
  const greyVar = greySumSq / n - (greySum / n) ** 2;

  // Normalised by the image's own contrast.
  //
  // The raw Laplacian variance is what most implementations use, and it is
  // strongly content-dependent: a densely ruled table scores tens of times
  // higher than a sparse typed page at identical sharpness, so no single
  // threshold fits both. Dividing by the intensity variance asks how crisp
  // the edges are relative to how much is in the frame, which is the question
  // actually being posed, and it is unaffected by exposure as well.
  //
  // A blank frame has neither, and is reported as sharp rather than as a
  // division by zero — there is nothing there to be blurred.
  if (greyVar < 1) return Number.POSITIVE_INFINITY;
  return lapVar / greyVar;
}
