// Estado compartido de la pizarra. Se sincroniza entre participantes por el canal de
// datos de LiveKit: no pasa por ningún servidor propio ni se guarda al terminar la reunión.
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { RoomEvent, type Participant, type RemoteParticipant, type Room } from "livekit-client";
import { validar, type Config, type Elemento, type Fondo } from "./tipos";

const TEMA = "pizarra";
const MAX_ELEMENTOS = 3000;
const MAX_BYTES = 12000;
const codificar = new TextEncoder();
const decodificar = new TextDecoder();

export type Puntero = { x: number; y: number; nombre: string; hasta: number };

type Mensaje =
  | { t: "poner"; el: Elemento; fin?: boolean }
  | { t: "quitar"; id: string }
  | { t: "limpiar" }
  | { t: "config"; config: Config }
  | { t: "puntero"; x: number; y: number }
  | { t: "pedir" }
  | { t: "estado"; config: Config; els: Elemento[] };

function esAnfitrion(p: Participant | undefined): boolean {
  try {
    return JSON.parse(p?.metadata || "{}").rol === "anfitrion";
  } catch {
    return false;
  }
}

export class AlmacenPizarra {
  elementos = new Map<string, Elemento>();
  config: Config = { abierta: false, todos: false, fondo: "blanco" };
  punteros = new Map<string, Puntero>();
  private version = 0;
  private oyentes = new Set<() => void>();
  private esperandoEstado = false;
  private propios: string[] = [];

  constructor(private sala: Room) {}

  // ---------- suscripción para React ----------
  suscribir = (f: () => void) => {
    this.oyentes.add(f);
    return () => { this.oyentes.delete(f); };
  };
  instantanea = () => this.version;
  private avisar() {
    this.version++;
    this.oyentes.forEach((f) => f());
  }

  // ---------- permisos ----------
  get yo() { return this.sala.localParticipant; }
  get soyAnfitrion() { return esAnfitrion(this.yo); }
  get puedoDibujar() { return this.soyAnfitrion || this.config.todos; }
  puedeEditar(el: Elemento) { return this.soyAnfitrion || (this.config.todos && el.a === this.yo.identity); }

  // ---------- red ----------
  private enviar(m: Mensaje, confiable = true, destino?: string) {
    const datos = codificar.encode(JSON.stringify(m));
    this.sala.localParticipant
      .publishData(datos, { reliable: confiable, topic: TEMA, destinationIdentities: destino ? [destino] : undefined })
      .catch(() => {});
  }

  conectar(): () => void {
    const alRecibir = (carga: Uint8Array, de?: RemoteParticipant, _k?: unknown, tema?: string) => {
      if (tema !== TEMA || !de) return;
      try {
        this.recibir(JSON.parse(decodificar.decode(carga)), de);
      } catch { /* mensaje dañado */ }
    };
    const pedir = () => {
      // Al entrar se pide la pizarra a quien lleve más tiempo en la reunión.
      if (this.sala.remoteParticipants.size === 0) return;
      this.esperandoEstado = true;
      this.enviar({ t: "pedir" });
      window.setTimeout(() => { this.esperandoEstado = false; }, 5000);
    };
    const alSalir = (p: RemoteParticipant) => {
      if (this.punteros.delete(p.identity)) this.avisar();
    };
    const refrescar = () => this.avisar(); // cambió quién es anfitrión

    this.sala.on(RoomEvent.DataReceived, alRecibir);
    this.sala.on(RoomEvent.Connected, pedir);
    this.sala.on(RoomEvent.ParticipantDisconnected, alSalir);
    this.sala.on(RoomEvent.ParticipantMetadataChanged, refrescar);
    if (this.sala.state === "connected") pedir();
    const limpieza = window.setInterval(() => this.vencerPunteros(), 500);
    return () => {
      this.sala.off(RoomEvent.DataReceived, alRecibir);
      this.sala.off(RoomEvent.Connected, pedir);
      this.sala.off(RoomEvent.ParticipantDisconnected, alSalir);
      this.sala.off(RoomEvent.ParticipantMetadataChanged, refrescar);
      window.clearInterval(limpieza);
    };
  }

  private vencerPunteros() {
    const ahora = Date.now();
    let cambio = false;
    for (const [id, p] of this.punteros) {
      if (p.hasta < ahora) {
        this.punteros.delete(id);
        cambio = true;
      }
    }
    if (cambio) this.avisar();
  }

  private configValida(c: unknown): Config | null {
    const d = c as Config;
    if (!d || typeof d.abierta !== "boolean" || typeof d.todos !== "boolean") return null;
    if (!["blanco", "cuadricula", "plano"].includes(d.fondo)) return null;
    return { abierta: d.abierta, todos: d.todos, fondo: d.fondo };
  }

