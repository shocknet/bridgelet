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

export async function handleClinkOfferInvoiceRequest(req: Request, params: Record<string, string>, privateKeyHex: string, config: any) {
  try {
    console.log("Received request to handle CLINK Offer for invoice generation");

    const { offer, amount_msats, zap_request } = await req.json();
    console.log("Parsed CLINK request JSON:", { offer, amount_msats, zap_request_present: !!zap_request });

    if (typeof amount_msats !== 'number' || amount_msats <= 0) {
      console.error("Invalid or missing amount_msats for CLINK Offer");
      return new Response(JSON.stringify({ error: "Invalid or missing amount_msats", code: 5 }), { status: 400 });
    }

    const nostrOfferDetails = decodeNostrOffer(offer);
    console.log("Decoded CLINK Offer details:", nostrOfferDetails);

    if (!nostrOfferDetails) {
      console.error("Invalid or undecodable CLINK Offer string");
      return new Response(JSON.stringify({ error: "Invalid CLINK Offer string", code: 1 }), { status: 400 });
    }

    if (nostrOfferDetails.pricingType === 0 && nostrOfferDetails.priceInSats !== undefined) {
      if (nostrOfferDetails.priceInSats !== amount_msats) {
        console.error(`Amount mismatch for fixed price CLINK Offer. Expected: ${nostrOfferDetails.priceInSats} msats, Got: ${amount_msats} msats`);
        return new Response(JSON.stringify({ 
          error: `Amount mismatch for fixed price offer. Expected ${nostrOfferDetails.priceInSats} msats.`, 
          code: 5 
        }), { status: 400 });
      }
    }

    console.log(`Connecting to relay: ${nostrOfferDetails.relayUrl}`);
    const relay = await Relay.connect(nostrOfferDetails.relayUrl);
    console.log(`Connected to relay: ${relay.url}`);

    if (privateKeyHex.length !== 64) {
      throw new Error('Invalid private key length. Expected 64 characters.');
    }
    const privateKey = hexToBytes(privateKeyHex);
    const publicKey = getPublicKey(privateKey);
    const sharedSecret = getSharedSecret(privateKeyHex, nostrOfferDetails.receiverPubKey);

    const backendPayload: {offer: string, amount_msats: number, zap_request?: string} = {
      offer: nostrOfferDetails.offerId,
      amount_msats: amount_msats
    };

    if (zap_request && typeof zap_request === 'string') {
      try {
        JSON.parse(zap_request);
        backendPayload.zap_request = zap_request;
        console.log("CLINK Offer Processor: Forwarding NIP-57 zap_request to backend.");
      } catch (e) {
        console.warn("CLINK Offer Processor: Received zap_request was not valid JSON. Not forwarding. Error:", e);
      }
    }

    const encryptedContent = encryptData(JSON.stringify(backendPayload), sharedSecret);
    const encodedContent = encodePayload(encryptedContent);
    console.log("Encrypted and encoded content:", encodedContent);

    const requestEvent: Event = {
      kind: 21001,
      pubkey: publicKey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['p', nostrOfferDetails.receiverPubKey],
        ["clink_version", "1"]
      ],
      content: encodedContent,
      id: '',
      sig: ''
    };

    requestEvent.id = getEventHash(requestEvent);
    console.log("CLINK Offer: Generated request event ID:", requestEvent.id);

    const signedRequestEvent = finalizeEvent(requestEvent, privateKey);
    console.log("Signed request event:", signedRequestEvent);

    console.log("Publishing request event to relay");
    await relay.publish(signedRequestEvent);
    console.log("Published request event to relay");

    const invoiceEvent = await new Promise<Event>((resolve, reject) => {
      console.log("Subscribing to relay for response event (invoice)");
      const sub = relay.subscribe([{ 
        kinds: [21001], 
        '#p': [publicKey], 
        '#e': [requestEvent.id]
      }], {
        onevent: (e: Event) => {
          const clinkVersionTag = e.tags.find(tag => tag[0] === 'clink_version' && tag[1] === '1');
          if (!clinkVersionTag) {
            console.warn("Received response event without or with wrong clink_version tag. Ignoring.", e);
            return;
          }
          console.log("Received event from relay (expected CLINK invoice event):", e);
          clearTimeout(timeout);
          sub.close();
          resolve(e);
        },
        oneose: () => {
          console.log("End of stored events for subscription");
        }
      });

      const timeout = setTimeout(() => {
        console.error("Timeout waiting for invoice event");
        sub.close();
        reject(new Error("Timeout waiting for CLINK Offer invoice event"));
      }, 30000);
    });

    const encryptedPayload = decodePayload(invoiceEvent.content);
    console.log("Decoded encrypted payload:", encryptedPayload);

    const decryptedContent = decryptData(encryptedPayload, sharedSecret);
    console.log("Decrypted invoice event content:", decryptedContent);

    const invoice = JSON.parse(decryptedContent);
    console.log("Parsed invoice from event content:", invoice);

    if (invoice && invoice.res === "ok" && invoice.bolt11) {
      return new Response(JSON.stringify({ 
        status: "OK", 
        message: "Offer processed, invoice retrieved", 
        invoice: { bolt11: invoice.bolt11 }
      }), { status: 200 });
    } else if (invoice && invoice.res === "error" && invoice.reason) {
      console.error("Received error response from backend node:", invoice.reason);
      return new Response(JSON.stringify({ error: invoice.reason, code: 2 }), { status: 500 });
    } else {
      console.error("Invalid or unexpected response structure from backend node:", invoice);
      throw new Error("Invalid response structure from backend CLINK processing node");
    }
  } catch (error) {
    console.error("Error handling CLINK Offer for invoice generation:", error);
    let errorCode = 2; // Default to Temporary Failure
    let errorMessage = "Failed to handle CLINK Offer for invoice generation";

    const err = error as Error;

    if (err.message.includes("Invalid CLINK Offer")) {
      errorCode = 1;
      errorMessage = "Invalid Offer string";
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
    console.error("Error decoding CLINK Offer string (decodeNoffer compatible format was expected):", error);
    return null;
  }
}