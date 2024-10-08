import { randomBytes } from '@noble/hashes/utils';
import { streamXOR as xchacha20 } from '@stablelib/xchacha20';
import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';

type EncryptedData = {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
};

export const getSharedSecret = (privateKey: string, publicKey: string) => {
  const key = secp256k1.getSharedSecret(privateKey, "02" + publicKey);
  return sha256(key.slice(1, 33));
};

export const encryptData = (content: string, sharedSecret: Uint8Array) => {
  const nonce = randomBytes(24);
  const plaintext = new TextEncoder().encode(content);
  const ciphertext = xchacha20(sharedSecret, nonce, plaintext, plaintext);
  return {
    ciphertext: Uint8Array.from(ciphertext),
    nonce: nonce,
  } as EncryptedData;
};

export const decryptData = (payload: EncryptedData, sharedSecret: Uint8Array) => {
  const dst = xchacha20(sharedSecret, payload.nonce, payload.ciphertext, payload.ciphertext);
  const decoded = new TextDecoder().decode(dst);
  return decoded;
};

const xchacha20EncryptionVersion = 1;

export const decodePayload = (p: string) => {
  const buf = Uint8Array.from(atob(p), c => c.charCodeAt(0));
  if (buf[0] !== xchacha20EncryptionVersion) {
    throw new Error("Encryption version unsupported");
  }
  return {
    nonce: buf.subarray(1, 25),
    ciphertext: buf.subarray(25),
  } as EncryptedData;
};

export const encodePayload = (p: EncryptedData) => {
  const combined = new Uint8Array([xchacha20EncryptionVersion, ...p.nonce, ...p.ciphertext]);
  return btoa(String.fromCharCode(...combined));
};