  private recibir(m: Mensaje, de: RemoteParticipant) {
    const anfitrion = esAnfitrion(de);
    const dibuja = anfitrion || this.config.todos;

    switch (m.t) {
      case "poner": {
        if (!dibuja) return;
        const previo = this.elementos.get(String((m.el as Elemento)?.id));
        // Solo el anfitrión puede modificar lo que dibujó otra persona.
        const autor = previo && anfitrion ? previo.a : de.identity;
        if (previo && !anfitrion && previo.a !== de.identity) return;
        const el = validar(m.el, autor);
        if (!el || (!previo && this.elementos.size >= MAX_ELEMENTOS)) return;
        this.elementos.set(el.id, el);
        break;
      }
      case "quitar": {
        const el = this.elementos.get(m.id);
        if (!el || !dibuja || (!anfitrion && el.a !== de.identity)) return;
        this.elementos.delete(m.id);
        break;
      }
      case "limpiar":
        if (!anfitrion) return;
        this.elementos.clear();
        break;
      case "config": {
        const c = this.configValida(m.config);
        if (!c) return;
        if (anfitrion) this.config = c;
        else if (dibuja) this.config = { ...this.config, fondo: c.fondo }; // quien dibuja solo cambia el fondo
        else return;
        break;
      }
      case "puntero":
        if (!dibuja || typeof m.x !== "number" || typeof m.y !== "number") return;
        this.punteros.set(de.identity, { x: m.x, y: m.y, nombre: de.name || "", hasta: Date.now() + 1500 });
        break;
      case "pedir": {
        if (!this.config.abierta && this.elementos.size === 0) return;
        // Responde solo quien lleva más tiempo en la sala, para no duplicar envíos.
        const otros = [this.yo, ...this.sala.remoteParticipants.values()].filter((p) => p.identity !== de.identity);
        const tiempo = (p: Participant) => p.joinedAt?.getTime() ?? Infinity;
        const decano = otros.reduce((a, b) => (tiempo(b) < tiempo(a) || (tiempo(b) === tiempo(a) && b.identity < a.identity) ? b : a));
        if (decano.identity !== this.yo.identity) return;
        let lote: Elemento[] = [];
        let peso = 0;
        for (const el of this.elementos.values()) {
          const p = JSON.stringify(el).length;
          if (peso + p > MAX_BYTES && lote.length) {
            this.enviar({ t: "estado", config: this.config, els: lote }, true, de.identity);
            lote = [];
            peso = 0;
          }
          lote.push(el);
          peso += p;
        }
        this.enviar({ t: "estado", config: this.config, els: lote }, true, de.identity);
        return;
      }
      case "estado": {
        if (!this.esperandoEstado) return;
        const c = this.configValida(m.config);
        if (!c || !Array.isArray(m.els)) return;
        this.config = c;
        for (const crudo of m.els) {
          const el = validar(crudo, String((crudo as Elemento)?.a ?? "").slice(0, 80));
          if (el && this.elementos.size < MAX_ELEMENTOS) this.elementos.set(el.id, el);
        }
        break;
      }
      default:
        return;
    }
    this.avisar();
  }

  // ---------- acciones locales ----------
  /** Agrega o actualiza. `fin` = versión definitiva (false mientras se está dibujando). */
  poner(el: Elemento, fin = true) {
    if (!this.puedoDibujar) return;
    const nuevo = !this.elementos.has(el.id);
    if (nuevo && this.elementos.size >= MAX_ELEMENTOS) return;
    if (nuevo && el.a === this.yo.identity) this.propios.push(el.id);
    this.elementos.set(el.id, el);
    this.enviar({ t: "poner", el, fin });
    this.avisar();
  }

  /** Cambia el elemento solo en esta pantalla (mientras se arrastra). */
  ponerLocal(el: Elemento) {
    this.elementos.set(el.id, el);
    this.avisar();
  }

  quitar(id: string) {
    const el = this.elementos.get(id);
    if (!el || !this.puedeEditar(el)) return;
    this.elementos.delete(id);
    this.enviar({ t: "quitar", id });
    this.avisar();
  }

  deshacer() {
    while (this.propios.length) {
      const id = this.propios.pop()!;
      if (this.elementos.has(id)) {
        this.quitar(id);
        return;
      }
    }
  }

  limpiar() {
    if (!this.soyAnfitrion) return;
    this.elementos.clear();
    this.propios = [];
    this.enviar({ t: "limpiar" });
    this.avisar();
  }

  private cambiarConfig(c: Config) {
    this.config = c;
    this.enviar({ t: "config", config: c });
    this.avisar();
  }
  abrir(abierta: boolean) { if (this.soyAnfitrion) this.cambiarConfig({ ...this.config, abierta }); }
  permitirATodos(todos: boolean) { if (this.soyAnfitrion) this.cambiarConfig({ ...this.config, todos }); }
  fondo(fondo: Fondo) { if (this.puedoDibujar) this.cambiarConfig({ ...this.config, fondo }); }

  private ultimoPuntero = 0;
  puntero(x: number, y: number) {
    if (!this.puedoDibujar) return;
    const ahora = Date.now();
    this.punteros.set(this.yo.identity, { x, y, nombre: "", hasta: ahora + 1500 });
    this.avisar();
    if (ahora - this.ultimoPuntero < 45) return;
    this.ultimoPuntero = ahora;
    this.enviar({ t: "puntero", x: Math.round(x), y: Math.round(y) }, false);
  }
}

export function usePizarra(sala: Room): AlmacenPizarra {
  const almacen = useMemo(() => new AlmacenPizarra(sala), [sala]);
  useEffect(() => almacen.conectar(), [almacen]);
  useSyncExternalStore(almacen.suscribir, almacen.instantanea);
  return almacen;
}
