import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  CarouselLayout, DisconnectButton, FocusLayout, FocusLayoutContainer,
  GridLayout, LayoutContextProvider, MediaDeviceMenu, ParticipantTile, RoomAudioRenderer,
  TrackToggle, isTrackReference, useChat, useConnectionState, useDataChannel, useLocalParticipant, useParticipants,
  usePinnedTracks, useRoomContext, useRoomInfo, useTracks,
} from "@livekit/components-react";
import { ConnectionState, RoomEvent, Track, VideoPresets, type LocalVideoTrack, type Participant } from "livekit-client";
import {
  BackgroundProcessor, supportsBackgroundProcessors, type BackgroundProcessorWrapper,
} from "@livekit/track-processors";
import { enlaceDeSala, llamar } from "./api";
import { fondos, type Fondo } from "./fondos";
import { usePizarra } from "./pizarra/estado";

// La pizarra (y el motor de ecuaciones) se descarga la primera vez que se abre.
const Pizarra = lazy(() => import("./pizarra/Pizarra"));

// Con filtro activo la cámara baja a 360p y 20 cuadros: separar a la persona del fondo
// es lo más pesado de la app y a 720p traba los equipos modestos.
const CAMARA_CON_FILTRO = { resolution: { width: 640, height: 360, frameRate: 20 } };
const CAMARA_NORMAL = { resolution: VideoPresets.h720.resolution };
const LIMITE_MS = 45; // por encima de esto el filtro no alcanza ni 20 cuadros por segundo

type Panel = "chat" | "gente" | "fondos" | null;
type Flotante = { id: number; emoji: string; nombre: string; x: number };

const REACCIONES = ["👍", "👏", "😂", "❤️", "🎉", "🤔"];
const codificador = new TextEncoder();
const decodificador = new TextDecoder();

function esAnfitrion(p: Participant): boolean {
  try {
    return JSON.parse(p.metadata || "{}").rol === "anfitrion";
  } catch {
    return false;
  }
}

/** Vuelve a dibujar cuando cambian roles, manos levantadas o micrófonos. */
function useCambiosDeSala() {
  const sala = useRoomContext();
  const [, setN] = useState(0);
  useEffect(() => {
    const refrescar = () => setN((n) => n + 1);
    const eventos = [
      RoomEvent.ParticipantMetadataChanged, RoomEvent.ParticipantAttributesChanged,
      RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.RoomMetadataChanged,
    ] as const;
    eventos.forEach((e) => sala.on(e, refrescar));
    return () => eventos.forEach((e) => { sala.off(e, refrescar); });
  }, [sala]);
}

export default function Sala(props: { sala: string; token: string }) {
  return (
    <LayoutContextProvider>
      <Contenido {...props} />
    </LayoutContextProvider>
  );
}

