// La pizarra mide 1600 × 900 unidades lógicas en todos los dispositivos.
// En el plano cartesiano, 1 unidad matemática = 50 unidades lógicas, con el origen al centro.
export const ANCHO = 1600;
export const ALTO = 900;
export const UNIDAD = 50;
export const ORIGEN = { x: ANCHO / 2, y: ALTO / 2 };

type Base = { id: string; a: string; c: string; w: number };

export type Trazo = Base & { t: "trazo"; o: number; p: number[] };
export type Segmento = Base & { t: "linea" | "flecha" | "regla"; x1: number; y1: number; x2: number; y2: number };
export type Caja = Base & { t: "rect" | "elipse" | "tri" | "escuadra"; x: number; y: number; an: number; al: number; r: boolean };
export type Compas = Base & { t: "compas"; x: number; y: number; r: number };
export type Texto = Base & { t: "texto" | "ecu"; x: number; y: number; s: string };
export type Funcion = Base & { t: "fx"; s: string };
export type Elemento = Trazo | Segmento | Caja | Compas | Texto | Funcion;

export type Fondo = "blanco" | "cuadricula" | "plano";
export type Config = { abierta: boolean; todos: boolean; fondo: Fondo };

export const COLORES = ["#1b1f24", "#d92d20", "#1570ef", "#079455", "#e8590c", "#7a3ff2", "#f5b800"];

let contador = 0;
export function idNuevo(): string {
  return Date.now().toString(36) + (contador++).toString(36) + Math.random().toString(36).slice(2, 6);
}

export function mover(el: Elemento, dx: number, dy: number): Elemento {
  switch (el.t) {
    case "trazo":
      return { ...el, p: el.p.map((v, i) => Math.round(v + (i % 2 === 0 ? dx : dy))) };
    case "linea": case "flecha": case "regla":
      return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
    case "fx":
      return el; // la gráfica está atada al plano
    default:
      return { ...el, x: el.x + dx, y: el.y + dy };
  }
}

// ---------- validación de lo que llega por la red ----------
const num = (v: unknown, min = -5000, max = 5000): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

/** Devuelve el elemento limpio o null si no es válido. Nunca confía en datos ajenos. */
export function validar(dato: unknown, autor: string): Elemento | null {
  if (!dato || typeof dato !== "object") return null;
  const d = dato as Record<string, unknown>;
  if (typeof d.id !== "string" || d.id.length > 40) return null;
  if (typeof d.c !== "string" || !/^#[0-9a-f]{6}$/i.test(d.c)) return null;
  if (!num(d.w, 1, 60)) return null;
  const base = { id: d.id, a: autor, c: d.c, w: d.w };
  switch (d.t) {
    case "trazo":
      if (!Array.isArray(d.p) || d.p.length < 2 || d.p.length > 1400 || d.p.length % 2 || !d.p.every((v) => num(v))) return null;
      if (!num(d.o, 0.1, 1)) return null;
      return { ...base, t: "trazo", o: d.o, p: d.p as number[] };
    case "linea": case "flecha": case "regla":
      if (!num(d.x1) || !num(d.y1) || !num(d.x2) || !num(d.y2)) return null;
      return { ...base, t: d.t, x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2 };
    case "rect": case "elipse": case "tri": case "escuadra":
      if (!num(d.x) || !num(d.y) || !num(d.an) || !num(d.al)) return null;
      return { ...base, t: d.t, x: d.x, y: d.y, an: d.an, al: d.al, r: d.r === true };
    case "compas":
      if (!num(d.x) || !num(d.y) || !num(d.r, 0, 3000)) return null;
      return { ...base, t: "compas", x: d.x, y: d.y, r: d.r };
    case "texto": case "ecu":
      if (!num(d.x) || !num(d.y) || typeof d.s !== "string" || !d.s || d.s.length > 600) return null;
      return { ...base, t: d.t, x: d.x, y: d.y, s: d.s };
    case "fx":
      if (typeof d.s !== "string" || !d.s || d.s.length > 120) return null;
      return { ...base, t: "fx", s: d.s };
    default:
      return null;
  }
}
