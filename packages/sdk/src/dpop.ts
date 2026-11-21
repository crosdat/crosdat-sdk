/**
 * Public ECDSA P-256 JSON Web Key fields included in a DPoP proof header and
 * hashed canonically under RFC 7638 to compute `cnf.jkt`.
 */
export interface DpopPublicJwk {
  crv: 'P-256';
  kty: 'EC';
  x: string;
  y: string;
}

/**
 * Browser- or runtime-held DPoP asymmetric key bundle.
 *
 * The `privateKey` is generated with `extractable: false` under WebCrypto so
 * raw private key material cannot be exported by script code.
 */
export interface DpopKeyMaterial {
  /** Non-extractable ECDSA P-256 signing key. */
  privateKey: CryptoKey;
  /** Corresponding ECDSA P-256 verification key. */
  publicKey: CryptoKey;
  /** Exported public JWK coordinates included in DPoP JWT headers. */
  publicJwk: DpopPublicJwk;
  /** RFC 7638 SHA-256 base64url thumbprint (`cnf.jkt`). */
  thumbprint: string;
}

/**
 * Input parameters used to construct and sign a single-request RFC 9449 DPoP proof.
 */
export interface SignDpopProofOptions {
  /** Active DPoP key material generated via {@link createDpopKeyPair}. */
  keyMaterial: DpopKeyMaterial;
  /** Uppercase HTTP method (`GET`, `POST`, `PUT`, `DELETE`, etc.). */
  httpMethod: string;
  /** Target HTTP URI without query or fragment (`htu` per RFC 9449 Section 4.2). */
  httpUrl: string;
  /** Optional bearer access/session token to bind via SHA-256 `ath` claim. */
  accessToken?: string;
  /** Optional server-issued DPoP nonce when challenged via `DPoP-Nonce` header. */
  nonce?: string;
  /** Optional unix timestamp in seconds (defaults to current clock). */
  issuedAtSeconds?: number;
}

/**
 * Decoded and structurally verified RFC 9449 DPoP proof payload and thumbprint.
 */
export interface VerifiedDpopProof {
  /** RFC 7638 SHA-256 base64url thumbprint of the embedded public JWK. */
  thumbprint: string;
  /** Uppercase HTTP method (`htm`). */
  httpMethod: string;
  /** Normalized HTTP target URI without query/fragment (`htu`). */
  httpUrl: string;
  /** Proof creation timestamp in unix seconds (`iat`). */
  issuedAtSeconds: number;
  /** Unique replay-prevention token identifier (`jti`). */
  jti: string;
  /** Optional base64url SHA-256 hash of the bound access token (`ath`). */
  accessTokenHash?: string;
  /** Optional server nonce echoed by the client (`nonce`). */
  nonce?: string;
}

function resolveSubtleCrypto(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error('WebCrypto SubtleCrypto is required for DPoP proof generation');
  }
  return globalThis.crypto.subtle;
}

/**
 * Encodes a `Uint8Array` into URL-safe base64 without padding (`base64url` per RFC 4648).
 *
 * @param bytes - Raw byte array to encode.
 * @returns Unpadded base64url string.
 */
export function encodeBase64Url(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * Decodes an unpadded or padded `base64url` string into a `Uint8Array`.
 *
 * @param input - Base64url string to decode.
 * @returns Decoded raw bytes.
 */
export function decodeBase64Url(input: string): Uint8Array {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLength);
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(padded, 'base64'));
  }
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/**
 * Strips query parameters and URL fragments from an HTTP URL to form the canonical
 * RFC 9449 `htu` claim value.
 *
 * @param rawUrl - Full request URL string.
 * @returns Canonical `scheme://host[:port]/path` string.
 */
