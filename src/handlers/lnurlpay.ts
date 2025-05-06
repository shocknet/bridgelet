import { handleClinkOfferInvoiceRequest } from './clinkProcessor';
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
  
  if (!userConfig.clink_offer) {
    console.error(`CLINK Offer is not configured for alias: ${username}`);
    return new Response(JSON.stringify({
      status: "ERROR",
      reason: `Payment processing not configured for user '${username}' (missing CLINK Offer).`
    }), {
      status: 500, 
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const amountParam = url.searchParams.get('amount');
  const nostrZapRequestString = url.searchParams.get('nostr');

  if (!amountParam) {
    return new Response(JSON.stringify({
      status: "ERROR",
      reason: "Missing amount parameter"
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const amountMsat = parseInt(amountParam, 10);

  if (isNaN(amountMsat) || amountMsat <= 0) {
    return new Response(JSON.stringify({
      status: "ERROR",
      reason: "Invalid amount parameter"
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // The metadata defined here is per LUD-06 for the LNURL-Pay first response.
  // It helps the paying client understand the context of the payment.
  // The actual invoice description for CLINK Offers (especially with Zaps)
  // will be determined by the CLINK Offer processing logic in handleClinkOfferInvoiceRequest.
  const lnurlMetadata = JSON.stringify([
    ["text/plain", `Payment to ${username}@${domain}`],
    ["text/identifier", `${username}@${domain}`]
  ]);
  // metadataHash is not directly used in the call to handleClinkOfferInvoiceRequest,
  // as that function will generate the invoice based on the CLINK offer / Zap request specifics.

  try {
    // Prepare the request for handleClinkOfferInvoiceRequest.
    const clinkProcessingRequestBody: {offer: string, amount_msats: number, zap_request?: string} = {
      offer: userConfig.clink_offer,
      amount_msats: amountMsat 
    };

    if (nostrZapRequestString) {
      // Basic validation: should be a JSON string. Deeper validation (e.g., parsing to check kind) can be added.
      try {
        JSON.parse(nostrZapRequestString); // Check if it's valid JSON
        clinkProcessingRequestBody.zap_request = nostrZapRequestString;
        console.log(`LNURL-pay: Including NIP-57 Zap Request for alias ${username}`);
      } catch (e) {
        console.warn(`LNURL-pay: 'nostr' query parameter for alias ${username} is not valid JSON, ignoring for Zap. Error:`, e);
        // Optionally return an error to the client if a zap was clearly intended but malformed.
        // For now, proceed without it, treating as a regular payment.
      }
    }

    const clinkProcessingRequest = new Request(req.url, { // req.url for context, body is key
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clinkProcessingRequestBody)
    });

    const clinkResponse = await handleClinkOfferInvoiceRequest(clinkProcessingRequest, privateKey, config);
    const responseData = await clinkResponse.json();

    if (clinkResponse.status !== 200) {
      return new Response(JSON.stringify({
        status: "ERROR",
        reason: responseData.error || "Failed to generate invoice via CLINK Offer processing"
      }), {
        status: clinkResponse.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // LUD-06 PayRequest second response structure
    const payResponse: { pr: string, routes: any[], successAction?: any } = {
      pr: responseData.invoice.bolt11, 
      routes: [] 
    };
    
    // Example: LUD-09 successAction can be configured per user
    // if (userConfig.successAction) { payResponse.successAction = userConfig.successAction; }

    return new Response(JSON.stringify(payResponse), {
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