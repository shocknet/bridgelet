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
    


   
   ```json
   {
     "domain": "your-domain.com",
     "port": 3000,
     "aliases": {
       "bob": {
         "nip69": "noffer1...",
         "nostrPubkey": "optional_pubkey"
       }
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

### 1. LNURL-pay Endpoint
```
GET /.well-known/lnurlp/:username
```
Initiates the LNURL-pay flow for a specific user. Returns a JSON object with payment details.

### 2. NIP-69 Offer Handling
```
POST /nip69
```
Handy utility for getting an invoice from any valid NIP-69 offer. Expects a JSON payload with `offer` and `amount` fields. Returns an invoice upon successful processing.

Example using curl:

```bash
curl -X POST \
  https://bridgelet.nip69.dev/nip69 \
  -H 'Content-Type: application/json' \
  -d '{"offer": "<offer1234>", "amount": 10000}'
```

### License 

You're encouraged to fork this project and add your own authentication, admin routes, a proper database etc. 