import { useEffect, useMemo, useRef, useState, type PointerEvent as EventoPuntero, type ReactNode } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import "./pizarra.css";
import type { AlmacenPizarra } from "./estado";
import { compilar } from "./expresion";
import {
  ALTO, ANCHO, COLORES, ORIGEN, UNIDAD, idNuevo, mover,
  type Elemento, type Fondo, type Texto,
} from "./tipos";

type Herramienta =
  | "mover" | "laser" | "lapiz" | "resaltador" | "borrador"
  | "linea" | "flecha" | "rect" | "elipse" | "tri"
  | "regla" | "escuadra" | "compas" | "texto" | "ecu";

const HERRAMIENTAS: { id: Herramienta; icono: string; nombre: string; grupo: number }[] = [
  { id: "mover", icono: "✥", nombre: "Seleccionar y mover", grupo: 0 },
  { id: "laser", icono: "◉", nombre: "Puntero láser", grupo: 0 },
  { id: "lapiz", icono: "✎", nombre: "Lápiz", grupo: 1 },
  { id: "resaltador", icono: "▰", nombre: "Resaltador", grupo: 1 },
  { id: "borrador", icono: "⌫", nombre: "Borrador", grupo: 1 },
  { id: "linea", icono: "╱", nombre: "Línea", grupo: 2 },
  { id: "flecha", icono: "➚", nombre: "Flecha", grupo: 2 },
  { id: "rect", icono: "▭", nombre: "Rectángulo", grupo: 2 },
  { id: "elipse", icono: "◯", nombre: "Círculo o elipse", grupo: 2 },
  { id: "tri", icono: "△", nombre: "Triángulo", grupo: 2 },
  { id: "regla", icono: "📏", nombre: "Regla: segmento con medida", grupo: 3 },
  { id: "escuadra", icono: "📐", nombre: "Escuadra: triángulo rectángulo con medidas", grupo: 3 },
  { id: "compas", icono: "⊙", nombre: "Compás: circunferencia con radio", grupo: 3 },
  { id: "texto", icono: "T", nombre: "Texto", grupo: 4 },
  { id: "ecu", icono: "∑", nombre: "Ecuación matemática", grupo: 4 },
];

const GROSORES = [2, 4, 8];
const MAX_PUNTOS = 300;
const PLANTILLAS: [string, string][] = [
  ["a/b", "\\frac{a}{b}"], ["x²", "x^{2}"], ["xₙ", "x_{n}"], ["√", "\\sqrt{x}"], ["π", "\\pi"],
  ["±", "\\pm"], ["≤", "\\le"], ["≥", "\\ge"], ["≠", "\\neq"], ["×", "\\times"], ["÷", "\\div"],
  ["∞", "\\infty"], ["∫", "\\int_{a}^{b}"], ["Σ", "\\sum_{i=1}^{n}"], ["lím", "\\lim_{x \\to 0}"], ["°", "^{\\circ}"],
];

const u = (px: number) => (px / UNIDAD).toFixed(1).replace(/\.0$/, "");
const tamTexto = (w: number) => 20 + w * 5;

function mates(s: string): string {
  return katex.renderToString(s, { throwOnError: false, displayMode: true, trust: false, strict: "ignore", maxExpand: 200 });
}

// ---------- dibujo de cada elemento ----------
function rutaTrazo(p: number[]): string {
  if (p.length < 4) return `M${p[0]} ${p[1]}l0.1 0`;
  let d = `M${p[0]} ${p[1]}`;
  for (let i = 2; i < p.length - 2; i += 2) {
    d += `Q${p[i]} ${p[i + 1]} ${(p[i] + p[i + 2]) / 2} ${(p[i + 1] + p[i + 3]) / 2}`;
  }
  return d + `L${p[p.length - 2]} ${p[p.length - 1]}`;
}