export function normalizeDpopHtu(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

/**
 * Computes the RFC 7638 JWK SHA-256 thumbprint (`base64url`) of an ECDSA P-256
 * public key using lexicographically ordered required members (`crv`, `kty`, `x`, `y`).
 *
 * @param jwk - Public EC P-256 JWK coordinates.
 * @returns Base64url-encoded SHA-256 thumbprint suitable for `cnf.jkt`.
 */
export async function computeJwkThumbprint(jwk: DpopPublicJwk): Promise<string> {
  const canonicalJson = JSON.stringify({
    crv: jwk.crv,
    kty: jwk.kty,
    x: jwk.x,
    y: jwk.y,
  });
  const digest = await resolveSubtleCrypto().digest(
    'SHA-256',
    new TextEncoder().encode(canonicalJson),
  );
  return encodeBase64Url(new Uint8Array(digest));
}

/**
 * Generates a fresh non-extractable ECDSA P-256 WebCrypto keypair and computes
 * its RFC 7638 public key thumbprint (`cnf.jkt`).
 *
 * @returns Non-extractable signing key, public JWK, and SHA-256 thumbprint.
 */
export async function createDpopKeyPair(): Promise<DpopKeyMaterial> {
  const subtle = resolveSubtleCrypto();
  const pair = await subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign', 'verify'],
  );
  const exported = await subtle.exportKey('jwk', pair.publicKey);
  if (exported.kty !== 'EC' || exported.crv !== 'P-256' || !exported.x || !exported.y) {
    throw new Error('Unexpected JWK coordinates exported from P-256 public key');
  }
  const publicJwk: DpopPublicJwk = {
    crv: 'P-256',
    kty: 'EC',
    x: exported.x,
    y: exported.y,
  };
  const thumbprint = await computeJwkThumbprint(publicJwk);
  return {
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    publicJwk,
    thumbprint,
  };
}

const DPOP_IDB_NAME = 'crosdat-dpop-keys';
const DPOP_IDB_STORE = 'session-keys';
const inMemorySessionKeys = new Map<string, Promise<DpopKeyMaterial>>();

async function hashSessionKeyId(sessionToken: string): Promise<string> {
  const digest = await resolveSubtleCrypto().digest(
    'SHA-256',
    new TextEncoder().encode(sessionToken),
  );
  return encodeBase64Url(new Uint8Array(digest));
}

