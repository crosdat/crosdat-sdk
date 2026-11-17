import { describe, expect, it } from 'vitest';
import {
  computeJwkThumbprint,
  createDpopKeyPair,
  decodeBase64Url,
  encodeBase64Url,
  normalizeDpopHtu,
  signDpopProof,
  verifyDpopProof,
} from '../dpop.js';

describe('RFC 9449 DPoP proof generation and verification', () => {
  it('round-trips base64url byte arrays without padding', () => {
    const sample = new Uint8Array([0, 255, 254, 128, 63, 62, 1]);
    const encoded = encodeBase64Url(sample);
    expect(encoded).not.toContain('=');
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(Array.from(decodeBase64Url(encoded))).toEqual(Array.from(sample));
  });

  it('strips query parameters and fragments from HTTP target URLs (htu)', () => {
    expect(
      normalizeDpopHtu('https://api.crosdat.com/api/v1/guidelines/search?query=sepsis&limit=5#top'),
    ).toBe('https://api.crosdat.com/api/v1/guidelines/search');
  });

  it('generates non-extractable ECDSA P-256 keys with deterministic RFC 7638 thumbprints', async () => {
    const keyMaterial = await createDpopKeyPair();
    expect(keyMaterial.privateKey.extractable).toBe(false);
    expect(keyMaterial.publicJwk.kty).toBe('EC');
    expect(keyMaterial.publicJwk.crv).toBe('P-256');
    const recomputed = await computeJwkThumbprint(keyMaterial.publicJwk);
    expect(recomputed).toBe(keyMaterial.thumbprint);
  });

  it('signs and cryptographically verifies DPoP proofs with ath and nonce claims', async () => {
    const keyMaterial = await createDpopKeyPair();
    const proof = await signDpopProof({
      keyMaterial,
      httpMethod: 'post',
      httpUrl: 'https://api.crosdat.com/api/v1/dosing/evaluate?debug=1',
      accessToken: 'sess_token_12345',
      nonce: 'srv_nonce_abc',
      issuedAtSeconds: 1735689600,
    });

    const verified = await verifyDpopProof(proof);
    expect(verified.thumbprint).toBe(keyMaterial.thumbprint);
    expect(verified.httpMethod).toBe('POST');
    expect(verified.httpUrl).toBe('https://api.crosdat.com/api/v1/dosing/evaluate');
    expect(verified.issuedAtSeconds).toBe(1735689600);
    expect(verified.nonce).toBe('srv_nonce_abc');
    expect(verified.accessTokenHash).toBeDefined();
    expect(verified.jti.length).toBeGreaterThan(10);
  });

  it('rejects tampered DPoP payloads during cryptographic signature verification', async () => {
    const keyMaterial = await createDpopKeyPair();
    const proof = await signDpopProof({
      keyMaterial,
      httpMethod: 'POST',
      httpUrl: 'https://api.crosdat.com/api/v1/dosing/evaluate',
    });

    const [headerSeg, , sigSeg] = proof.split('.');
    const forgedPayload = encodeBase64Url(
      new TextEncoder().encode(
        JSON.stringify({
          jti: 'forged-jti',
          htm: 'GET',
          htu: 'https://api.crosdat.com/api/v1/calculators',
          iat: 1735689600,
        }),
      ),
    );
    await expect(
      verifyDpopProof(`${headerSeg}.${forgedPayload}.${sigSeg}`),
    ).rejects.toThrow(/signature verification failed/i);
  });
});
