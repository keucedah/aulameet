// Utilidades compartidas por las funciones de servidor.
import { RoomServiceClient } from "npm:livekit-server-sdk@2";

export const LK_URL = Deno.env.get("LIVEKIT_URL") ?? "";
export const LK_KEY = Deno.env.get("LIVEKIT_API_KEY") ?? "";
export const LK_SECRET = Deno.env.get("LIVEKIT_API_SECRET") ?? "";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(datos: unknown, estado = 200): Response {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

export function error(mensaje: string, estado = 400): Response {
  return json({ error: mensaje }, estado);
}

export function servicio(): RoomServiceClient {
  // La API REST usa https en lugar de wss.
  return new RoomServiceClient(LK_URL.replace(/^ws/, "http"), LK_KEY, LK_SECRET);
}

export function configurado(): boolean {
  return Boolean(LK_URL && LK_KEY && LK_SECRET);
}

/** Clave de anfitrión: HMAC del código de sala con el secreto del servidor. */
export async function claveAnfitrion(sala: string): Promise<string> {
  const enc = new TextEncoder();
  const llave = await crypto.subtle.importKey(
    "raw",
    enc.encode(LK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const firma = await crypto.subtle.sign("HMAC", llave, enc.encode("anfitrion:" + sala));
  return Array.from(new Uint8Array(firma).slice(0, 12))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Comparación en tiempo constante. */
export function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function rolDe(metadata: string | undefined): string {
  try {
    return JSON.parse(metadata || "{}").rol ?? "participante";
  } catch {
    return "participante";
  }
}
