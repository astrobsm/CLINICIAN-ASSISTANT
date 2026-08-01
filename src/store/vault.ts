/**
 * On-device encrypted case library.
 *
 * A dedicated folder on each device, holding saved cases. Two storage layers,
 * for different reasons:
 *
 *  - The **origin private file system** is the primary store. It is a real
 *    directory on the device, scoped to this application, persistent across
 *    reloads and available on phones as well as desktops. It is the only
 *    option that works on Android and iOS.
 *
 *  - A **folder you choose** can additionally be bound on desktop Chrome and
 *    Edge, so saved cases also land somewhere visible that you can back up or
 *    copy between machines. This is unavailable on mobile browsers, so it
 *    supplements the private store rather than replacing it.
 *
 * Nothing is written in the clear. Every case, and the index that lists them,
 * is encrypted with AES-256-GCM under a key derived from a passphrase you set
 * — the same scheme as the exported archive. The passphrase is never stored;
 * if it is lost the library cannot be opened, by anyone.
 */
import {
  PBKDF2_ROUNDS,
  decryptWithKey,
  deriveKeyFromPassphrase,
  encryptWithKey,
  fromBase64,
  randomBytes,
  toBase64,
} from './archive';
import type { SessionSnapshot } from './session';
import type { Severity } from '../clinical/types';

const DIR = 'clinician-assistant';
const CASES = 'cases';
const VAULT_FILE = 'vault.json';
const INDEX_FILE = 'index.enc';
const VERIFIER_TOKEN = 'nexora-clinician-assistant-vault-v1';

export interface CaseSummary {
  id: string;
  patientName: string;
  hospitalNumber: string;
  ward: string;
  severity: Severity;
  documentCount: number;
  valueCount: number;
  savedAt: string;
  /** Size of the encrypted case file, bytes. */
  bytes: number;
}

export interface VaultStatus {
  supported: boolean;
  unlocked: boolean;
  exists: boolean;
  caseCount: number;
  persisted: boolean;
  usageBytes: number | null;
  quotaBytes: number | null;
  boundFolderName: string | null;
  folderPickerSupported: boolean;
}

interface VaultMeta {
  version: 1;
  salt: string;
  iterations: number;
  /** Encryption of a known token, used to check the passphrase. */
  verifier: string;
  createdAt: string;
}

let key: CryptoKey | null = null;
let index: CaseSummary[] = [];
let boundDir: FileSystemDirectoryHandle | null = null;

// ─────────────────────────── capability ───────────────────────────

export function vaultSupported(): boolean {
  return typeof navigator !== 'undefined'
    && !!navigator.storage?.getDirectory
    && typeof crypto !== 'undefined'
    && !!crypto.subtle;
}

export function folderPickerSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

// ─────────────────────────── OPFS plumbing ───────────────────────────

async function root(): Promise<FileSystemDirectoryHandle> {
  const opfs = await navigator.storage.getDirectory();
  return opfs.getDirectoryHandle(DIR, { create: true });
}

async function casesDir(): Promise<FileSystemDirectoryHandle> {
  return (await root()).getDirectoryHandle(CASES, { create: true });
}

async function readFile(dir: FileSystemDirectoryHandle, name: string): Promise<Uint8Array | null> {
  try {
    const handle = await dir.getFileHandle(name);
    const file = await handle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}

async function writeFile(dir: FileSystemDirectoryHandle, name: string, bytes: Uint8Array): Promise<void> {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(bytes as unknown as BufferSource);
  await writable.close();
}

// ─────────────────────────── lifecycle ───────────────────────────

async function readMeta(): Promise<VaultMeta | null> {
  const bytes = await readFile(await root(), VAULT_FILE);
  if (!bytes) return null;
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as VaultMeta;
  } catch {
    return null;
  }
}

export async function vaultExists(): Promise<boolean> {
  if (!vaultSupported()) return false;
  return (await readMeta()) !== null;
}

/**
 * Create the library, or unlock an existing one.
 *
 * The passphrase is verified by decrypting a known token rather than by
 * attempting to read a case, so a wrong passphrase is reported immediately and
 * unambiguously instead of surfacing as corrupt data.
 */
