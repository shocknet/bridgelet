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

  const response: any = {
    status: "OK",
    tag: "payRequest",
    callback: `https://${domain}/lnurlpay/${username}`,
    minSendable: 1000,
    maxSendable: 100000000,
    metadata: JSON.stringify([
      ["text/identifier", `${username}@${domain}`],
      ["text/plain", `Pay to ${username}`]
    ]),
    nip69: userConfig.nip69
  };

  if (userConfig.nostrPubkey) {
    response.nostrPubkey = userConfig.nostrPubkey;
  }

  return new Response(JSON.stringify(response), {
    headers: { "Content-Type": "application/json" },
  });
}