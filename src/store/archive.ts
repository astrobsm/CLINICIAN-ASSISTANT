/**
 * Encrypted offline archive.
 *
 * The session is serialised, compressed and encrypted with AES-256-GCM under a
 * key derived from a clinician-supplied passphrase using PBKDF2-SHA256 with
 * 310,000 iterations. Encryption and decryption use the browser's Web Crypto
 * implementation; the archive is written to a local file the clinician chooses.
 *
 * No key, passphrase or plaintext is ever transmitted or persisted anywhere
 * other than the file the clinician saves.
 */
import type { SessionSnapshot } from './session';

const MAGIC = 'NEXCA1'; // NEXORA Clinician Assistant, archive format v1
const PBKDF2_ITERATIONS = 310_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

const enc = new TextEncoder();
const dec = new TextDecoder();

export const PBKDF2_ROUNDS = PBKDF2_ITERATIONS;

/**
 * Derive the encryption key once and reuse it.
 *
 * Key derivation is deliberately expensive — that is the point of 310,000
 * PBKDF2 rounds — so deriving per file would make a case library with a dozen
 * entries take several seconds to list. The key is non-extractable and lives
 * only in memory.
 */
export async function deriveKeyFromPassphrase(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  return deriveKey(passphrase, salt);
}

export function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** Encrypt any JSON-serialisable value with an already-derived key. */
export async function encryptWithKey(value: unknown, key: CryptoKey): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plain = enc.encode(JSON.stringify(value));
  const compressed = await compress(plain);
  const gzipped = compressed !== plain;
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource }, key, compressed as unknown as BufferSource),
  );
  const out = new Uint8Array(1 + IV_BYTES + cipher.length);
  out[0] = gzipped ? 1 : 0;
  out.set(iv, 1);
  out.set(cipher, 1 + IV_BYTES);
  return out;
}

export async function decryptWithKey<T>(bytes: Uint8Array, key: CryptoKey): Promise<T> {
  const gzipped = bytes[0] === 1;
  const iv = bytes.slice(1, 1 + IV_BYTES);
  const cipher = bytes.slice(1 + IV_BYTES);
  const plainBytes = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource }, key, cipher as unknown as BufferSource),
  );
  const json = dec.decode(gzipped ? await decompress(plainBytes) : plainBytes);
  return JSON.parse(json) as T;
}

export const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
export const fromBase64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function compress(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') return bytes;
  const cs = new CompressionStream('gzip');
  const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decompress(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') return bytes;
  try {
    const ds = new DecompressionStream('gzip');
    const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return bytes; // archive was written without compression support
  }
}

/**
 * Archive layout (all binary, little-endian where applicable):
 *   [0..5]    magic "NEXCA1"
 *   [6]       flags (bit 0: gzip)
 *   [7..22]   PBKDF2 salt (16 bytes)
 *   [23..34]  AES-GCM IV (12 bytes)
 *   [35..]    ciphertext + GCM tag
 */
export async function encryptSnapshot(snapshot: SessionSnapshot, passphrase: string): Promise<Blob> {
  if (passphrase.length < 8) throw new Error('Passphrase must be at least 8 characters.');

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt);

  const plain = enc.encode(JSON.stringify(snapshot));
  const compressed = await compress(plain);
  const gzipped = compressed !== plain;

  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource }, key, compressed as unknown as BufferSource),
  );

  const header = enc.encode(MAGIC);
  const out = new Uint8Array(header.length + 1 + SALT_BYTES + IV_BYTES + cipher.length);
  let o = 0;
  out.set(header, o); o += header.length;
  out[o] = gzipped ? 1 : 0; o += 1;
  out.set(salt, o); o += SALT_BYTES;
  out.set(iv, o); o += IV_BYTES;
  out.set(cipher, o);

  return new Blob([out as unknown as BlobPart], { type: 'application/octet-stream' });
}

export async function decryptSnapshot(file: Blob, passphrase: string): Promise<SessionSnapshot> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const magic = dec.decode(buf.slice(0, MAGIC.length));
  if (magic !== MAGIC) {
    throw new Error('This file is not a Clinician Assistant encrypted archive.');
  }

  let o = MAGIC.length;
  const gzipped = buf[o] === 1; o += 1;
  const salt = buf.slice(o, o + SALT_BYTES); o += SALT_BYTES;
  const iv = buf.slice(o, o + IV_BYTES); o += IV_BYTES;
  const cipher = buf.slice(o);

  const key = await deriveKey(passphrase, salt);

  let plainBytes: Uint8Array;
  try {
    plainBytes = new Uint8Array(
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource }, key, cipher as unknown as BufferSource),
    );
  } catch {
    throw new Error('Incorrect passphrase, or the archive has been altered or corrupted.');
  }

  const json = dec.decode(gzipped ? await decompress(plainBytes) : plainBytes);
  const parsed = JSON.parse(json) as SessionSnapshot;
  if (parsed.version !== 1) throw new Error(`Unsupported archive version: ${String(parsed.version)}`);
  return parsed;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Filename-safe stamp, e.g. clinician-assistant_H1234567_2026-08-01T1042.enc */
export function archiveFilename(hospitalNumber: string): string {
  const id = (hospitalNumber || 'unidentified').replace(/[^A-Za-z0-9\-_]/g, '') || 'unidentified';
  const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 13);
  return `clinician-assistant_${id}_${stamp}.enc`;
}