export async function unlockVault(passphrase: string): Promise<void> {
  if (!vaultSupported()) throw new Error('This browser does not provide device storage for a case library.');
  if (passphrase.length < 8) throw new Error('Passphrase must be at least 8 characters.');

  const dir = await root();
  let meta = await readMeta();

  if (!meta) {
    const salt = randomBytes(16);
    const derived = await deriveKeyFromPassphrase(passphrase, salt);
    const verifier = await encryptWithKey(VERIFIER_TOKEN, derived);
    meta = {
      version: 1,
      salt: toBase64(salt),
      iterations: PBKDF2_ROUNDS,
      verifier: toBase64(verifier),
      createdAt: new Date().toISOString(),
    };
    await writeFile(dir, VAULT_FILE, new TextEncoder().encode(JSON.stringify(meta, null, 2)));
    key = derived;
    index = [];
    await saveIndex();
    return;
  }

  const derived = await deriveKeyFromPassphrase(passphrase, fromBase64(meta.salt));
  try {
    const token = await decryptWithKey<string>(fromBase64(meta.verifier), derived);
    if (token !== VERIFIER_TOKEN) throw new Error('mismatch');
  } catch {
    throw new Error('Incorrect passphrase for the case library on this device.');
  }

  key = derived;
  index = (await loadIndex()) ?? [];
}

export function lockVault(): void {
  key = null;
  index = [];
}

export function isUnlocked(): boolean {
  return key !== null;
}

async function loadIndex(): Promise<CaseSummary[] | null> {
  if (!key) return null;
  const bytes = await readFile(await root(), INDEX_FILE);
  if (!bytes) return [];
  try {
    return await decryptWithKey<CaseSummary[]>(bytes, key);
  } catch {
    return [];
  }
}

async function saveIndex(): Promise<void> {
  if (!key) throw new Error('The case library is locked.');
  await writeFile(await root(), INDEX_FILE, await encryptWithKey(index, key));
}

// ─────────────────────────── cases ───────────────────────────

