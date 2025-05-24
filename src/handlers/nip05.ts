import * as nip19 from 'nostr-tools/nip19';

export async function handleNip05Verification(req: Request, config: any) {
  const url = new URL(req.url);
  const name = url.searchParams.get('name')?.toLowerCase();

  if (!name) {
    return new Response(JSON.stringify({
      status: "ERROR",
      reason: "Missing 'name' query parameter."
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const aliasConfig = config.aliases && config.aliases[name];

  if (aliasConfig && aliasConfig.nostrPubkey) {
    let hexPubkey = aliasConfig.nostrPubkey;
    if (hexPubkey.startsWith('npub')) {
      try {
        const decoded = nip19.decode(hexPubkey);
        if (decoded.type === 'npub' && typeof decoded.data === 'string') {
          hexPubkey = decoded.data;
        } else if (decoded.type === 'npub' && decoded.data && typeof decoded.data === 'object' && 'pubkey' in decoded.data) {
          hexPubkey = decoded.data.pubkey;
        }
      } catch (e) {
        return new Response(JSON.stringify({
          status: "ERROR",
          reason: "Invalid npub format for nostrPubkey."
        }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    const responsePayload: {
      names: Record<string, string>,
      relays?: Record<string, string[]>,
      clink_offer?: string,
      clink_debit?: string
    } = {
      names: {
        [name]: hexPubkey
      }
    };

    if (aliasConfig.relays && Array.isArray(aliasConfig.relays) && aliasConfig.relays.length > 0) {
      responsePayload.relays = {
        [hexPubkey]: aliasConfig.relays
      };
    }

    if (aliasConfig.clink_offer && typeof aliasConfig.clink_offer === 'string') {
      responsePayload.clink_offer = aliasConfig.clink_offer;
    }

    if (aliasConfig.clink_debit && typeof aliasConfig.clink_debit === 'string') {
      responsePayload.clink_debit = aliasConfig.clink_debit;
    }

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } else {
    return new Response(JSON.stringify({
      status: "ERROR",
      reason: `User '${name}' not found or nostrPubkey not configured.`
    }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
} 