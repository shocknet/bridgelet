import { handleNip69Offer } from './nip69';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

export async function handleLnurlPayRequest(req: Request, params: { username: string }, privateKey: string, config: any) {
  const { username } = params;
  const { domain, aliases } = config;

  if (!aliases[username]) {
    return new Response(JSON.stringify({
      status: "ERROR",
      reason: "Unknown username"
    }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const userConfig = aliases[username];
  const url = new URL(req.url);
  const amount = url.searchParams.get('amount');

  if (!amount) {
    return new Response(JSON.stringify({
      status: "ERROR",
      reason: "Missing amount parameter"
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const amountMsat = parseInt(amount, 10);

  if (isNaN(amountMsat) || amountMsat <= 0) {
    return new Response(JSON.stringify({
      status: "ERROR",
      reason: "Invalid amount parameter"
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const amountSat = amountMsat / 1000; // Convert millisatoshis to satoshis

  // Create the metadata string
  const metadata = JSON.stringify([
    ["text/plain", `Payment to ${username}@${domain}`],
    ["text/identifier", `${username}@${domain}`]
  ]);

  // Calculate the hash of the metadata
  const metadataHash = bytesToHex(sha256(new TextEncoder().encode(metadata)));

  try {
    // Use the handleNip69Offer function to get the invoice
    const nip69Response = await handleNip69Offer(new Request('http://localhost/nip69', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        offer: userConfig.nip69,
        amount: amountSat // Ensure amount is in satoshis
      })
    }), privateKey, config);

    const responseData = await nip69Response.json();

    if (nip69Response.status !== 200) {
      return new Response(JSON.stringify({
        status: "ERROR",
        reason: responseData.error || "Failed to generate invoice"
      }), {
        status: nip69Response.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // TODO: Verify that the invoice includes the correct description hash
    // This would require parsing the BOLT11 invoice and checking its description hash

    return new Response(JSON.stringify({
      pr: responseData.invoice.bolt11,
      routes: []
    }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error handling LNURL-pay request:", error);
    return new Response(JSON.stringify({
      status: "ERROR",
      reason: "Internal server error"
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}