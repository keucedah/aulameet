// Controles de la reunión: levantar la mano y acciones del anfitrión.
import { TokenVerifier, TrackSource } from "npm:livekit-server-sdk@2";
import {
  configurado, cors, error, json, LK_KEY, LK_SECRET, rolDe, servicio,
} from "../_shared/comun.ts";

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

  // El pase de LiveKit del usuario demuestra quién es y en qué sala está.
  let sala: string, yo: string;
  try {
    const datos = await new TokenVerifier(LK_KEY, LK_SECRET).verify(String(cuerpo.token ?? ""));
    sala = datos.video?.room ?? "";
    yo = datos.sub ?? "";
    if (!sala || !yo) throw new Error("pase incompleto");
  } catch {
    return error("Sesión inválida o vencida", 401);
  }

  const svc = servicio();
  const accion = String(cuerpo.accion ?? "");
  const objetivo = String(cuerpo.objetivo ?? "");

  try {
    // Debe seguir dentro de la sala (un expulsado conserva su pase, pero ya no está).
    const participante = await svc.getParticipant(sala, yo);

    if (accion === "mano") {
      await svc.updateParticipant(sala, yo, {
        attributes: { mano: cuerpo.valor ? String(Date.now()) : "" },
      });
      return json({ ok: true });
    }

    if (rolDe(participante.metadata) !== "anfitrion") {
      return error("Solo el anfitrión puede hacer esto", 403);
    }

    const silenciar = async (identidad: string) => {
      const p = await svc.getParticipant(sala, identidad);
      for (const t of p.tracks) {
        if (t.source === TrackSource.MICROPHONE && !t.muted) {
          await svc.mutePublishedTrack(sala, identidad, t.sid, true);
        }
      }
    };

    switch (accion) {
      case "silenciar":
        await silenciar(objetivo);
        break;
      case "silenciar_todos":
        for (const p of await svc.listParticipants(sala)) {
          if (p.identity !== yo) await silenciar(p.identity);
        }
        break;
      case "bajar_mano":
        await svc.updateParticipant(sala, objetivo, { attributes: { mano: "" } });
        break;
      case "anfitrion":
        await svc.updateParticipant(sala, objetivo, {
          metadata: JSON.stringify({ rol: cuerpo.valor === false ? "participante" : "anfitrion" }),
        });
        break;
      case "expulsar":
        if (objetivo === yo) return error("No puedes expulsarte");
        await svc.removeParticipant(sala, objetivo);
        break;
      case "bloquear":
        await svc.updateRoomMetadata(sala, JSON.stringify({ bloqueada: Boolean(cuerpo.valor) }));
        break;
      case "terminar":
        await svc.deleteRoom(sala);
        break;
      default:
        return error("Acción desconocida");
    }
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return error("No se pudo completar la acción", 502);
  }
});
