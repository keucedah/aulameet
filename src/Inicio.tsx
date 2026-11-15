import { useState, type FormEvent } from "react";
import { apiConfigurada, CODIGO, guardar, llamar } from "./api";

export default function Inicio() {
  const [codigo, setCodigo] = useState("");
  const [creando, setCreando] = useState(false);
  const [aviso, setAviso] = useState("");

  async function crear() {
    setAviso("");
    setCreando(true);
    try {
      const r = await llamar<{ sala: string; clave: string }>("sala", { accion: "crear" });
      guardar("clave:" + r.sala, r.clave);
      location.hash = `#/sala/${r.sala}`;
    } catch (e) {
      setAviso((e as Error).message);
    } finally {
      setCreando(false);
    }
  }

  function unirse(ev: FormEvent) {
    ev.preventDefault();
    // Acepta el código solo o el enlace completo pegado.
    const texto = codigo.trim().toLowerCase();
    const hallado = texto.match(/[a-z]{3}-[a-z]{4}-[a-z]{3}/)?.[0] ?? texto;
    if (!CODIGO.test(hallado)) {
      setAviso("Ese código no es válido. Tiene la forma abc-defg-hij.");
      return;
    }
    location.hash = `#/sala/${hallado}`;
  }

  return (
    <main className="inicio">
      <header className="marca">
        <img src="./icono-192.png" alt="" width={40} height={40} />
        <span>AulaMeet</span>
      </header>

      <section className="inicio-caja">
        <h1>Videollamadas gratis, sin instalar nada</h1>
        <p className="tenue">
          Crea una reunión y comparte el enlace. Funciona en el navegador del celular y de la computadora.
        </p>

        <button className="boton primario grande" onClick={crear} disabled={creando}>
          {creando ? "Creando reunión…" : "Nueva reunión"}
        </button>

        <form className="unirse" onSubmit={unirse}>
          <label htmlFor="codigo">¿Te invitaron? Escribe el código o pega el enlace</label>
          <div className="fila">
            <input
              id="codigo"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="abc-defg-hij"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            <button className="boton" type="submit" disabled={!codigo.trim()}>Unirme</button>
          </div>
        </form>

        {aviso && <p className="aviso" role="alert">{aviso}</p>}
        {!apiConfigurada && (
          <p className="aviso" role="alert">
            Falta conectar el servidor: define VITE_API_URL (ver LEEME.md).
          </p>
        )}
      </section>
    </main>
  );
}