function Contenido({ sala, token }: { sala: string; token: string }) {
  useCambiosDeSala();
  const participantes = useParticipants();
  const { localParticipant, cameraTrack } = useLocalParticipant();
  const { metadata } = useRoomInfo();
  const soyAnfitrion = esAnfitrion(localParticipant);
  const pizarra = usePizarra(useRoomContext());
  const [pizarraOculta, setPizarraOculta] = useState(false);
  const verPizarra = pizarra.config.abierta && !pizarraOculta;
  const manoArriba = Boolean(localParticipant.attributes?.mano);

  const conexion = useConnectionState();
  const estadoConexion =
    conexion === ConnectionState.Connecting ? "Conectando…"
    : conexion === ConnectionState.Reconnecting || conexion === ConnectionState.SignalReconnecting ? "Conexión inestable. Reconectando…"
    : "";

  const [panel, setPanel] = useState<Panel>(null);
  const [toast, setToast] = useState("");
  const [fondo, setFondo] = useState("ninguno");
  const [verReacciones, setVerReacciones] = useState(false);
  const [flotantes, setFlotantes] = useState<Flotante[]>([]);

  const bloqueada = useMemo(() => {
    try {
      return Boolean(JSON.parse(metadata || "{}").bloqueada);
    } catch {
      return false;
    }
  }, [metadata]);

  // ---------- avisos breves ----------
  const relojToast = useRef<number>(0);
  function avisar(texto: string) {
    setToast(texto);
    window.clearTimeout(relojToast.current);
    relojToast.current = window.setTimeout(() => setToast(""), 3500);
  }

  async function moderar(accion: string, extra: object = {}) {
    try {
      await llamar("moderar", { token, accion, ...extra });
    } catch (e) {
      avisar((e as Error).message);
    }
  }

  // ---------- video ----------
  const pistas = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  const fijadas = usePinnedTracks();
  const pantalla = pistas.find((p) => isTrackReference(p) && p.source === Track.Source.ScreenShare);
  const enfoque = fijadas[0] ?? pantalla;
  const resto = pistas.filter((p) => p !== enfoque);

  // ---------- manos levantadas ----------
  const manosVistas = useRef(new Set<string>());
  useEffect(() => {
    for (const p of participantes) {
      const arriba = Boolean(p.attributes?.mano);
      if (arriba && !manosVistas.current.has(p.identity)) {
        manosVistas.current.add(p.identity);
        if (!p.isLocal) avisar(`✋ ${p.name || "Alguien"} levantó la mano`);
      } else if (!arriba) {
        manosVistas.current.delete(p.identity);
      }
    }
  });

  // ---------- reacciones ----------
  function mostrarReaccion(emoji: string, nombre: string) {
    if (!REACCIONES.includes(emoji)) return;
    const id = Date.now() + Math.random();
    setFlotantes((f) => [...f.slice(-11), { id, emoji, nombre, x: 8 + Math.random() * 70 }]);
    window.setTimeout(() => setFlotantes((f) => f.filter((r) => r.id !== id)), 3000);
  }
  const { send: enviarDato } = useDataChannel("reaccion", (m) => {
    mostrarReaccion(decodificador.decode(m.payload), m.from?.name || "");
  });
  function reaccionar(emoji: string) {
    setVerReacciones(false);
    mostrarReaccion(emoji, "Tú");
    enviarDato(codificador.encode(emoji), { reliable: false }).catch(() => {});
  }

  // ---------- filtros y fondos ----------
  const procesador = useRef<BackgroundProcessorWrapper | null>(null);
  const pistaCamara = cameraTrack?.track as LocalVideoTrack | undefined;
  const hayFiltros = useMemo(() => supportsBackgroundProcessors(), []);

  const medidas = useRef({ suma: 0, n: 0 });

  useEffect(() => {
    if (!pistaCamara || !hayFiltros) return;
    const elegido = fondos().find((f) => f.id === fondo) ?? fondos()[0];
    let cancelado = false;
    (async () => {
      try {
        const activo = pistaCamara.getProcessor();
        if (elegido.opciones.mode === "disabled") {
          if (!activo) return;
          await pistaCamara.stopProcessor();
          procesador.current = null;
          await pistaCamara.restartTrack({ ...CAMARA_NORMAL, deviceId: await pistaCamara.getDeviceId() });
        } else if (procesador.current && activo === procesador.current) {
          await procesador.current.switchTo(elegido.opciones);
        } else {
          await pistaCamara.restartTrack({ ...CAMARA_CON_FILTRO, deviceId: await pistaCamara.getDeviceId() });
          medidas.current = { suma: 0, n: 0 };
          const nuevo = BackgroundProcessor({
            ...elegido.opciones,
            maxFps: 20,
            segmenterOptions: { delegate: "GPU" },
            // Si el equipo no da abasto, el filtro se apaga solo en vez de trabar la clase.
            onFrameProcessed: (e) => {
              const m = medidas.current;
              m.suma += e.processingTimeMs;
              if (++m.n < 90) return;
              const promedio = m.suma / m.n;
              medidas.current = { suma: 0, n: 0 };
              if (promedio > LIMITE_MS) {
                avisar("El filtro era muy pesado para este dispositivo y se desactivó");
                setFondo("ninguno");
              }
            },
          });
          await pistaCamara.setProcessor(nuevo);
          procesador.current = nuevo;
        }
      } catch (e) {
        console.error(e);
        if (!cancelado) {
          avisar("Este dispositivo no pudo aplicar el filtro");
          setFondo("ninguno");
        }
      }
    })();
    return () => { cancelado = true; };
  }, [fondo, pistaCamara, hayFiltros]);

  // ---------- chat ----------
  const { chatMessages, send: enviarChat, isSending } = useChat();
  const [leidos, setLeidos] = useState(0);
  const sinLeer = panel === "chat" ? 0 : Math.max(0, chatMessages.length - leidos);
  useEffect(() => {
    if (panel === "chat") setLeidos(chatMessages.length);
  }, [panel, chatMessages.length]);

  // ---------- pantalla encendida en el celular ----------
  useEffect(() => {
    let candado: WakeLockSentinel | undefined;
    const pedir = () => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock?.request("screen").then((c) => { candado = c; }).catch(() => {});
    };
    pedir();
    document.addEventListener("visibilitychange", pedir);
    return () => {
      document.removeEventListener("visibilitychange", pedir);
      candado?.release().catch(() => {});
    };
  }, []);

  async function invitar() {
    const url = enlaceDeSala(sala);
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title: "Reunión en AulaMeet", url });
      } else {
        await navigator.clipboard.writeText(url);
        avisar("Enlace copiado. Envíalo a quien quieras invitar.");
      }
    } catch { /* el usuario canceló */ }
  }

  const alternar = (p: Panel) => setPanel((actual) => (actual === p ? null : p));
  const puedeCompartir = typeof navigator.mediaDevices?.getDisplayMedia === "function";

  return (
    <div className="sala">
      <header className="sala-cabecera">
        <span className="sala-codigo">{sala}{bloqueada && " 🔒"}</span>
        <button className="boton chico" onClick={invitar}>Invitar</button>
      </header>

      <div className="sala-cuerpo">
        <div className="sala-video">
          {verPizarra ? (
            <FocusLayoutContainer>
              <CarouselLayout tracks={pistas}><ParticipantTile /></CarouselLayout>
              <Suspense fallback={<div className="centro tenue">Abriendo la pizarra…</div>}>
                <Pizarra almacen={pizarra} />
              </Suspense>
            </FocusLayoutContainer>
          ) : enfoque ? (
            <FocusLayoutContainer>
              <CarouselLayout tracks={resto}><ParticipantTile /></CarouselLayout>
              <FocusLayout trackRef={enfoque} />
            </FocusLayoutContainer>
          ) : (
            <GridLayout tracks={pistas}><ParticipantTile /></GridLayout>
          )}

          <div className="flotantes" aria-hidden="true">
            {flotantes.map((r) => (
              <span key={r.id} className="flotante" style={{ left: `${r.x}%` }}>
                {r.emoji}<small>{r.nombre}</small>
              </span>
            ))}
          </div>
          {(estadoConexion || toast) && <div className="toast" role="status">{estadoConexion || toast}</div>}
        </div>

        {panel && (
          <aside className="panel">
            <div className="panel-titulo">
              <h2>{panel === "chat" ? "Chat" : panel === "gente" ? `Participantes (${participantes.length})` : "Filtros y fondos"}</h2>
              <button className="boton chico" onClick={() => setPanel(null)} aria-label="Cerrar panel">✕</button>
            </div>

            {panel === "chat" && (
              <PanelChat
                mensajes={chatMessages.map((m) => ({
                  id: m.id, texto: m.message, nombre: m.from?.isLocal ? "Tú" : m.from?.name || "Invitado", hora: m.timestamp,
                }))}
                enviando={isSending}
                alEnviar={(t) => enviarChat(t).catch(() => avisar("No se pudo enviar el mensaje"))}
              />
            )}

            {panel === "gente" && (
              <div className="panel-cuerpo">
                {soyAnfitrion && (
                  <div className="acciones-anfitrion">
                    <button className="boton chico" onClick={() => moderar("silenciar_todos")}>Silenciar a todos</button>
                    <button className="boton chico" onClick={() => moderar("bloquear", { valor: !bloqueada })}>
                      {bloqueada ? "Desbloquear reunión" : "Bloquear reunión"}
                    </button>
                    <button
                      className="boton chico peligro"
                      onClick={() => { if (window.confirm("¿Terminar la reunión para todos?")) moderar("terminar"); }}
                    >
                      Terminar para todos
                    </button>
                  </div>
                )}
                <ul className="lista-gente">
                  {participantes.map((p) => (
                    <li key={p.identity}>
                      <div className="gente-nombre">
                        <span>{p.name || "Invitado"}{p.isLocal && " (tú)"}</span>
                        <small>
                          {esAnfitrion(p) && "Anfitrión · "}
                          {p.isMicrophoneEnabled ? "Micrófono encendido" : "Silenciado"}
                          {p.attributes?.mano && " · ✋"}
                        </small>
                      </div>
                      {soyAnfitrion && !p.isLocal && (
                        <div className="gente-acciones">
                          {p.isMicrophoneEnabled && (
                            <button className="boton chico" onClick={() => moderar("silenciar", { objetivo: p.identity })}>Silenciar</button>
                          )}
                          {p.attributes?.mano && (
                            <button className="boton chico" onClick={() => moderar("bajar_mano", { objetivo: p.identity })}>Bajar mano</button>
                          )}
                          <button
                            className="boton chico"
                            onClick={() => moderar("anfitrion", { objetivo: p.identity, valor: !esAnfitrion(p) })}
                          >
                            {esAnfitrion(p) ? "Quitar anfitrión" : "Hacer anfitrión"}
                          </button>
                          <button
                            className="boton chico peligro"
                            onClick={() => { if (window.confirm(`¿Sacar a ${p.name || "este participante"}?`)) moderar("expulsar", { objetivo: p.identity }); }}
                          >
                            Sacar
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {panel === "fondos" && (
              <div className="panel-cuerpo">
                {!hayFiltros ? (
                  <p className="tenue">Este navegador no admite filtros de video.</p>
                ) : !pistaCamara ? (
                  <p className="tenue">Enciende la cámara para usar los filtros.</p>
                ) : (
                  <div className="rejilla-fondos">
                    {fondos().map((f: Fondo) => (
                      <button
                        key={f.id}
                        className={"fondo" + (f.id === fondo ? " activo" : "")}
                        onClick={() => setFondo(f.id)}
                        aria-pressed={f.id === fondo}
                      >
                        <span className="fondo-muestra" style={{ background: f.muestra }} />
                        {f.nombre}
                      </button>
                    ))}
                  </div>
                )}
                <p className="tenue chico">Los filtros se procesan en tu dispositivo. En equipos lentos pueden trabar el video.</p>
              </div>
            )}
          </aside>
        )}
      </div>

      <footer className="barra">
        <div className="lk-button-group">
          <TrackToggle source={Track.Source.Microphone} onDeviceError={() => avisar("No se pudo usar el micrófono")}>
            <span className="rotulo">Micrófono</span>
          </TrackToggle>
          <div className="lk-button-group-menu"><MediaDeviceMenu kind="audioinput" /></div>
        </div>
        <div className="lk-button-group">
          <TrackToggle source={Track.Source.Camera} onDeviceError={() => avisar("No se pudo usar la cámara")}>
            <span className="rotulo">Cámara</span>
          </TrackToggle>
          <div className="lk-button-group-menu"><MediaDeviceMenu kind="videoinput" /></div>
        </div>
        {puedeCompartir ? (
          <TrackToggle
            source={Track.Source.ScreenShare}
            captureOptions={{ audio: true, selfBrowserSurface: "include" }}
            onDeviceError={() => avisar("No se pudo compartir la pantalla")}
            title="Compartir pantalla, ventana o pestaña"
          >
            <span className="rotulo">Compartir pantalla</span>
          </TrackToggle>
        ) : (
          <button
            className="lk-button"
            title="Compartir pantalla"
            onClick={() => avisar("Este navegador no permite compartir pantalla. Entra desde una computadora para hacerlo.")}
          >
            🖥️<span className="rotulo">Compartir pantalla</span>
          </button>
        )}
        {(soyAnfitrion || pizarra.config.abierta) && (
          <button
            className="lk-button"
            aria-pressed={verPizarra}
            title={soyAnfitrion ? "Abrir o cerrar la pizarra para todos" : "Mostrar u ocultar la pizarra"}
            onClick={() => {
              if (soyAnfitrion) {
                setPizarraOculta(false);
                pizarra.abrir(!pizarra.config.abierta);
              } else {
                setPizarraOculta((o) => !o);
              }
            }}
          >
            🖊️<span className="rotulo">Pizarra</span>
          </button>
        )}
        <button className="lk-button" aria-pressed={manoArriba} onClick={() => moderar("mano", { valor: !manoArriba })}>
          ✋<span className="rotulo">{manoArriba ? "Bajar mano" : "Mano"}</span>
        </button>
        <div className="reacciones">
          <button className="lk-button" aria-expanded={verReacciones} onClick={() => setVerReacciones((v) => !v)}>
            😀<span className="rotulo">Reaccionar</span>
          </button>
          {verReacciones && (
            <div className="reacciones-menu">
              {REACCIONES.map((e) => (
                <button key={e} onClick={() => reaccionar(e)} aria-label={`Reaccionar con ${e}`}>{e}</button>
              ))}
            </div>
          )}
        </div>
        <button className="lk-button" aria-pressed={panel === "fondos"} onClick={() => alternar("fondos")}>
          ✨<span className="rotulo">Filtros</span>
        </button>
        <button className="lk-button" aria-pressed={panel === "gente"} onClick={() => alternar("gente")}>
          👥<span className="rotulo">Gente</span><span className="contador">{participantes.length}</span>
        </button>
        <button className="lk-button" aria-pressed={panel === "chat"} onClick={() => alternar("chat")}>
          💬<span className="rotulo">Chat</span>{sinLeer > 0 && <span className="contador nuevo">{sinLeer}</span>}
        </button>
        <DisconnectButton>Salir</DisconnectButton>
      </footer>

      <RoomAudioRenderer />
    </div>
  );
}

type Mensaje = { id: string; texto: string; nombre: string; hora: number };

function PanelChat({ mensajes, enviando, alEnviar }: { mensajes: Mensaje[]; enviando: boolean; alEnviar: (t: string) => void }) {
  const [texto, setTexto] = useState("");
  const fin = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fin.current?.scrollIntoView({ block: "end" });
  }, [mensajes.length]);

  function enviar(ev: FormEvent) {
    ev.preventDefault();
    const t = texto.trim();
    if (!t) return;
    alEnviar(t);
    setTexto("");
  }

  return (
    <>
      <div className="panel-cuerpo chat-mensajes">
        {mensajes.length === 0 && <p className="tenue">Aún no hay mensajes.</p>}
        {mensajes.map((m) => (
          <div key={m.id} className="mensaje">
            <small>{m.nombre} · {new Date(m.hora).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
            <p>{m.texto}</p>
          </div>
        ))}
        <div ref={fin} />
      </div>
      <form className="chat-entrada" onSubmit={enviar}>
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe un mensaje" maxLength={1000} />
        <button className="boton primario" type="submit" disabled={enviando || !texto.trim()}>Enviar</button>
      </form>
    </>
  );
}
