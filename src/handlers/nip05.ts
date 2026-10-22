import * as nip19 from 'nostr-tools/nip19';

function pointerByName(name: string, value: unknown): Record<string, string> | undefined {
  if (typeof value !== 'string' || !value) {
    return undefined;
  }
  return { [name]: value };
}

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
      clink_offer?: Record<string, string>,
      clink_debit?: Record<string, string>
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

    const clinkOffer = pointerByName(name, aliasConfig.clink_offer);
    if (clinkOffer) {
      responsePayload.clink_offer = clinkOffer;
    }

    const clinkDebit = pointerByName(name, aliasConfig.clink_debit);
    if (clinkDebit) {
      responsePayload.clink_debit = clinkDebit;
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