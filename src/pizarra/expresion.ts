// Evaluador de funciones f(x) sin usar eval: convierte el texto en una función segura.
// Admite + - * / ^, paréntesis, multiplicación implícita (2x, 3(x+1), x sen(x)),
// coma o punto decimal, pi, e, y las funciones de la lista.

const FUNCIONES: Record<string, (v: number) => number> = {
  sen: Math.sin, sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asen: Math.asin, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  raiz: Math.sqrt, sqrt: Math.sqrt, abs: Math.abs,
  ln: Math.log, log: Math.log10, exp: Math.exp,
};
const CONSTANTES: Record<string, number> = { pi: Math.PI, "π": Math.PI, e: Math.E };

type Nodo = (x: number) => number;

export function compilar(texto: string): Nodo {
  const s = texto.toLowerCase().replace(/\s+/g, "").replace(/,/g, ".").replace(/[×·]/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/²/g, "^2").replace(/³/g, "^3").replace(/√/g, "raiz");
  if (!s) throw new Error("Escribe una función");
  if (s.length > 120) throw new Error("La función es demasiado larga");
  let i = 0;

  const error = (): never => {
    throw new Error(i >= s.length ? "La función está incompleta" : `No entiendo «${s[i]}» en la posición ${i + 1}`);
  };

  function suma(): Nodo {
    let izq = producto();
    while (s[i] === "+" || s[i] === "-") {
      const op = s[i++];
      const a = izq, b = producto();
      izq = op === "+" ? (x) => a(x) + b(x) : (x) => a(x) - b(x);
    }
    return izq;
  }

  function empiezaFactor(): boolean {
    return i < s.length && /[0-9.(a-zπ]/.test(s[i]);
  }

  function producto(): Nodo {
    let izq = signo();
    for (;;) {
      if (s[i] === "*" || s[i] === "/") {
        const op = s[i++];
        const a = izq, b = signo();
        izq = op === "*" ? (x) => a(x) * b(x) : (x) => a(x) / b(x);
      } else if (empiezaFactor()) {
        const a = izq, b = potencia(); // multiplicación implícita
        izq = (x) => a(x) * b(x);
      } else {
        return izq;
      }
    }
  }

  function signo(): Nodo {
    if (s[i] === "-") {
      i++;
      const a = signo();
      return (x) => -a(x);
    }
    if (s[i] === "+") {
      i++;
      return signo();
    }
    return potencia();
  }

  function potencia(): Nodo {
    const base = atomo();
    if (s[i] === "^") {
      i++;
      const exp = signo(); // asociativa a la derecha y admite exponente negativo
      return (x) => Math.pow(base(x), exp(x));
    }
    return base;
  }

  function atomo(): Nodo {
    if (s[i] === "(") {
      i++;
      const dentro = suma();
      if (s[i] !== ")") error();
      i++;
      return dentro;
    }
    const num = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
    if (num) {
      i += num[0].length;
      const v = parseFloat(num[0]);
      return () => v;
    }
    const palabra = /^[a-zπ]+/.exec(s.slice(i));
    if (palabra) {
      // Se busca el nombre conocido más largo al inicio: "xsen(x)" es x·sen(x).
      const nombres = [...Object.keys(FUNCIONES), ...Object.keys(CONSTANTES), "x"].sort((a, b) => b.length - a.length);
      const nombre = nombres.find((n) => palabra[0].startsWith(n));
      if (!nombre) error();
      i += nombre!.length;
      if (nombre === "x") return (x) => x;
      if (nombre! in FUNCIONES) {
        const f = FUNCIONES[nombre!];
        if (s[i] !== "(") error();
        const arg = atomo();
        return (x) => f(arg(x));
      }
      const c = CONSTANTES[nombre!];
      return () => c;
    }
    return error();
  }

  const f = suma();
  if (i < s.length) error();
  return f;
}
