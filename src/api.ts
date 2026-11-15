const API = String(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export const apiConfigurada = API !== "";

export async function llamar<T>(funcion: "sala" | "moderar", cuerpo: object): Promise<T> {
  if (!apiConfigurada) throw new Error("La aplicación no está conectada al servidor (falta VITE_API_URL).");
  let resp: Response;
  try {
    resp = await fetch(`${API}/${funcion}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
  } catch {
    throw new Error("Sin conexión con el servidor. Revisa tu internet.");
  }
  const datos = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(datos.error ?? "Ocurrió un error inesperado.");
  return datos as T;
}

// Preferencias guardadas en el dispositivo. Si el almacenamiento falla, se ignora.
export function leer(clave: string): string {
  try {
    return localStorage.getItem("aulameet:" + clave) ?? "";
  } catch {
    return "";
  }
}

export function guardar(clave: string, valor: string) {
  try {
    localStorage.setItem("aulameet:" + clave, valor);
  } catch { /* modo privado */ }
}

export function enlaceDeSala(sala: string): string {
  return `${location.origin}${location.pathname}#/sala/${sala}`;
}

export const CODIGO = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;
