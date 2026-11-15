// Crea salas y entrega los pases (tokens) para entrar a ellas.
import { AccessToken } from "npm:livekit-server-sdk@2";
import {
  claveAnfitrion, configurado, cors, error, iguales, json,
  LK_KEY, LK_SECRET, LK_URL, servicio,
} from "../_shared/comun.ts";

const LETRAS = "abcdefghijkmnpqrstuvwxyz";

function codigoNuevo(): string {
  const azar = crypto.getRandomValues(new Uint8Array(10));
  const c = Array.from(azar, (n) => LETRAS[n % LETRAS.length]).join("");
  return `${c.slice(0, 3)}-${c.slice(3, 7)}-${c.slice(7, 10)}`;
}

function limpiarNombre(n: unknown): string {
  return String(n ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 40);
}

async function pase(sala: string, nombre: string, anfitrion: boolean): Promise<string> {
  const at = new AccessToken(LK_KEY, LK_SECRET, {
    identity: crypto.randomUUID(),
    name: nombre,
    ttl: "6h",
    metadata: JSON.stringify({ rol: anfitrion ? "anfitrion" : "participante" }),
  });
  at.addGrant({
    room: sala,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    // Nadie puede cambiar su propio rol desde el navegador.
    canUpdateOwnMetadata: false,
  });
  return await at.toJwt();
}

async function crearSala(sala: string) {
  await servicio().createRoom({
    name: sala,
    emptyTimeout: 10 * 60, // la sala vacía se cierra a los 10 minutos
    maxParticipants: 100,
    metadata: JSON.stringify({ bloqueada: false }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return error("Método no permitido", 405);
  if (!configurado()) return error("Faltan las credenciales de LiveKit en el servidor", 500);

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await req.json();
  } catch {
    return error("Solicitud inválida");
  }

  try {
    if (cuerpo.accion === "crear") {
      // Solo reserva el código; quien tenga la clave entra como anfitrión.
      const sala = codigoNuevo();
      await crearSala(sala);
      return json({ sala, clave: await claveAnfitrion(sala) });
    }

    if (cuerpo.accion === "unir") {
      const nombre = limpiarNombre(cuerpo.nombre);
      if (!nombre) return error("Escribe tu nombre");
      const sala = String(cuerpo.sala ?? "").toLowerCase().trim();
      if (!/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(sala)) return error("Código de sala inválido");

      const clave = String(cuerpo.clave ?? "");
      const esAnfitrion = clave !== "" && iguales(clave, await claveAnfitrion(sala));

      const [existente] = await servicio().listRooms([sala]);
      if (!existente) {
        // El anfitrión puede reabrir su sala; los demás deben esperar.
        if (!esAnfitrion) return error("La reunión no ha comenzado o ya terminó", 404);
        await crearSala(sala);
      } else if (!esAnfitrion) {
        let bloqueada = false;
        try {
          bloqueada = Boolean(JSON.parse(existente.metadata || "{}").bloqueada);
        } catch { /* metadatos vacíos */ }
        if (bloqueada) return error("El anfitrión bloqueó la reunión", 403);
        if (existente.maxParticipants && existente.numParticipants >= existente.maxParticipants) {
          return error("La reunión está llena", 403);
        }
      }

      return json({ sala, token: await pase(sala, nombre, esAnfitrion), url: LK_URL });
    }

    return error("Acción desconocida");
  } catch (e) {
    console.error(e);
    return error("No se pudo contactar el servidor de video", 502);
  }
});
