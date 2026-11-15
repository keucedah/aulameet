import { lazy, Suspense, useEffect, useState } from "react";
import Inicio from "./Inicio";
import { CODIGO } from "./api";

// La sala (y todo el motor de video) se descarga solo al entrar a una reunión.
const Reunion = lazy(() => import("./Reunion"));

function salaDelEnlace(): string | null {
  const m = location.hash.match(/^#\/sala\/([a-z-]+)/i);
  const codigo = m?.[1].toLowerCase() ?? "";
  return CODIGO.test(codigo) ? codigo : null;
}

export default function App() {
  const [sala, setSala] = useState(salaDelEnlace);

  useEffect(() => {
    const alCambiar = () => setSala(salaDelEnlace());
    window.addEventListener("hashchange", alCambiar);
    return () => window.removeEventListener("hashchange", alCambiar);
  }, []);

  if (!sala) return <Inicio />;
  return (
    <Suspense fallback={<div className="centro"><p className="tenue">Cargando…</p></div>}>
      <Reunion key={sala} sala={sala} />
    </Suspense>
  );
}
