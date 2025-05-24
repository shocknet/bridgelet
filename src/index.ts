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
  try {
    const configData = await fs.readFile(CONFIG_PATH, 'utf-8');
    const config = JSON.parse(configData);
    return {
      ...config,
      port: config.port || 3000 // Default to 3000 if not specified
    };
  } catch (error) {
    console.error(`FATAL: Error reading or parsing config file at ${CONFIG_PATH}:`, error);
    process.exit(1); 
  }
}

// Define the type for API endpoint handlers
type ApiHandler = (req: Request, params: Record<string, string>, privateKey: string, config: any) => Response | Promise<Response>;

// Define API endpoint routes and handlers
// Note: Using more specific regex might be needed if paths could ambiguously overlap
const apiEndpoints: Record<string, ApiHandler> = {
  // Order matters if regexes could overlap; place more specific ones first
  "^/\.well-known/nostr\.json$": handleNip05Verification, // NIP-05 (needs query param handling inside)
  "^/offer$": handleClinkOfferInvoiceRequest,              // Direct CLINK Offer processing
  "^/\.well-known/lnurlp/(?<username>[^/]+)$": handleLnurlStaticIdentifier, // LNURL-P step 1
  "^/lnurlpay/(?<username>[^/]+)$": handleLnurlPayRequest,               // LNURL-P step 2 (callback)
};

// Helper function to extract params from URL based on regex groups
// This function might be simplified or removed if direct extraction in the loop is preferred
function extractParams(pattern: string, pathname: string): Record<string, string> {
    const regex = new RegExp(pattern); 
    const match = regex.exec(pathname); // Use exec to get access to groups
    
    if (!match || !match.groups) return {};

    // Decode URI components for each parameter value
    const decodedParams: Record<string, string> = {};
    for (const key in match.groups) {
        if (Object.prototype.hasOwnProperty.call(match.groups, key) && match.groups[key] !== undefined) {
            decodedParams[key] = decodeURIComponent(match.groups[key]);
        }
    }
    return decodedParams;
}


const config = await getConfig(); // Get initial config for port

const server = serve({
  async fetch(req: Request): Promise<Response> { // Added return type promise
    // Get standard CORS headers for the response (includes ACAO, Allow-Methods etc.)
    const corsHeaders = cors(req); 
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Handle OPTIONS preflight requests for all API endpoints
    if (req.method === "OPTIONS") {
      let isApiPath = false;
      for (const pattern in apiEndpoints) {
         if (new RegExp(pattern).test(pathname)) {
           isApiPath = true;
           break;
         }
      }
       // Explicitly check NIP-05 path as it's not in apiEndpoints map structure above
       if (pathname === "/.well-known/nostr.json") {
         isApiPath = true;
       }


      if (isApiPath) {
        // Standard CORS preflight response
        return new Response(null, {
          status: 204, // No Content
          headers: {
            // Use specific origin from cors utility if needed, otherwise '*' is simpler for public API
            "Access-Control-Allow-Origin": "*", 
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Accept, Origin, Authorization", 
            "Access-Control-Max-Age": "86400", // 24 hours
            "Vary": "Origin" 
          }
        });
      } else {
        // OPTIONS request for an unknown/static path - Caddy should handle this,
        // but returning 404 is safe for the app.
        return new Response(null, { status: 404 });
      }
    }

    // Handle NIP-05 GET requests separately as it needs query params but not dynamic path params
     if (pathname === "/.well-known/nostr.json" && req.method === "GET") {
       const currentConfig = await getConfig();
       const nip05Response = await handleNip05Verification(req, currentConfig); // Pass full req for query params

       // Construct final headers: Start with CORS, add handler headers (like Content-Type)
       const finalHeaders = new Headers(corsHeaders as HeadersInit);
       const handlerHeaders = nip05Response.headers ? new Headers(nip05Response.headers as HeadersInit) : new Headers();

       finalHeaders.set('Content-Type', handlerHeaders.get('Content-Type') || 'application/json');
       handlerHeaders.forEach((value, key) => {
         if (key.toLowerCase() !== 'content-type' && !finalHeaders.has(key)) {
             finalHeaders.set(key, value);
         }
       });

       return new Response(nip05Response.body, {
         status: nip05Response.status,
         headers: finalHeaders
       });
     }


    // Handle LNURL and /offer endpoints (GET/POST) by iterating through defined API endpoints
    let handler: ApiHandler | undefined;
    let params: Record<string, string> = {};

    for (const pattern in apiEndpoints) {
        // Skip the NIP-05 handler here as it was handled above
        if (apiEndpoints[pattern] === handleNip05Verification) continue; 

        const regex = new RegExp(pattern);
        const match = regex.exec(pathname); // Use exec to get access to named groups

        if (match && match.groups) { // Check for match.groups
            handler = apiEndpoints[pattern];
            // Directly use named capture groups if they exist
            // Decode URI components for each parameter value
            const decodedParams: Record<string, string> = {};
            for (const key in match.groups) {
                if (Object.prototype.hasOwnProperty.call(match.groups, key) && match.groups[key] !== undefined) {
                    decodedParams[key] = decodeURIComponent(match.groups[key]);
                }
            }
            params = decodedParams;
            break; 
        } else if (match) { // Fallback for patterns without named groups (like /offer)
            handler = apiEndpoints[pattern];
            params = {}; // No named groups, so no params from path
            break;
        }
    }


    if (handler) {
      const currentConfig = await getConfig();
      const response = await handler(req, params, privateKey, currentConfig);

      // Construct final headers: Start with CORS, add handler headers (like Content-Type)
      const finalHeaders = new Headers(corsHeaders as HeadersInit);
      const handlerHeaders = response.headers ? new Headers(response.headers as HeadersInit) : new Headers();

      finalHeaders.set('Content-Type', handlerHeaders.get('Content-Type') || 'application/json');
      handlerHeaders.forEach((value, key) => {
        if (key.toLowerCase() !== 'content-type' && !finalHeaders.has(key)) {
            finalHeaders.set(key, value);
        }
      });

      return new Response(response.body, {
        status: response.status,
        headers: finalHeaders
      });
    }

    // If no API endpoint matched, return 404 from the application.
    // Caddy will handle serving static files if the request path doesn't hit the app backend.
    return new Response("Not Found by Bridgelet Application", { status: 404, headers: corsHeaders }); // Add CORS headers even to 404
  },
  port: config.port,
  error(error: Error) { // Basic error handler
    console.error("Unhandled error in fetch handler:", error);
    // Basic CORS headers for error responses too
    return new Response("Internal Server Error", { 
      status: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "text/plain"
      } 
    });
  },
});

console.log(`Bridgelet server running on http://localhost:${config.port}`);