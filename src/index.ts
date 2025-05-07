import { serve } from "bun";
import { handleLnurlStaticIdentifier } from "./handlers/lnurlStaticIdentifier";
import { handleLnurlPayRequest } from "./handlers/lnurlpay";
import { handleClinkOfferInvoiceRequest } from "./handlers/clinkProcessor";
import { handleNip05Verification } from "./handlers/nip05";
import { promises as fs } from 'fs';
import path from 'path';
import { generatePrivateKey } from './utils/keys';
import { cors } from "./utils/cors";

const CONFIG_PATH = path.join(process.cwd(), 'config.json');

// Generate a new private key on each start
const privateKey = generatePrivateKey();
console.log("Generated new private key for this session");

async function getConfig() {
  const configData = await fs.readFile(CONFIG_PATH, 'utf-8');
  const config = JSON.parse(configData);
  return {
    ...config,
    port: config.port || 3000 // Default to 3000 if not specified
  };
}

// Define the type for LNURL endpoints
type LnurlEndpoints = {
  [key: string]: (req: Request, params: Record<string, string>, privateKey: string, config: any) => Response | Promise<Response>;
};

// Define LNURL endpoints
const lnurlEndpoints: LnurlEndpoints = {
  "/.well-known/lnurlp/:username": (req, params, privateKey, config) => handleLnurlStaticIdentifier(req, params as { username: string }, privateKey, config),
  "/lnurlpay/:username": async (req, params, privateKey, config) => await handleLnurlPayRequest(req, params as { username: string }, privateKey, config),
  "/offer": (req, params, privateKey, config) => handleClinkOfferInvoiceRequest(req, privateKey, config),
};

const config = await getConfig();
const server = serve({
  async fetch(req) {
    const corsHeaders = cors(req);
    const url = new URL(req.url);

    // Handle OPTIONS requests for all API endpoints needing CORS
    if (req.method === "OPTIONS") {
      // Check if the path matches any of our CORS-enabled API endpoint patterns
      const isNip05Path = url.pathname === "/.well-known/nostr.json";
      const isLnurlpPath = /\/.well-known\/lnurlp\/.+/.test(url.pathname);
      const isLnurlpayPath = /\/lnurlpay\/.+/.test(url.pathname);
      const isOfferPath = url.pathname === "/offer";

      if (isNip05Path || isLnurlpPath || isLnurlpayPath || isOfferPath) {
        return new Response(null, {
          status: 204, // No Content
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS", // Allow GET/POST for the actual requests
            "Access-Control-Allow-Headers": "Content-Type, Accept, Origin, Authorization", // Include Authorization if needed later
            "Access-Control-Max-Age": "86400", // 24 hours
            "Vary": "Origin"
          }
        });
      } else {
        // If OPTIONS request doesn't match known API paths, return a simple default response or 404
        return new Response(null, { status: 404 });
      }
    }

    // Handle NIP-05 GET requests
    if (url.pathname === "/.well-known/nostr.json" && req.method === "GET") {
      const currentConfig = await getConfig();
      const nip05Response = await handleNip05Verification(req, currentConfig);
      
      const combinedHeaders: Record<string, string> = { 
        ...(corsHeaders as Record<string, string>), 
      };
      if (nip05Response.headers) {
        if (nip05Response.headers instanceof Headers) {
          nip05Response.headers.forEach((value, key) => {
            combinedHeaders[key] = value;
          });
        } else {
          Object.assign(combinedHeaders, nip05Response.headers as Record<string, string>);
        }
      }
      if (!combinedHeaders['Content-Type']) {
        combinedHeaders['Content-Type'] = 'application/json';
      }
      if (!combinedHeaders['Access-Control-Allow-Origin']) {
          combinedHeaders['Access-Control-Allow-Origin'] = '*';
      }
      return new Response(nip05Response.body, {
        status: nip05Response.status,
        headers: combinedHeaders 
      });
    }

    // Handle LNURL and /offer endpoints (GET/POST)
    const endpoint = Object.keys(lnurlEndpoints).find((path) => {
      // Use a regex that matches the full path for dynamic routes
      const regex = new RegExp(`^${path.replace(/:\w+/g, "([^/]+)")}$`);
      return regex.test(url.pathname);
    });

    if (endpoint) {
      const params = extractParams(endpoint, url.pathname);
      const currentConfig = await getConfig();
      const response = await lnurlEndpoints[endpoint](req, params, privateKey, currentConfig);
      
      // Ensure CORS headers are on the actual response for these endpoints too
      const responseHeaders: Record<string, string> = { 
         ...(corsHeaders as Record<string, string>),
      };
      if (response.headers) {
         if (response.headers instanceof Headers) {
            response.headers.forEach((value, key) => {
               responseHeaders[key] = value;
            });
         } else {
            Object.assign(responseHeaders, response.headers as Record<string, string>);
         }
      }
       if (!responseHeaders['Access-Control-Allow-Origin']) {
           responseHeaders['Access-Control-Allow-Origin'] = '*'; // Allow all origins
       }
       if (!responseHeaders['Content-Type']) {
            responseHeaders['Content-Type'] = 'application/json'; // Default to JSON
       }

      return new Response(response.body, {
        status: response.status,
        headers: responseHeaders
      });
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  },
  port: config.port,
});

console.log(`LNURL server running on http://localhost:${config.port}`);

// Helper function to extract params from URL
function extractParams(endpoint: string, pathname: string) {
  const keys = endpoint.match(/:\w+/g) || [];
  const values = pathname.match(new RegExp(endpoint.replace(/:\w+/g, "(\\w+)"))) || [];
  return keys.reduce((params, key, index) => {
    params[key.substring(1)] = values[index + 1];
    return params;
  }, {} as Record<string, string>);
}