import { decodeNoffer } from '../handlers/decoding'; // Adjusted path

export function handleLnurlStaticIdentifier(req: Request, params: { username: string }, privateKey: string, config: any) {
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

  if (!userConfig.clink_offer) {
    return new Response(JSON.stringify({
      status: "ERROR",
      reason: `Alias '${username}' is not configured for CLINK Offer (LNURL) payments.`
    }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const response: any = {
    status: "OK",
    tag: "payRequest",
    callback: `https://${domain}/lnurlpay/${username}`,
    maxSendable: userConfig.maxSendable || 1000000000,
    minSendable: userConfig.minSendable || 1000,
    metadata: JSON.stringify([
      ["text/identifier", `${username}@${domain}`],
      ["text/plain", `Pay ${username}@${domain}`]
    ]),
    clink_offer: userConfig.clink_offer
  };

  // For NIP-57 Zaps, nostrPubkey in LNURL-P response should be the key signing the Zap Receipt.
  // As per user clarification, this is the pubkey from the CLINK Offer itself (TLV 0).
  try {
    const offerDetails = decodeNoffer(userConfig.clink_offer);
    if (offerDetails && offerDetails.pubkey) {
      response.nostrPubkey = offerDetails.pubkey; // This is the backend CLINK service pubkey
      response.allowsNostr = true; // Signal that Nostr Zaps are allowed
    } else {
      // This case should ideally not happen if clink_offer is valid and decodeNoffer works
      console.warn(`Could not extract pubkey from clink_offer for alias '${username}' for Zap configuration. Zaps may not work as expected.`);
    }
  } catch (error) {
    console.error(`Error decoding clink_offer for alias '${username}' to configure NIP-57 Zaps:`, error);
    // Do not advertise Zap support if the offer string is malformed or its pubkey cannot be read.
  }
  
  // The userConfig.nostrPubkey (from config.json, for NIP-05) is NOT used here for Zaps 
  // if the CLINK offer's service pubkey is authoritative for Zap receipts.
  // If it were desired to use userConfig.nostrPubkey as a fallback or primary, that logic would go here.

  return new Response(JSON.stringify(response), {
    headers: { "Content-Type": "application/json" },
  });
}