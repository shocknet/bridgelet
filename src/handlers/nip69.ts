import type { Event } from 'nostr-tools/pure';
import { getEventHash, finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import { Relay } from 'nostr-tools/relay';
import { hexToBytes } from '@noble/hashes/utils';
import { decodeNoffer } from './decoding';
import { getSharedSecret, encryptData, decryptData, decodePayload, encodePayload } from '../utils/encryption';

interface NostrOffer {
  receiverPubKey: string;
  relayUrl: string;
  offerId: string;
  pricingType?: number;
  priceInSats?: number;
}

export async function handleNip69Offer(req: Request, privateKeyHex: string, config: any) {
  try {
    console.log("Received request to handle NIP-69 offer");

    const { offer, amount } = await req.json();
    console.log("Parsed request JSON:", { offer, amount });

    const nostrOffer = decodeNostrOffer(offer);
    console.log("Decoded Nostr offer:", nostrOffer);

    if (!nostrOffer) {
      console.error("Invalid Nostr Offer");
      return new Response(JSON.stringify({ error: "Invalid Nostr Offer", code: 1 }), { status: 400 });
    }

    console.log(`Connecting to relay: ${nostrOffer.relayUrl}`);
    const relay = await Relay.connect(nostrOffer.relayUrl);
    console.log(`Connected to relay: ${relay.url}`);

    if (privateKeyHex.length !== 64) {
      throw new Error('Invalid private key length. Expected 64 characters.');
    }
    const privateKey = hexToBytes(privateKeyHex);
    const publicKey = getPublicKey(privateKey);
    const sharedSecret = getSharedSecret(privateKeyHex, nostrOffer.receiverPubKey);

    const encryptedContent = encryptData(JSON.stringify({ offer: nostrOffer.offerId, amount }), sharedSecret);
    const encodedContent = encodePayload(encryptedContent);
    console.log("Encrypted and encoded content:", encodedContent);

    const requestEvent: Event = {
      kind: 21001,
      pubkey: publicKey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', nostrOffer.receiverPubKey]],
      content: encodedContent,
      id: '',
      sig: ''
    };

    requestEvent.id = getEventHash(requestEvent);
    console.log("Generated request event ID:", requestEvent.id);

    const signedRequestEvent = finalizeEvent(requestEvent, privateKey);
    console.log("Signed request event:", signedRequestEvent);

    console.log("Publishing request event to relay");
    await relay.publish(signedRequestEvent);
    console.log("Published request event to relay");

    const invoiceEvent = await new Promise<Event>((resolve, reject) => {
      console.log("Subscribing to relay for response event");
      const sub = relay.subscribe([{ kinds: [21001], '#p': [publicKey], '#e': [requestEvent.id] }], {
        onevent: (e: Event) => {
          console.log("Received event from relay:", e);
          clearTimeout(timeout);
          sub.close();
          resolve(e);
        },
        oneose: () => {
          console.log("End of stored events");
        }
      });

      const timeout = setTimeout(() => {
        console.error("Timeout waiting for invoice event");
        sub.close();
        reject(new Error("Timeout waiting for invoice event"));
      }, 30000);
    });

    const encryptedPayload = decodePayload(invoiceEvent.content);
    console.log("Decoded encrypted payload:", encryptedPayload);

    const decryptedContent = decryptData(encryptedPayload, sharedSecret);
    console.log("Decrypted content:", decryptedContent);

    const invoice = JSON.parse(decryptedContent);
    console.log("Parsed invoice from event content:", invoice);

    return new Response(JSON.stringify({ status: "OK", message: "Offer sent", invoice }), { status: 200 });
  } catch (error) {
    console.error("Error handling NIP-69 offer:", error);
    let errorCode = 2; // Default to Temporary Failure
    let errorMessage = "Failed to handle NIP-69 offer";

    const err = error as Error; // Type assertion

    if (err.message.includes("Invalid Nostr Offer")) {
      errorCode = 1;
      errorMessage = "Invalid Nostr Offer";
    } else if (err.message.includes("Timeout waiting for invoice event")) {
      errorCode = 3;
      errorMessage = "Expired Offer";
    } else if (err.message.includes("Invalid private key length")) {
      errorCode = 4;
      errorMessage = "Unsupported Feature";
    } else if (err.message.includes("Invalid amount")) {
      errorCode = 5;
      errorMessage = "Invalid Amount";
    }

    return new Response(JSON.stringify({ error: errorMessage, code: errorCode }), { status: 500 });
  }
}

function decodeNostrOffer(offer: string): NostrOffer | null {
  try {
    const decoded = decodeNoffer(offer);
    return {
      receiverPubKey: decoded.pubkey,
      relayUrl: decoded.relay,
      offerId: decoded.offer,
      pricingType: decoded.priceType,
      priceInSats: decoded.price
    };
  } catch (error) {
    console.error("Error decoding Nostr offer:", error);
    return null;
  }
}