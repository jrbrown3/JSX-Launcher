/*
 * Runs inside the sandboxed page declared in manifest.json ("sandbox" key),
 * which is the only extension context where eval of transpiled code is allowed
 * under Manifest V3. The launcher page talks to us via postMessage.
 */
(() => {
  const HOOKS = [
    "useState", "useEffect", "useRef", "useMemo", "useCallback", "useContext",
    "useReducer", "useLayoutEffect", "useId", "useTransition", "useDeferredValue",
    "useSyncExternalStore", "useImperativeHandle", "useDebugValue",
  ];

  // Expose hooks + common React names as globals so bare `useState(...)` works.
  HOOKS.forEach((h) => { window[h] = React[h]; });
  window.Fragment = React.Fragment;
  window.createContext = React.createContext;
  window.forwardRef = React.forwardRef;
  window.memo = React.memo;

  let root = null;

  window.addEventListener("message", (e) => {
    const data = e.data;
    if (!data || data.type !== "render-jsx") return;
    render(String(data.source), data.name || "component.jsx");
  });

  function render(source, name) {
    const warnings = [];
    let code;

    // 1. Preprocess: strip module syntax that Babel-transpiled eval can't use.
    try {
      code = preprocess(source, warnings);
    } catch (err) {
      return fail("Preprocessing failed", err);
    }

    // 2. Transpile JSX -> JS.
    let js;
    try {
      js = Babel.transform(code, {
        presets: [["react", { runtime: "classic" }]],
        filename: name,
      }).code;
    } catch (err) {
      return fail("Babel could not transpile this file", err);
    }

    // 3. Evaluate and locate the component to mount.
    let Component;
    try {
      const factory = new Function(
        "React", "ReactDOM",
        `"use strict";\nlet __DEFAULT_EXPORT__;\nlet __NAMED_EXPORTS__ = {};\n${js}\nreturn { def: __DEFAULT_EXPORT__, named: __NAMED_EXPORTS__ };`
      );
      const result = factory(React, ReactDOM);
      Component = pickComponent(result);
    } catch (err) {
      return fail("Runtime error while evaluating the file", err);
    }

    if (!Component) {
      return fail(
        "No component found",
        new Error("Export a component with `export default MyComponent`, or define exactly one top-level component function.")
      );
    }

    // 4. Mount.
    try {
      const container = document.getElementById("root");
      if (root) root.unmount();
      root = ReactDOM.createRoot(container);
      root.render(React.createElement(ErrorBoundary, null, React.createElement(Component)));
      parent.postMessage({ type: "render-ok", warnings }, "*");
    } catch (err) {
      return fail("Failed to mount component", err);
    }
  }

  // ---- helpers ----

  function preprocess(src, warnings) {
    let out = src;

    // Strip BOM.
    out = out.replace(/^\uFEFF/, "");

    // Modules bundled in vendor/ and exposed as globals in this sandbox.
    // react / react-dom are dropped entirely (React, ReactDOM, hooks are globals).
    const MODULE_GLOBALS = { recharts: "Recharts", "prop-types": "PropTypes" };

    // Imports with a from-clause — handles MULTI-LINE named imports.
    // Matched lazily from "import" to the closing quote of the module name.
    out = out.replace(
      /(^|\n)([ \t]*)import\s+([\s\S]*?)\s*from\s*(['"])([^'"]+)\4[ \t]*;?/g,
      (full, lead, indent, clause, q, mod) => {
        const pad = newlinePad(full, lead); // keep line numbers stable for errors

        if (/^react(-dom)?(\/client)?$/.test(mod)) return lead + pad;

        const globalName = MODULE_GLOBALS[mod];
        if (globalName) return lead + indent + bindFromGlobal(clause, globalName) + pad;

        warnings.push(`Import of "${mod}" was skipped — that package isn't bundled. Referenced names will be undefined.`);
        return lead + pad;
      }
    );

    // Side-effect imports (e.g. import "./styles.css")
    out = out.replace(/(^|\n)[ \t]*import\s*(['"])([^'"]+)\2[ \t]*;?/g, (full, lead, q, mod) => {
      warnings.push(`Import of "${mod}" was skipped.`);
      return lead + newlinePad(full, lead);
    });

    // export default function Foo() {} -> function Foo() {}; __DEFAULT_EXPORT__ = Foo
    out = out.replace(
      /export\s+default\s+function\s+([A-Za-z_$][\w$]*)/,
      "function $1"
    );
    if (/function\s+([A-Za-z_$][\w$]*)/.test(src) && /export\s+default\s+function\s+[A-Za-z_$]/.test(src)) {
      const m = src.match(/export\s+default\s+function\s+([A-Za-z_$][\w$]*)/);
      if (m) out += `\n__DEFAULT_EXPORT__ = ${m[1]};`;
    }

    // export default <expression>;
    out = out.replace(/export\s+default\s+/, "__DEFAULT_EXPORT__ = ");

    // export const/function/class Foo -> keep declaration, record named export.
    const namedDecl = [];
    out = out.replace(/^\s*export\s+(const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm, (line, kind, id) => {
      namedDecl.push(id);
      return line.replace(/export\s+/, "");
    });
    if (namedDecl.length) {
      out += "\n" + namedDecl.map((id) => `__NAMED_EXPORTS__[${JSON.stringify(id)}] = ${id};`).join("\n");
    }
    // export { A, B }
    out = out.replace(/^\s*export\s*\{([^}]*)\}\s*;?\s*$/gm, (line, names) => {
      return names
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean)
        .map((n) => {
          const [local, exported] = n.split(/\s+as\s+/).map((s) => s.trim());
          return `__NAMED_EXPORTS__[${JSON.stringify(exported || local)}] = ${local};`;
        })
        .join("\n");
    });

    // Fallback: no default export at all -> try to auto-detect one component.
    if (!/__DEFAULT_EXPORT__\s*=/.test(out)) {
      const fns = [...src.matchAll(/(?:^|\n)\s*(?:function\s+([A-Z][\w$]*)|const\s+([A-Z][\w$]*)\s*=\s*(?:\([^)]*\)|[\w$]+)\s*=>)/g)]
        .map((m) => m[1] || m[2])
        .filter(Boolean);
      if (fns.length >= 1) {
        out += `\n__DEFAULT_EXPORT__ = ${fns[fns.length - 1]};`;
        if (fns.length > 1) {
          warnings.push(`No default export found. Auto-mounted "${fns[fns.length - 1]}" (last capitalized component defined).`);
        }
      }
    }

    return out;
  }

  // Preserve line count of a removed statement so Babel error line numbers
  // still point at the right place in the user's original file.
  function newlinePad(matched, lead) {
    const n = (matched.match(/\n/g) || []).length - (lead === "\n" ? 1 : 0);
    return "\n".repeat(Math.max(0, n));
  }

  // Turn an import clause into const bindings from a sandbox global.
  //   "Recharts"                       -> const Recharts = window.Recharts;
  //   "* as R"                          -> const R = window.Recharts;
  //   "{ LineChart, Line as L }"        -> const { LineChart, Line: L } = window.Recharts;
  //   "Recharts, { LineChart }"         -> both of the above
  function bindFromGlobal(clause, globalName) {
    const parts = [];
    let rest = clause.trim();

    const ns = rest.match(/^\*\s+as\s+([A-Za-z_$][\w$]*)/);
    if (ns) return `const ${ns[1]} = window.${globalName};`;

    const def = rest.match(/^([A-Za-z_$][\w$]*)\s*(,)?/);
    if (def && def[1] !== "{".charAt(0)) {
      if (!rest.startsWith("{")) {
        parts.push(`const ${def[1]} = window.${globalName};`);
        rest = rest.slice(def[0].length).trim();
      }
    }

    const named = rest.match(/\{([\s\S]*)\}/);
    if (named) {
      const inner = named[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s.replace(/\s+as\s+/, ": "))
        .join(", ");
      if (inner) parts.push(`const { ${inner} } = window.${globalName};`);
    }
    return parts.join(" ");
  }

  function pickComponent(result) {
    if (isRenderable(result.def)) return normalize(result.def);
    const named = Object.values(result.named || {}).filter(isRenderable);
    if (named.length === 1) return normalize(named[0]);
    return null;
  }

  function isRenderable(v) {
    return typeof v === "function" || (v && typeof v === "object" && (v.$$typeof || React.isValidElement(v)));
  }

  function normalize(v) {
    if (typeof v === "function") return v;
    if (React.isValidElement(v)) return () => v;      // exported an element
    return v;                                          // memo/forwardRef object
  }

  // Catches errors thrown during render of the user's component.
  class ErrorBoundary extends React.Component {
    constructor(props) {
      super(props);
      this.state = { error: null };
    }
    static getDerivedStateFromError(error) {
      return { error };
    }
    componentDidCatch(error) {
      parent.postMessage(
        { type: "render-error", stage: "Component crashed while rendering", message: String(error && (error.stack || error.message || error)) },
        "*"
      );
    }
    render() {
      if (this.state.error) {
        return React.createElement(
          "pre",
          { style: { color: "#b00020", padding: "16px", whiteSpace: "pre-wrap", fontFamily: "Consolas, monospace" } },
          String(this.state.error.stack || this.state.error)
        );
      }
      return this.props.children;
    }
  }

  function fail(stage, err) {
    parent.postMessage(
      { type: "render-error", stage, message: String(err && (err.message || err)) },
      "*"
    );
  }

  parent.postMessage({ type: "sandbox-ready" }, "*");
})();