function openDpopKeyStore(): Promise<IDBDatabase | null> {
  if (typeof globalThis.indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = globalThis.indexedDB.open(DPOP_IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DPOP_IDB_STORE)) {
          db.createObjectStore(DPOP_IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readIdbKey(db: IDBDatabase, keyId: string): Promise<DpopKeyMaterial | null> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(DPOP_IDB_STORE, 'readonly');
      const req = tx.objectStore(DPOP_IDB_STORE).get(keyId);
      req.onsuccess = () => {
        const val = req.result as DpopKeyMaterial | undefined;
        resolve(val?.privateKey && val?.publicJwk && val?.thumbprint ? val : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeIdbKey(db: IDBDatabase, keyId: string, mat: DpopKeyMaterial): Promise<void> {
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(DPOP_IDB_STORE, 'readwrite');
      tx.objectStore(DPOP_IDB_STORE).put(mat, keyId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Resolves or creates a non-extractable ECDSA P-256 DPoP keypair bound to a
 * `sessionToken` across sibling embed frames on the same runtime origin via
 * IndexedDB + Web Locks, falling back to an in-memory keypair outside browsers.
 *
 * @param sessionToken - Short-lived embed session JWT.
 * @returns Deterministic per-session DPoP key material.
 */
export async function getOrCreateSessionDpopKeyPair(
  sessionToken: string,
): Promise<DpopKeyMaterial> {
  const keyId = await hashSessionKeyId(sessionToken);
  const existingMem = inMemorySessionKeys.get(keyId);
  if (existingMem) return existingMem;

  const task = (async (): Promise<DpopKeyMaterial> => {
    const createAndPersist = async (): Promise<DpopKeyMaterial> => {
      const db = await openDpopKeyStore();
      if (db) {
        try {
          const existing = await readIdbKey(db, keyId);
          if (existing) return existing;
          const fresh = await createDpopKeyPair();
          await writeIdbKey(db, keyId, fresh);
          return fresh;
        } finally {
          db.close();
        }
      }
      return createDpopKeyPair();
    };

    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (locks?.request) {
      return locks.request(`crosdat-dpop-${keyId}`, createAndPersist);
    }
    return createAndPersist();
  })();

  inMemorySessionKeys.set(keyId, task);
  try {
    return await task;
  } catch (err) {
    inMemorySessionKeys.delete(keyId);
    throw err;
  }
}

/**
 * Signs a single-use RFC 9449 `dpop+jwt` proof binding the HTTP method, target
 * URL, timestamp, unique `jti`, and optional access-token hash (`ath`).
 *
 * @param options - Signing key material and target HTTP request metadata.
 * @returns Compact JWS string for the HTTP `DPoP` request header.
 */
export async function signDpopProof(options: SignDpopProofOptions): Promise<string> {
  const subtle = resolveSubtleCrypto();
  const header = {
    typ: 'dpop+jwt',
    alg: 'ES256',
    jwk: options.keyMaterial.publicJwk,
  };

  let ath: string | undefined;
  if (options.accessToken) {
    const tokenDigest = await subtle.digest(
      'SHA-256',
      new TextEncoder().encode(options.accessToken),
    );
    ath = encodeBase64Url(new Uint8Array(tokenDigest));
  }

  const payload: Record<string, unknown> = {
    jti: globalThis.crypto.randomUUID(),
    htm: options.httpMethod.toUpperCase(),
    htu: normalizeDpopHtu(options.httpUrl),
    iat: options.issuedAtSeconds ?? Math.floor(Date.now() / 1000),
    ...(ath ? { ath } : {}),
    ...(options.nonce ? { nonce: options.nonce } : {}),
  };

  const encodedHeader = encodeBase64Url(new TextEncoder().encode(JSON.stringify(header)));
  const encodedPayload = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = await subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    options.keyMaterial.privateKey,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${encodeBase64Url(new Uint8Array(signature))}`;
}

/**
 * Cryptographically verifies an RFC 9449 `dpop+jwt` compact JWS against its
 * embedded P-256 public JWK and returns its normalized claims + thumbprint.
 *
 * @param proofJwt - Compact three-segment DPoP JWT from the `DPoP` HTTP header.
 * @returns Verified claims and RFC 7638 public key thumbprint.
 */
export async function verifyDpopProof(proofJwt: string): Promise<VerifiedDpopProof> {
  const segments = proofJwt.split('.');
  if (segments.length !== 3) {
    throw new Error('Malformed DPoP proof: expected three JWS segments');
  }
  const [headerSeg, payloadSeg, sigSeg] = segments as [string, string, string];
  const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(headerSeg))) as {
    typ?: string;
    alg?: string;
    jwk?: Partial<DpopPublicJwk> & { d?: string };
  };

  if (header.typ !== 'dpop+jwt' || header.alg !== 'ES256') {
    throw new Error('Invalid DPoP proof header: typ must be dpop+jwt and alg must be ES256');
  }
  if (
    !header.jwk ||
    header.jwk.kty !== 'EC' ||
    header.jwk.crv !== 'P-256' ||
    typeof header.jwk.x !== 'string' ||
    typeof header.jwk.y !== 'string' ||
    'd' in header.jwk
  ) {
    throw new Error('Invalid DPoP proof header: public EC P-256 JWK required without private key');
  }

  const publicJwk: DpopPublicJwk = {
    crv: 'P-256',
    kty: 'EC',
    x: header.jwk.x,
    y: header.jwk.y,
  };

  const subtle = resolveSubtleCrypto();
  const importedKey = await subtle.importKey(
    'jwk',
    publicJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );

  const signingBytes = new TextEncoder().encode(`${headerSeg}.${payloadSeg}`);
  const sigBytes = decodeBase64Url(sigSeg);
  const valid = await subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    importedKey,
    sigBytes as BufferSource,
    signingBytes,
  );
  if (!valid) {
    throw new Error('DPoP proof cryptographic signature verification failed');
  }

  const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(payloadSeg))) as Record<
    string,
    unknown
  >;
  if (
    typeof payload.jti !== 'string' ||
    typeof payload.htm !== 'string' ||
    typeof payload.htu !== 'string' ||
    typeof payload.iat !== 'number'
  ) {
    throw new Error('DPoP proof payload missing required jti, htm, htu, or iat claims');
  }

  const thumbprint = await computeJwkThumbprint(publicJwk);
  return {
    thumbprint,
    httpMethod: payload.htm,
    httpUrl: payload.htu,
    issuedAtSeconds: payload.iat,
    jti: payload.jti,
    accessTokenHash: typeof payload.ath === 'string' ? payload.ath : undefined,
    nonce: typeof payload.nonce === 'string' ? payload.nonce : undefined,
  };
}