export function listCases(): CaseSummary[] {
  return [...index].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

function caseId(snapshot: SessionSnapshot): string {
  const id = (snapshot.patient.hospitalNumber || snapshot.patient.name || 'case')
    .replace(/[^A-Za-z0-9\-_]/g, '')
    .slice(0, 24) || 'case';
  return `${id}_${Date.now().toString(36)}`;
}

export interface SaveResult {
  id: string;
  bytes: number;
  mirroredToFolder: boolean;
  folderError: string | null;
}

export async function saveCase(
  snapshot: SessionSnapshot,
  severity: Severity,
  existingId?: string,
): Promise<SaveResult> {
  if (!key) throw new Error('The case library is locked.');

  const id = existingId ?? caseId(snapshot);
  const bytes = await encryptWithKey(snapshot, key);
  await writeFile(await casesDir(), `${id}.enc`, bytes);

  const summary: CaseSummary = {
    id,
    patientName: snapshot.patient.name,
    hospitalNumber: snapshot.patient.hospitalNumber,
    ward: snapshot.patient.ward,
    severity,
    documentCount: snapshot.documents.length,
    valueCount: snapshot.extraction.analytes.length,
    savedAt: snapshot.savedAt,
    bytes: bytes.length,
  };
  index = [...index.filter((c) => c.id !== id), summary];
  await saveIndex();

  // Mirror into the bound folder where one is available. A failure here does
  // not undo the save — the private store already holds the case.
  let mirrored = false;
  let folderError: string | null = null;
  if (boundDir) {
    try {
      await writeFile(boundDir, `${id}.enc`, bytes);
      mirrored = true;
    } catch (err) {
      folderError = err instanceof Error ? err.message : String(err);
    }
  }

  return { id, bytes: bytes.length, mirroredToFolder: mirrored, folderError };
}

export async function loadCase(id: string): Promise<SessionSnapshot> {
  if (!key) throw new Error('The case library is locked.');
  const bytes = await readFile(await casesDir(), `${id}.enc`);
  if (!bytes) throw new Error('That case is no longer present on this device.');
  return decryptWithKey<SessionSnapshot>(bytes, key);
}

export async function deleteCase(id: string): Promise<void> {
  if (!key) throw new Error('The case library is locked.');
  try {
    await (await casesDir()).removeEntry(`${id}.enc`);
  } catch {
    // Already gone; the index entry is still removed below.
  }
  index = index.filter((c) => c.id !== id);
  await saveIndex();
  if (boundDir) {
    try { await boundDir.removeEntry(`${id}.enc`); } catch { /* not mirrored */ }
  }
}

/** Remove the entire library, including the encrypted case files. */
export async function destroyVault(): Promise<void> {
  const opfs = await navigator.storage.getDirectory();
  try { await opfs.removeEntry(DIR, { recursive: true }); } catch { /* nothing to remove */ }
  lockVault();
}

// ─────────────────────────── bound folder ───────────────────────────

const IDB_NAME = 'clinician-assistant-vault';
const IDB_STORE = 'handles';

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(k: string, v: unknown): Promise<void> {
  const db = await idb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(v, k);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function idbGet<T>(k: string): Promise<T | null> {
  const db = await idb();
  const value = await new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(k);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return value;
}

/** Ask the user to choose a folder, and remember it across sessions. */
export async function bindFolder(): Promise<string> {
  if (!folderPickerSupported()) {
    throw new Error('Choosing a visible folder is only available in Chrome and Edge on desktop. The private device store is used on other browsers.');
  }
  const picker = (window as unknown as {
    showDirectoryPicker: (o?: { mode?: string; id?: string }) => Promise<FileSystemDirectoryHandle>;
  }).showDirectoryPicker;
  const handle = await picker({ mode: 'readwrite', id: 'clinician-assistant-cases' });
  boundDir = handle;
  await idbPut('boundFolder', handle);
  return handle.name;
}

export async function restoreBoundFolder(): Promise<string | null> {
  if (!folderPickerSupported()) return null;
  try {
    const handle = await idbGet<FileSystemDirectoryHandle>('boundFolder');
    if (!handle) return null;
    const perm = await (handle as unknown as {
      queryPermission: (d: { mode: string }) => Promise<PermissionState>;
    }).queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') {
      boundDir = handle;
      return handle.name;
    }
    // Permission must be re-granted by a user gesture; report the folder name
    // so the interface can offer to reconnect rather than silently dropping it.
    return `${handle.name} (permission needed)`;
  } catch {
    return null;
  }
}

export async function reconnectBoundFolder(): Promise<string | null> {
  const handle = await idbGet<FileSystemDirectoryHandle>('boundFolder');
  if (!handle) return null;
  const granted = await (handle as unknown as {
    requestPermission: (d: { mode: string }) => Promise<PermissionState>;
  }).requestPermission({ mode: 'readwrite' });
  if (granted !== 'granted') return null;
  boundDir = handle;
  return handle.name;
}

export async function unbindFolder(): Promise<void> {
  boundDir = null;
  await idbPut('boundFolder', null);
}

export function boundFolderName(): string | null {
  return boundDir?.name ?? null;
}

// ─────────────────────────── storage status ───────────────────────────

export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted?.()) return true;
  return navigator.storage.persist();
}

export async function vaultStatus(): Promise<VaultStatus> {
  const supported = vaultSupported();
  if (!supported) {
    return {
      supported: false, unlocked: false, exists: false, caseCount: 0,
      persisted: false, usageBytes: null, quotaBytes: null,
      boundFolderName: null, folderPickerSupported: false,
    };
  }
  const estimate = await navigator.storage.estimate?.().catch(() => null);
  return {
    supported: true,
    unlocked: key !== null,
    exists: await vaultExists(),
    caseCount: index.length,
    persisted: (await navigator.storage.persisted?.().catch(() => false)) ?? false,
    usageBytes: estimate?.usage ?? null,
    quotaBytes: estimate?.quota ?? null,
    boundFolderName: boundDir?.name ?? null,
    folderPickerSupported: folderPickerSupported(),
  };
}
