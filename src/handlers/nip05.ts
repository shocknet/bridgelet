export async function handleNip05Verification(req: Request, config: any) {
  const url = new URL(req.url);
  const name = url.searchParams.get('name')?.toLowerCase();

  if (!name) {
    return new Response(JSON.stringify({
      status: "ERROR",
      reason: "Missing 'name' query parameter."
    }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  const aliasConfig = config.aliases && config.aliases[name];

  if (aliasConfig && aliasConfig.nostrPubkey) {
    const responsePayload: {
      names: Record<string, string>,
      relays?: Record<string, string[]>,
      clink_offer?: string,
      clink_debit?: string
    } = {
      names: {
        [name]: aliasConfig.nostrPubkey
      }
    };

    if (aliasConfig.relays && Array.isArray(aliasConfig.relays) && aliasConfig.relays.length > 0) {
      responsePayload.relays = {
        [aliasConfig.nostrPubkey]: aliasConfig.relays
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
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } else {
    return new Response(JSON.stringify({
      status: "ERROR",
      reason: `User '${name}' not found or nostrPubkey not configured.`
    }), {
      status: 404,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
} 