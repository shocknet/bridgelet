export function cors(req: Request): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, Origin, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}