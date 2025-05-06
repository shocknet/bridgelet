# Bridgelet

A minimalist LNURL-P and Lightning Address bridge that leverages [NIP-69](https://demo.nip69.dev) to fetch invoices from Lightning nodes that don't otherwise have the requisite networking. 

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
      "domain": "your-domain.com", // Your domain where bridgelet is hosted
      "port": 3000, // Port the server will listen on
      "aliases": {
        "your_alias": { // Example alias, will be usable as your_alias@your-domain.com
          "nostrPubkey": "your_nostr_public_key_hex", // Optional: Nostr public key (hex). Required for NIP-05. Also used for NIP-57 Zap Receipt signing if present.
          "relays": ["wss://relay.damus.io", "wss://nos.lol"], // Optional: List of relay URLs for NIP-05. Only used if nostrPubkey is also set.
          "clink_offer": "your_clink_offer_string_noffer1...", // Required for LNURL-P functionality. This is your CLINK Offer string (e.g., NIP-69 compatible 'noffer').
          "clink_debit": "your_clink_debit_string_ndebit1..."  // Optional: CLINK Debit string. If present, will be included in NIP-05 response for discovery.
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
Initiates the LNURL-P flow for a specific user. Returns a JSON object with payment details. This relies on the `clink_offer` configured for the alias.
If `nostrPubkey` is configured, it will be included in the response for NIP-57 Zap functionality.

### 2. CLINK Offer Invoice Request (`POST /clink/get-invoice-from-offer`)
This endpoint processes a CLINK Offer string and an amount to generate a BOLT11 invoice. It's used internally by the LNURL-P flow but can also be called directly.

**Request Body (JSON):**
```json
{
  "offer": "<clink_offer_string_noffer1...>",
  "amount": 10000 // amount in satoshis
}
```
Returns a JSON object containing the BOLT11 invoice (`pr`).

**Example using curl:**
```bash
cURL -X POST \
  https://your-domain.com/clink/get-invoice-from-offer \
  -H 'Content-Type: application/json' \
  -d '{"offer": "<clink_offer_string_noffer1...>", "amount": 10000}'
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