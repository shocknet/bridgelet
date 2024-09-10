import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { bech32 } from 'bech32';

export type OfferPointer = {
  pubkey: string,
  relay: string,
  offer: string,
  priceType: number,
  price?: number
};

export function decodeNoffer(noffer: string): OfferPointer {
  const { prefix, words } = bech32.decode(noffer, 5000);
  if (prefix !== "noffer") {
    throw new Error("Expected noffer prefix");
  }
  const data = new Uint8Array(bech32.fromWords(words));

  const tlv = parseTLV(data);
  if (!tlv[0]?.[0]) throw new Error('missing TLV 0 for noffer');
  if (tlv[0][0].length !== 32) throw new Error('TLV 0 should be 32 bytes');
  if (!tlv[1]?.[0]) throw new Error('missing TLV 1 for noffer');
  if (!tlv[2]?.[0]) throw new Error('missing TLV 2 for noffer');
  if (!tlv[3]?.[0]) throw new Error('missing TLV 3 for noffer');
  return {
    pubkey: bytesToHex(tlv[0][0]),
    relay: utf8Decoder.decode(tlv[1][0]),
    offer: utf8Decoder.decode(tlv[2][0]),
    priceType: tlv[3][0][0],
    price: tlv[4] ? uint8ArrayToNumber(tlv[4][0]) : undefined
  };
}

function parseTLV(data: Uint8Array): { [t: number]: Uint8Array[] } {
  const result: { [t: number]: Uint8Array[] } = {};
  let rest = data;
  while (rest.length > 0) {
    const t = rest[0];
    const l = rest[1];
    const v = rest.slice(2, 2 + l);
    rest = rest.slice(2 + l);
    if (v.length < l) throw new Error(`not enough data to read on TLV ${t}`);
    result[t] = result[t] || [];
    result[t].push(v);
  }
  return result;
}

const utf8Decoder = new TextDecoder('utf-8');

const uint8ArrayToNumber = (arr: Uint8Array): number => {
  const buffer = arr.buffer;
  const view = new DataView(buffer);
  return view.getUint32(0);
};