import type { SwitchBackgroundProcessorOptions } from "@livekit/track-processors";

export type Fondo = { id: string; nombre: string; muestra: string; opciones: SwitchBackgroundProcessorOptions };

/** Los fondos virtuales se dibujan en el dispositivo: no hay imágenes que descargar. */
function degradado(colores: string[], decorar?: (c: CanvasRenderingContext2D, w: number, h: number) => void): string {
  const lienzo = document.createElement("canvas");
  lienzo.width = 1280;
  lienzo.height = 720;
  const c = lienzo.getContext("2d")!;
  const g = c.createLinearGradient(0, 0, 1280, 720);
  colores.forEach((color, i) => g.addColorStop(i / (colores.length - 1), color));
  c.fillStyle = g;
  c.fillRect(0, 0, 1280, 720);
  decorar?.(c, 1280, 720);
  return lienzo.toDataURL("image/jpeg", 0.85);
}

function pizarra(): string {
  return degradado(["#17402f", "#1f5540"], (c, w, h) => {
    c.strokeStyle = "#8b5a2b";
    c.lineWidth = 36;
    c.strokeRect(18, 18, w - 36, h - 36);
    c.strokeStyle = "rgba(255,255,255,0.10)";
    c.lineWidth = 3;
    for (let y = 150; y < h - 80; y += 110) {
      c.beginPath();
      c.moveTo(90, y);
      c.lineTo(w - 90, y);
      c.stroke();
    }
  });
}

let cache: Fondo[] | null = null;

export function fondos(): Fondo[] {
  if (cache) return cache;
  const imagen = (id: string, nombre: string, url: string): Fondo => ({
    id, nombre, muestra: `url(${url})`, opciones: { mode: "virtual-background", imagePath: url },
  });
  cache = [
    { id: "ninguno", nombre: "Sin filtro", muestra: "#2a3542", opciones: { mode: "disabled" } },
    { id: "suave", nombre: "Desenfoque suave", muestra: "linear-gradient(135deg,#5b6b7c,#8fa0b1)", opciones: { mode: "background-blur", blurRadius: 6 } },
    { id: "fuerte", nombre: "Desenfoque fuerte", muestra: "linear-gradient(135deg,#3d4a58,#6d7d8e)", opciones: { mode: "background-blur", blurRadius: 18 } },
    imagen("pizarra", "Pizarra", pizarra()),
    imagen("amanecer", "Amanecer", degradado(["#f6a35b", "#e8627a", "#5b4b9a"])),
    imagen("mar", "Mar", degradado(["#0b3b5c", "#1583a8", "#7fd6d0"])),
    imagen("oficina", "Gris neutro", degradado(["#d9dee4", "#aab4bf"])),
  ];
  return cache;
}
