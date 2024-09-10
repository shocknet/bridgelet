import { serve } from "bun";
import { handleLnurlStaticIdentifier } from "./handlers/lnurlStaticIdentifier";
import { handleLnurlPayRequest } from "./handlers/lnurlpay";
import { handleNip69Offer } from "./handlers/nip69";
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
  "/nip69": (req, params, privateKey, config) => handleNip69Offer(req, privateKey, config),
};

const config = await getConfig();
const server = serve({
  async fetch(req) {
    const corsHeaders = cors(req);

    const url = new URL(req.url);
    const endpoint = Object.keys(lnurlEndpoints).find((path) => {
      const regex = new RegExp(path.replace(/:\w+/g, "\\w+"));
      return regex.test(url.pathname);
    });

    if (endpoint) {
      const params = extractParams(endpoint, url.pathname);
      const config = await getConfig();
      const response = await lnurlEndpoints[endpoint](req, params, privateKey, config);
      
      return new Response(response.body, {
        status: response.status,
        headers: { 
          ...corsHeaders, 
          ...response.headers,
          'Content-Type': 'application/json'
        }
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