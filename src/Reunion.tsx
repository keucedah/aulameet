import { useMemo, useState } from "react";
import { LiveKitRoom, PreJoin, type LocalUserChoices } from "@livekit/components-react";
import { DisconnectReason, ScreenSharePresets, VideoPresets, type RoomOptions } from "livekit-client";
import { guardar, leer, llamar } from "./api";
import Sala from "./Sala";

type Sesion = { token: string; url: string; opciones: LocalUserChoices };

function volverAlInicio() {
  location.hash = "";
}

export default function Reunion({ sala }: { sala: string }) {
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [entrando, setEntrando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [final, setFinal] = useState("");

  async function entrar(opciones: LocalUserChoices) {
    setAviso("");
    setEntrando(true);
    try {
      const r = await llamar<{ token: string; url: string }>("sala", {
        accion: "unir",
        sala,
        nombre: opciones.username,
        clave: leer("clave:" + sala),
      });
      guardar("nombre", opciones.username);
      setSesion({ token: r.token, url: r.url, opciones });
    } catch (e) {
      setAviso((e as Error).message);
    } finally {
      setEntrando(false);
    }
  }

  const opcionesSala = useMemo<RoomOptions>(() => ({
    // Solo se recibe la calidad que cabe en cada recuadro y se pausa lo que no se ve.
    adaptiveStream: true,
    // Se deja de enviar la calidad que nadie está mirando.
    dynacast: true,
    disconnectOnPageLeave: true,
    videoCaptureDefaults: {
      deviceId: sesion?.opciones.videoDeviceId || undefined,
      resolution: VideoPresets.h720.resolution,
    },
    audioCaptureDefaults: {
      deviceId: sesion?.opciones.audioDeviceId || undefined,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    publishDefaults: {
      simulcast: true,
      videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
      screenShareEncoding: ScreenSharePresets.h1080fps15.encoding,
      dtx: true, // no envía audio durante el silencio
      red: true, // audio redundante para redes con pérdida
    },
  }), [sesion]);

  if (final) {
    return (
      <main className="centro">
        <div className="tarjeta">
          <h1>{final}</h1>
          <div className="fila centrada">
            <button className="boton" onClick={() => setFinal("")}>Volver a entrar</button>
            <button className="boton primario" onClick={volverAlInicio}>Ir al inicio</button>
          </div>
        </div>
      </main>
    );
  }

  if (!sesion) {
    return (
      <main className="centro" data-lk-theme="default">
        <div className="previa">
          <p className="tenue">Reunión <strong>{sala}</strong></p>
          <PreJoin
            defaults={{ username: leer("nombre"), videoEnabled: true, audioEnabled: true }}
            joinLabel={entrando ? "Entrando…" : "Entrar a la reunión"}
            micLabel="Micrófono"
            camLabel="Cámara"
            userLabel="Tu nombre"
            onValidate={(v) => v.username.trim().length > 0 && !entrando}
            onSubmit={entrar}
            onError={(e) => setAviso("No se pudo usar la cámara o el micrófono: " + e.message)}
          />
          {aviso && <p className="aviso" role="alert">{aviso}</p>}
          <button className="enlace" onClick={volverAlInicio}>Volver al inicio</button>
        </div>
      </main>
    );
  }

  return (
    <LiveKitRoom
      className="reunion"
      data-lk-theme="default"
      token={sesion.token}
      serverUrl={sesion.url}
      connect
      video={sesion.opciones.videoEnabled}
      audio={sesion.opciones.audioEnabled}
      options={opcionesSala}
      onDisconnected={(motivo) => {
        setSesion(null);
        if (motivo === DisconnectReason.PARTICIPANT_REMOVED) setFinal("El anfitrión te sacó de la reunión");
        else if (motivo === DisconnectReason.ROOM_DELETED) setFinal("El anfitrión terminó la reunión");
        else if (motivo === DisconnectReason.CLIENT_INITIATED) setFinal("Saliste de la reunión");
        else setFinal("Se perdió la conexión con la reunión");
      }}
      onError={(e) => {
        console.error(e);
        if (e.name === "ConnectionError") {
          setSesion(null);
          setFinal("No se pudo conectar con el servidor de video");
        }
      }}
    >
      <Sala sala={sala} token={sesion.token} />
    </LiveKitRoom>
  );
}
