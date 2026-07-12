# JSX Launcher — Edge Extension

Click the toolbar icon, pick (or drag in) a `.jsx` file, and it renders as a live
React 18 component in the tab. Transpilation (Babel) and execution happen entirely
locally inside the extension's sandboxed page — nothing leaves your machine.

## Install (Edge)
1. Open `edge://extensions`
2. Enable **Developer mode** (bottom-left toggle)
3. Click **Load unpacked** and select this folder
4. Pin "JSX Launcher" and click its icon

## Supported JSX shapes
- `export default function App() { ... }`
- `const App = () => ...; export default App;`
- A single `export const Widget = ...` (named export)
- No export at all — the last top-level capitalized component is auto-mounted
- `import React, { useState } from "react"` — stripped; React + all hooks are
  provided as globals inside the sandbox

## Limitations
- Third-party packages (`lodash`, `recharts`, etc.) are **not bundled**; those
  imports are skipped and flagged as warnings. React and ReactDOM only.
- CSS imports are skipped — use inline styles or a `<style>` tag in your JSX.
- Runs React 18 production build; component crashes are caught by an error
  boundary and shown in the error panel.

## Why the sandbox iframe?
Manifest V3 forbids `eval` in normal extension pages. The manifest declares
`sandbox.html` as a sandboxed page, the only context where evaluating the
Babel-transpiled output is permitted. The launcher page communicates with it
via `postMessage`.

## Files
- `manifest.json` — MV3 manifest with `sandbox` declaration
- `background.js` — opens the launcher tab on toolbar click
- `launcher.html/.css/.js` — picker UI, drag-drop, error panel
- `sandbox.html/.js` — transpile + eval + mount pipeline
- `vendor/` — react, react-dom (18.3.1 UMD), @babel/standalone
- `sample/demo.jsx` — a working test component (position sizer)

## License
Apache License 2.0 — Copyright 2026 J.R. Brown. See `LICENSE`.

Bundled third-party libraries (each under its own MIT license):
react 18.3.1, react-dom 18.3.1, @babel/standalone, recharts 2.15.4, prop-types.
