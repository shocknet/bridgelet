# Bridgelet

A minimalist LNURL-P and Lightning Address bridge that leverages [CLINK Offers](https://clinkme.dev) to fetch invoices from Lightning nodes that don't otherwise have the requisite networking. 

## Getting Started

This project uses [Bun](https://bun.sh/). You can install it with this one-liner:

```
curl -fsSL https://bun.sh/install | bash
```

Then,

1. Clone the repository:

   ```
   git clone https://github.com/shocknet/bridgelet.git && cd bridgelet
   ```

2. Install dependencies:

   ```
   bun install
   ```

3. Create a `config.json`:

    ```
    cp config.json.example config.json
    ```
    
    The `config.json` file allows you to define aliases. Each alias can have a Nostr public key (for NIP-05 discovery and NIP-57 Zap Receipts), a CLINK Offer string (for LNURL-P), an optional CLINK Debit string (for NIP-05 discovery), and optional suggested relays for NIP-05.

    ```json
    {
      "domain": "your-domain.com",
      "port": 3000,
      "aliases": {
        "your_alias": { // your_alias@your-domain.com
          "clink_offer": "noffer1...",
          // Optional NIP-05 Values
          "nostrPubkey": "your_nostr_public_key_hex", // For Verification
          "relays": ["wss://relay.damus.io", "wss://nos.lol"],
          "clink_debit": "ndebit1..."  // Debit string discovery
        }
        // Add more aliases as needed
      }
    }
    ```

4. Start the server:

   ```
   bun start
   ```


### Reverse Proxy Configuration

You'll need an SSL cert, Caddy is suggested as it handles Certbot automatically. Simply add an "A" record pointing at your server IP from wherever you manage DNS for your domain.

Example Caddyfile directive:

```
your-domain.com {
    reverse_proxy localhost:3000
}
```

## API Reference

### 1. LNURL-pay Endpoint (`GET /.well-known/lnurlp/:username`)
Initiates the LNURL-P flow for a specific user. Returns a JSON object with payment details.
To support NIP-57 Zaps, `bridgelet` will include `allowsNostr: true` and set the `nostrPubkey` field in this response to the public key of the CLINK Offer service (extracted from the alias's configured `clink_offer` string). This `nostrPubkey` is the key expected to sign Zap Receipts for payments made via this LNURL-P flow.

### 2. CLINK Offer Invoice Request (`POST /offer`)
This endpoint processes a CLINK Offer string and an amount to generate a BOLT11 invoice. It's used internally by the LNURL-P flow but can also be called directly.

**Request Body (JSON):**
```json
{
  "offer": "<clink_offer_string_noffer1...>",
  "amount_msats": 123000,
  "zap_request": "<stringified_kind_9734_event_json>" // Optional, for NIP-57 Zaps
}
```
Returns a JSON object containing the BOLT11 invoice (`pr` nested under `invoice`).

**Example using curl:**
```bash
cURL -X POST \
  https://your-domain.com/clink/get-invoice-from-offer \
  -H 'Content-Type: application/json' \
  -d '{"offer": "<clink_offer_string_noffer1...>", "amount_msats": 123000}'
```

### 3. NIP-05 Verification Endpoint (`GET /.well-known/nostr.json?name=<username>`)
Provides NIP-05 verification. If the alias `username` has a `nostrPubkey` in `config.json`, it returns a JSON object including:
- `names`: Standard NIP-05 name-to-pubkey mapping.
- `relays`: Optional, if configured for the alias.
- `clink_offer`: Optional, the CLINK Offer string for the alias, if configured.
- `clink_debit`: Optional, the CLINK Debit string for the alias, if configured.

**Example NIP-05 Query & Response (for `your_alias` configured with all fields):**

Query:
`curl "https://your-domain.com/.well-known/nostr.json?name=your_alias"`

Response:
```json
{
  "names": {
    "your_alias": "your_nostr_public_key_hex"
  },
  "relays": {
    "your_nostr_public_key_hex": ["wss://relay.damus.io", "wss://nos.lol"]
  },
  "clink_offer": "your_clink_offer_string_noffer1...",
  "clink_debit": "your_clink_debit_string_ndebit1..."
}
```
(The `relays`, `clink_offer`, and `clink_debit` fields are only present if configured for the alias. `nostrPubkey` is required for NIP-05 functionality itself.)

### License 

You're encouraged to fork this project and add your own authentication, admin routes, a proper database etc. 