function rutaFuncion(expr: string): string {
  let f: (x: number) => number;
  try {
    f = compilar(expr);
  } catch {
    return "";
  }
  const limite = ALTO * 2;
  let d = "", trazando = false, yPrev = 0;
  for (let px = 0; px <= ANCHO; px += 2) {
    const y = ORIGEN.y - f((px - ORIGEN.x) / UNIDAD) * UNIDAD;
    // Se corta la curva en asíntotas y donde la función no existe.
    if (!Number.isFinite(y) || Math.abs(y - ORIGEN.y) > limite || (trazando && Math.abs(y - yPrev) > ALTO)) {
      trazando = false;
      continue;
    }
    d += `${trazando ? "L" : "M"}${px} ${y.toFixed(1)}`;
    trazando = true;
    yPrev = y;
  }
  return d;
}

function Etiqueta({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <text x={x} y={y} className="pz-medida" textAnchor="middle">{children}</text>
  );
}

function Dibujo({ el }: { el: Elemento }) {
  const trazo = { stroke: el.c, strokeWidth: el.w, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const toque = { stroke: "transparent", strokeWidth: Math.max(22, el.w + 14), fill: "none", pointerEvents: "stroke" as const };
  const rutaFx = useMemo(() => (el.t === "fx" ? rutaFuncion(el.s) : ""), [el.t, el.t === "fx" ? el.s : ""]);

  switch (el.t) {
    case "trazo": {
      const d = rutaTrazo(el.p);
      return <><path d={d} {...trazo} opacity={el.o} /><path d={d} {...toque} /></>;
    }
    case "linea": case "flecha": case "regla": {
      const { x1, y1, x2, y2 } = el;
      const largo = Math.hypot(x2 - x1, y2 - y1) || 1;
      const ux = (x2 - x1) / largo, uy = (y2 - y1) / largo;
      const extras: ReactNode[] = [];
      if (el.t === "flecha") {
        const t = 10 + el.w * 2.5;
        const bx = x2 - ux * t, by = y2 - uy * t;
        extras.push(<polygon key="p" points={`${x2},${y2} ${bx - uy * t * 0.5},${by + ux * t * 0.5} ${bx + uy * t * 0.5},${by - ux * t * 0.5}`} fill={el.c} />);
      }
      if (el.t === "regla") {
        // Marcas cada media unidad; las de unidad entera son más largas.
        for (let i = 0; i * (UNIDAD / 2) <= largo + 0.01 && i < 200; i++) {
          const px = x1 + ux * i * (UNIDAD / 2), py = y1 + uy * i * (UNIDAD / 2);
          const t = i % 2 === 0 ? 9 : 5;
          extras.push(<line key={i} x1={px} y1={py} x2={px - uy * t} y2={py + ux * t} stroke={el.c} strokeWidth={1.5} />);
        }
        const angulo = ((Math.atan2(-(y2 - y1), x2 - x1) * 180) / Math.PI + 360) % 360;
        extras.push(
          <Etiqueta key="e" x={(x1 + x2) / 2 + uy * 24} y={(y1 + y2) / 2 - ux * 24 + 6}>
            {u(largo)} u · {Math.round(angulo)}°
          </Etiqueta>,
        );
      }
      return <><line x1={x1} y1={y1} x2={x2} y2={y2} {...trazo} />{extras}<line x1={x1} y1={y1} x2={x2} y2={y2} {...toque} /></>;
    }
    case "rect": case "elipse": case "tri": case "escuadra": {
      const x = Math.min(el.x, el.x + el.an), y = Math.min(el.y, el.y + el.al);
      const an = Math.abs(el.an), al = Math.abs(el.al);
      const relleno = el.r ? el.c + "33" : "none";
      const estilo = { ...trazo, fill: relleno, pointerEvents: el.r ? ("all" as const) : ("stroke" as const) };
      if (el.t === "rect") return <><rect x={x} y={y} width={an} height={al} {...estilo} /><rect x={x} y={y} width={an} height={al} {...toque} /></>;
      if (el.t === "elipse") {
        const p = { cx: x + an / 2, cy: y + al / 2, rx: an / 2, ry: al / 2 };
        return <><ellipse {...p} {...estilo} /><ellipse {...p} {...toque} /></>;
      }
      if (el.t === "tri") {
        const pts = `${x + an / 2},${y} ${x},${y + al} ${x + an},${y + al}`;
        return <><polygon points={pts} {...estilo} /><polygon points={pts} {...toque} /></>;
      }
      // Escuadra: el ángulo recto queda donde empezó el arrastre en horizontal y terminó en vertical.
      const bx = el.x, by = el.y + el.al;
      const sx = Math.sign(el.an) || 1, sy = Math.sign(el.al) || 1;
      const pts = `${el.x},${el.y} ${bx},${by} ${el.x + el.an},${by}`;
      const m = 16;
      return (
        <>
          <polygon points={pts} {...estilo} />
          <polyline points={`${bx + sx * m},${by} ${bx + sx * m},${by - sy * m} ${bx},${by - sy * m}`} fill="none" stroke={el.c} strokeWidth={1.5} />
          <Etiqueta x={bx - sx * 30} y={el.y + el.al / 2 + 6}>{u(al)}</Etiqueta>
          <Etiqueta x={el.x + el.an / 2} y={by + (sy > 0 ? 24 : -12)}>{u(an)}</Etiqueta>
          <Etiqueta x={el.x + el.an / 2 + sx * 26} y={el.y + el.al / 2 - sy * 14 + 6}>{u(Math.hypot(an, al))}</Etiqueta>
          <polygon points={pts} {...toque} />
        </>
      );
    }
    case "compas":
      return (
        <>
          <circle cx={el.x} cy={el.y} r={el.r} {...trazo} />
          <line x1={el.x} y1={el.y} x2={el.x + el.r} y2={el.y} stroke={el.c} strokeWidth={1.5} strokeDasharray="6 5" />
          <circle cx={el.x} cy={el.y} r={3.5} fill={el.c} />
          <Etiqueta x={el.x + el.r / 2} y={el.y - 8}>r = {u(el.r)} u</Etiqueta>
          <circle cx={el.x} cy={el.y} r={el.r} {...toque} />
        </>
      );
    case "texto": {
      const tam = tamTexto(el.w);
      const lineas = el.s.split("\n");
      const ancho = Math.max(...lineas.map((l) => l.length)) * tam * 0.56;
      return (
        <>
          <rect x={el.x - 6} y={el.y - tam} width={ancho + 12} height={lineas.length * tam * 1.25 + 8} fill="transparent" />
          <text x={el.x} y={el.y} fontSize={tam} fill={el.c} className="pz-texto">
            {lineas.map((l, i) => <tspan key={i} x={el.x} dy={i === 0 ? 0 : tam * 1.25}>{l || " "}</tspan>)}
          </text>
        </>
      );
    }
    case "fx":
      return <><path d={rutaFx} {...trazo} /><path d={rutaFx} {...toque} /></>;
    default:
      return null;
  }
}

function FondoPizarra({ fondo }: { fondo: Fondo }) {
  const lineas = useMemo(() => {
    if (fondo === "blanco") return null;
    const partes: ReactNode[] = [];
    for (let x = 0; x <= ANCHO; x += UNIDAD) partes.push(<line key={"v" + x} x1={x} y1={0} x2={x} y2={ALTO} />);
    for (let y = 0; y <= ALTO; y += UNIDAD) partes.push(<line key={"h" + y} x1={0} y1={y} x2={ANCHO} y2={y} />);
    return partes;
  }, [fondo]);

  const ejes = useMemo(() => {
    if (fondo !== "plano") return null;
    const numeros: ReactNode[] = [];
    for (let n = -15; n <= 15; n++) {
      if (n === 0) continue;
      numeros.push(<text key={"x" + n} x={ORIGEN.x + n * UNIDAD} y={ORIGEN.y + 20} textAnchor="middle">{n}</text>);
      if (Math.abs(n) <= 8) numeros.push(<text key={"y" + n} x={ORIGEN.x - 8} y={ORIGEN.y - n * UNIDAD + 5} textAnchor="end">{n}</text>);
    }
    return (
      <g className="pz-ejes">
        <line x1={0} y1={ORIGEN.y} x2={ANCHO} y2={ORIGEN.y} />
        <line x1={ORIGEN.x} y1={0} x2={ORIGEN.x} y2={ALTO} />
        <polygon points={`${ANCHO},${ORIGEN.y} ${ANCHO - 14},${ORIGEN.y - 6} ${ANCHO - 14},${ORIGEN.y + 6}`} />
        <polygon points={`${ORIGEN.x},0 ${ORIGEN.x - 6},14 ${ORIGEN.x + 6},14`} />
        <text x={ANCHO - 12} y={ORIGEN.y - 12} textAnchor="end" className="pz-eje-nombre">x</text>
        <text x={ORIGEN.x + 14} y={22} className="pz-eje-nombre">y</text>
        <text x={ORIGEN.x - 8} y={ORIGEN.y + 20} textAnchor="end">0</text>
        {numeros}
      </g>
    );
  }, [fondo]);

  return (
    <g pointerEvents="none">
      <rect width={ANCHO} height={ALTO} fill="#ffffff" />
      <g className="pz-cuadricula">{lineas}</g>
      {ejes}
    </g>
  );
}

// ---------- componente principal ----------
type Dialogo = { tipo: "texto" | "ecu"; x: number; y: number } | { tipo: "fx" } | null;

export default function Pizarra({ almacen }: { almacen: AlmacenPizarra }) {
  const puedo = almacen.puedoDibujar;
  const anfitrion = almacen.soyAnfitrion;
  const yo = almacen.yo.identity;

  const [herramienta, setHerramienta] = useState<Herramienta>("lapiz");
  const [color, setColor] = useState(COLORES[0]);
  const [grosor, setGrosor] = useState(4);
  const [relleno, setRelleno] = useState(false);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [escala, setEscala] = useState(0.5);

  const lienzo = useRef<HTMLDivElement>(null);
  const gesto = useRef<{ el?: Elemento; x0: number; y0: number; ultimoEnvio: number; movido: boolean } | null>(null);

  useEffect(() => {
    const nodo = lienzo.current;
    if (!nodo) return;
    const medir = () => setEscala(nodo.clientWidth / ANCHO || 0.5);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(nodo);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (seleccion && !almacen.elementos.has(seleccion)) setSeleccion(null);
  });

  // Atajos de teclado (no se activan mientras se escribe en un campo).
  useEffect(() => {
    const alTeclear = (ev: KeyboardEvent) => {
      if ((ev.target as HTMLElement).closest("input, textarea")) return;
      if ((ev.key === "Delete" || ev.key === "Backspace") && seleccion) {
        almacen.quitar(seleccion);
        ev.preventDefault();
      } else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z") {
        almacen.deshacer();
        ev.preventDefault();
      }
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [almacen, seleccion]);

  function punto(ev: { clientX: number; clientY: number }) {
    const r = lienzo.current!.getBoundingClientRect();
    return {
      x: Math.round(((ev.clientX - r.left) / r.width) * ANCHO),
      y: Math.round(((ev.clientY - r.top) / r.height) * ALTO),
    };
  }

  function idBajo(ev: { clientX: number; clientY: number }): string | null {
    const nodo = document.elementFromPoint(ev.clientX, ev.clientY);
    return nodo?.closest<HTMLElement | SVGElement>("[data-id]")?.dataset.id ?? null;
  }

  function borrarBajo(ev: EventoPuntero) {
    const id = idBajo(ev);
    if (id) almacen.quitar(id);
  }

  function alBajar(ev: EventoPuntero<HTMLDivElement>) {
    if (!puedo || ev.button > 0) return;
    const { x, y } = punto(ev);
    ev.currentTarget.setPointerCapture(ev.pointerId);
    const base = { id: idNuevo(), a: yo, c: color, w: grosor };
    gesto.current = { x0: x, y0: y, ultimoEnvio: 0, movido: false };
    const g = gesto.current;

    switch (herramienta) {
      case "laser":
        almacen.puntero(x, y);
        break;
      case "borrador":
        borrarBajo(ev);
        break;
      case "mover": {
        const id = idBajo(ev);
        const el = id ? almacen.elementos.get(id) : undefined;
        setSeleccion(el && almacen.puedeEditar(el) ? el.id : null);
        if (el && almacen.puedeEditar(el)) g.el = el;
        break;
      }
      case "texto": case "ecu":
        gesto.current = null;
        setDialogo({ tipo: herramienta, x, y });
        break;
      case "lapiz":
        g.el = { ...base, t: "trazo", o: 1, p: [x, y] };
        break;
      case "resaltador":
        g.el = { ...base, t: "trazo", o: 0.35, w: grosor * 5, c: color === COLORES[0] ? COLORES[6] : color, p: [x, y] };
        break;
      case "linea": case "flecha": case "regla":
        g.el = { ...base, t: herramienta, x1: x, y1: y, x2: x, y2: y };
        break;
      case "rect": case "elipse": case "tri": case "escuadra":
        g.el = { ...base, t: herramienta, x, y, an: 0, al: 0, r: relleno };
        break;
      case "compas":
        g.el = { ...base, t: "compas", x, y, r: 0 };
        break;
    }
    if (g.el && herramienta !== "mover") almacen.poner(g.el, false);
  }

  function alMover(ev: EventoPuntero<HTMLDivElement>) {
    if (!puedo) return;
    const { x, y } = punto(ev);
    if (herramienta === "laser") {
      // Con ratón el puntero sigue al cursor; con el dedo, mientras se toca.
      if (ev.pointerType === "mouse" || gesto.current) almacen.puntero(x, y);
      return;
    }
    const g = gesto.current;
    if (!g) return;
    if (herramienta === "borrador") return borrarBajo(ev);
    if (!g.el) return;
    g.movido = true;
    let el = g.el;

    if (herramienta === "mover") {
      el = mover(el, x - g.x0, y - g.y0);
      g.x0 = x;
      g.y0 = y;
    } else if (el.t === "trazo") {
      const p = el.p;
      if (Math.hypot(x - p[p.length - 2], y - p[p.length - 1]) < 3) return;
      if (p.length >= MAX_PUNTOS * 2) {
        // Trazo muy largo: se cierra este tramo y se continúa en uno nuevo.
        almacen.poner(el, true);
        el = { ...el, id: idNuevo(), p: [p[p.length - 2], p[p.length - 1], x, y] };
        g.el = el;
        almacen.poner(el, false);
        g.ultimoEnvio = Date.now();
        return;
      }
      el = { ...el, p: [...p, x, y] };
    } else if (el.t === "linea" || el.t === "flecha") {
      el = { ...el, x2: x, y2: y };
    } else if (el.t === "regla") {
      // La regla se ajusta a ángulos de 15° y a décimas de unidad.
      const dx = x - el.x1, dy = y - el.y1;
      const paso = Math.PI / 12;
      const crudo = Math.atan2(dy, dx);
      const cerca = Math.round(crudo / paso) * paso;
      const ang = Math.abs(crudo - cerca) < 0.07 ? cerca : crudo;
      const largo = Math.round(Math.hypot(dx, dy) / (UNIDAD / 10)) * (UNIDAD / 10);
      el = { ...el, x2: Math.round(el.x1 + Math.cos(ang) * largo), y2: Math.round(el.y1 + Math.sin(ang) * largo) };
    } else if (el.t === "compas") {
      el = { ...el, r: Math.round(Math.hypot(x - el.x, y - el.y) / (UNIDAD / 10)) * (UNIDAD / 10) };
    } else if (el.t === "rect" || el.t === "elipse" || el.t === "tri" || el.t === "escuadra") {
      el = { ...el, an: x - el.x, al: y - el.y };
    }
    g.el = el;

    // Los demás ven el dibujo avanzar, con un máximo de unas 8 actualizaciones por segundo.
    const ahora = Date.now();
    if (ahora - g.ultimoEnvio > 120) {
      g.ultimoEnvio = ahora;
      almacen.poner(el, false);
    } else {
      almacen.ponerLocal(el);
    }
  }

  function alSoltar() {
    const g = gesto.current;
    gesto.current = null;
    if (!g?.el) return;
    const el = g.el;
    if (herramienta === "mover") {
      if (g.movido) almacen.poner(el, true);
      return;
    }
    const diminuto =
      (el.t === "linea" || el.t === "flecha" || el.t === "regla") ? Math.hypot(el.x2 - el.x1, el.y2 - el.y1) < 6
      : (el.t === "rect" || el.t === "elipse" || el.t === "tri" || el.t === "escuadra") ? Math.abs(el.an) < 6 || Math.abs(el.al) < 6
      : el.t === "compas" ? el.r < 6
      : false;
    if (diminuto) almacen.quitar(el.id);
    else almacen.poner(el, true);
  }

  const elementos = [...almacen.elementos.values()];
  const ecuaciones = elementos.filter((e): e is Texto => e.t === "ecu");
  const cursor = !puedo ? "default" : herramienta === "mover" ? "move" : herramienta === "laser" ? "none" : herramienta === "texto" || herramienta === "ecu" ? "text" : "crosshair";

  return (
    <div className="pz">
      {puedo ? (
        <div className="pz-barra">
          <div className="pz-fila">
            {HERRAMIENTAS.map((h, i) => (
              <button
                key={h.id}
                className={"pz-boton" + (h.id === herramienta ? " activo" : "") + (i > 0 && HERRAMIENTAS[i - 1].grupo !== h.grupo ? " separado" : "")}
                title={h.nombre}
                aria-label={h.nombre}
                aria-pressed={h.id === herramienta}
                onClick={() => { setHerramienta(h.id); setSeleccion(null); }}
              >
                {h.icono}
              </button>
            ))}
            <button className="pz-boton separado" title="Graficar una función" aria-label="Graficar una función" onClick={() => setDialogo({ tipo: "fx" })}>ƒ(x)</button>
          </div>
          <div className="pz-fila">
            {COLORES.map((c) => (
              <button key={c} className={"pz-color" + (c === color ? " activo" : "")} style={{ background: c }} aria-label={`Color ${c}`} aria-pressed={c === color} onClick={() => setColor(c)} />
            ))}
            {GROSORES.map((g, i) => (
              <button key={g} className={"pz-boton" + (g === grosor ? " activo" : "") + (i === 0 ? " separado" : "")} title={`Grosor ${i + 1}`} aria-label={`Grosor ${i + 1}`} aria-pressed={g === grosor} onClick={() => setGrosor(g)}>
                <span className="pz-punto" style={{ width: g + 4, height: g + 4 }} />
              </button>
            ))}
            <label className="pz-opcion separado"><input type="checkbox" checked={relleno} onChange={(e) => setRelleno(e.target.checked)} /> Relleno</label>
            <select className="pz-select" value={almacen.config.fondo} onChange={(e) => almacen.fondo(e.target.value as Fondo)} aria-label="Fondo de la pizarra">
              <option value="blanco">Fondo blanco</option>
              <option value="cuadricula">Cuadrícula</option>
              <option value="plano">Plano cartesiano</option>
            </select>
            <button className="pz-boton texto separado" onClick={() => almacen.deshacer()} title="Deshacer (Ctrl+Z)">Deshacer</button>
            {seleccion && <button className="pz-boton texto" onClick={() => almacen.quitar(seleccion)}>Borrar selección</button>}
            {anfitrion && (
              <>
                <button className="pz-boton texto" onClick={() => { if (window.confirm("¿Borrar toda la pizarra?")) almacen.limpiar(); }}>Limpiar todo</button>
                <label className="pz-opcion"><input type="checkbox" checked={almacen.config.todos} onChange={(e) => almacen.permitirATodos(e.target.checked)} /> Todos dibujan</label>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="pz-barra pz-aviso">Pizarra del anfitrión. Solo quien tiene permiso puede dibujar.</div>
      )}

      <div className="pz-marco">
        <div
          ref={lienzo}
          className="pz-lienzo"
          style={{ cursor }}
          onPointerDown={alBajar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerCancel={alSoltar}
        >
          <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="pz-svg">
            <FondoPizarra fondo={almacen.config.fondo} />
            {elementos.map((el) =>
              el.t === "ecu" ? null : (
                <g key={el.id} data-id={el.id} className={el.id === seleccion ? "pz-sel" : undefined}>
                  <Dibujo el={el} />
                </g>
              ),
            )}
            {[...almacen.punteros].map(([id, p]) => (
              <g key={id} className="pz-laser" style={{ transform: `translate(${p.x}px, ${p.y}px)` }} pointerEvents="none">
                <circle r={16} className="pz-laser-halo" />
                <circle r={6} className="pz-laser-centro" />
                {p.nombre && <text x={14} y={-12}>{p.nombre}</text>}
              </g>
            ))}
          </svg>

          {ecuaciones.map((el) => (
            <div
              key={el.id}
              data-id={el.id}
              className={"pz-ecu" + (el.id === seleccion ? " pz-sel" : "")}
              style={{ left: `${(el.x / ANCHO) * 100}%`, top: `${(el.y / ALTO) * 100}%`, fontSize: tamTexto(el.w) * escala, color: el.c }}
              dangerouslySetInnerHTML={{ __html: mates(el.s) }}
            />
          ))}

          {dialogo && (
            <Formulario
              dialogo={dialogo}
              alCancelar={() => setDialogo(null)}
              alAceptar={(texto) => {
                const base = { id: idNuevo(), a: yo, c: color, w: grosor };
                if (dialogo.tipo === "fx") {
                  if (almacen.config.fondo !== "plano") almacen.fondo("plano");
                  almacen.poner({ ...base, t: "fx", w: Math.max(3, grosor), c: color === COLORES[0] ? COLORES[2] : color, s: texto });
                } else {
                  almacen.poner({ ...base, t: dialogo.tipo, x: dialogo.x, y: dialogo.y, s: texto });
                }
                setDialogo(null);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Formulario({ dialogo, alAceptar, alCancelar }: { dialogo: NonNullable<Dialogo>; alAceptar: (t: string) => void; alCancelar: () => void }) {
  const [texto, setTexto] = useState("");
  const campo = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  useEffect(() => campo.current?.focus(), []);

  let fallo = "";
  if (dialogo.tipo === "fx" && texto.trim()) {
    try {
      compilar(texto);
    } catch (e) {
      fallo = (e as Error).message;
    }
  }
  const valido = texto.trim() !== "" && !fallo;

  function insertar(plantilla: string) {
    const c = campo.current;
    const i = c?.selectionStart ?? texto.length, f = c?.selectionEnd ?? texto.length;
    setTexto(texto.slice(0, i) + plantilla + texto.slice(f));
    requestAnimationFrame(() => {
      c?.focus();
      c?.setSelectionRange(i + plantilla.length, i + plantilla.length);
    });
  }

  return (
    <form
      className="pz-dialogo"
      onPointerDown={(e) => e.stopPropagation()}
      onSubmit={(e) => { e.preventDefault(); if (valido) alAceptar(texto.trim()); }}
      onKeyDown={(e) => { if (e.key === "Escape") alCancelar(); }}
    >
      {dialogo.tipo === "texto" && (
        <>
          <label htmlFor="pz-campo">Texto</label>
          <textarea id="pz-campo" ref={campo} rows={3} maxLength={600} value={texto} onChange={(e) => setTexto(e.target.value)} />
        </>
      )}
      {dialogo.tipo === "ecu" && (
        <>
          <label htmlFor="pz-campo">Ecuación</label>
          <div className="pz-plantillas">
            {PLANTILLAS.map(([rotulo, codigo]) => (
              <button type="button" key={codigo} onClick={() => insertar(codigo)}>{rotulo}</button>
            ))}
          </div>
          <input id="pz-campo" ref={campo} maxLength={600} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ejemplo: x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}" autoComplete="off" spellCheck={false} />
          <div className="pz-vista" dangerouslySetInnerHTML={{ __html: texto.trim() ? mates(texto) : '<span class="pz-vacio">Aquí verás la ecuación</span>' }} />
        </>
      )}
      {dialogo.tipo === "fx" && (
        <>
          <label htmlFor="pz-campo">Graficar f(x) =</label>
          <input id="pz-campo" ref={campo} maxLength={120} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ejemplo: x^2 - 4   o   2sen(x)" autoComplete="off" spellCheck={false} />
          <p className="pz-ayuda">{fallo || "Puedes usar + − * / ^, paréntesis, sen, cos, tan, raiz, abs, ln, log, pi y e."}</p>
        </>
      )}
      <div className="pz-dialogo-botones">
        <button type="button" className="boton chico" onClick={alCancelar}>Cancelar</button>
        <button type="submit" className="boton chico primario" disabled={!valido}>Agregar</button>
      </div>
    </form>
  );
}

