# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Cochera POS** — A parking lot point-of-sale system. Static HTML/CSS/JS app backed by Firebase Firestore. No build step, no framework, no bundler. Open any HTML file in a browser or deploy to Netlify as-is.

## Development

No build or install step. To develop:
- Open HTML files directly in a browser, or
- Use a local dev server: `npx serve .` or VS Code Live Server extension

To deploy: push to GitHub and connect the repo to Netlify (static site, publish directory = root).

**Firebase credentials** are real and live in `firebase/config.js`. Firestore rules are currently open (`allow read, write: if true`).

## Architecture

### Routing & Role-based Access

`index.html` redirects based on `sessionStorage` session:
- **Admin** (`rol === 'admin'`) → `dashboard.html`
- **Worker** (`rol === 'trabajador'`) → `turno.html`
- **No session** → `login.html`

`js/auth.js` exports a global `Auth` object with `requireAuth()`, `requireAdmin()`, `requireWorker()` — each page calls the appropriate guard at init.

### Pages

| File | Role | Purpose |
|------|------|---------|
| `login.html` | All | Login; auto-creates admin if Firestore `usuarios` is empty |
| `dashboard.html` | Admin | Full SPA: stats, vehicle list, history, users CRUD, config |
| `turno.html` | Worker | Start/close shift; register vehicle entry/exit in split-view |
| `cochera.html` | Worker | View vehicles currently in lot |
| `clientes.html` | Admin | Client management |
| `reportes.html` | Admin | Shift reports |
| `horarios.html` | Admin | Schedule management |
| `pre-registro.html` | Worker | Pre-register vehicles |

### JS Modules (global scope, loaded via `<script>` tags)

All modules expose a single global object or const:

- **`Auth`** (`js/auth.js`) — session management via `sessionStorage` key `cochera_session`
- **`Vehiculos`** (`js/vehiculos.js`) — `registrarEntrada()`, `registrarSalida()`, `getEnCochera()`. Uses Firestore transaction for ticket number generation (`configuracion/ticket`)
- **`Turnos`** (`js/turnos.js`) — shift lifecycle: `iniciar()`, `cerrar()`, `getActivo()`, `getActivoDelTrabajador()`
- **`Clientes`** (`js/clientes.js`) — client CRUD + auto-registration by plate via `agregarPlacaAuto()`
- **`Reportes`** (`js/reportes.js`) — fetch cobros by turno, `generarHTMLReporte()` for print
- **`ui.js`** — shared UI utilities: `mostrarToast()`, `mostrarModal()`, `cerrarModal()`, `iniciarReloj()`, `initModoOscuro()`, `formatFecha()`, `fechaStr()`, `formatMonto()`, `calcularTiempo()`

Script load order per page: Firebase CDN → `firebase/config.js` → `js/auth.js` → `js/ui.js` → domain modules → inline `<script>`.

### Firestore Collections

| Collection | Key fields |
|-----------|-----------|
| `usuarios` | `usuario`, `nombre`, `password`, `rol` ('admin'/'trabajador'), `activo` |
| `autos` | `placa`, `tipo`, `estado` ('dentro'/'salido'), `horaEntrada`, `horaSalida`, `cobradoAlIngreso`, `montoIngreso`, `montoSalida`, `precioTotal`, `turnoEntradaId`, `turnoSalidaId` |
| `turnos` | `trabajadorId`, `tipo` (Mañana/Tarde/Noche/Todo el día), `estado` ('activo'/'cerrado'), `inicio`, `fin` |
| `cobros` | `autoId`, `placa`, `tipo` ('ingreso'/'salida'), `monto`, `turnoId`, `trabajadorId`, `fechaCobro` |
| `clientes` | `nombre`, `celular`, `placas` (array) — searched with `array-contains` |
| `configuracion/general` | `totalEspacios` |
| `configuracion/ticket` | `ultimo` — transactional auto-increment for ticket numbers |

### Key Patterns

- **No composite Firestore indexes**: queries use at most one range filter; multi-field filtering done client-side after fetching. Sorting is always client-side.
- **Duplicate/capacity checks in `Vehiculos.registrarEntrada()`**: queries all docs with matching placa, filters `estado === 'dentro'` client-side to avoid composite index.
- **Dark mode**: `body.light-mode` toggled; persisted in `localStorage('darkMode')`. Default is dark.
- **Timestamps**: always use `formatFecha(ts)` (in `ui.js`) to convert Firestore Timestamps, Dates, or strings uniformly.
- **Currency**: Peruvian Sol (S/). Use `formatMonto()` for display.
- **Locale**: `es-PE` throughout.

### Design System (CSS Variables in `css/styles.css`)

Fonts: `--font-display` (Rajdhani), `--font-mono` (IBM Plex Mono), `--font-body` (Nunito).
Accent colors: `--accent` (#00d4aa green-teal), `--yellow` (#f9ca24), `--red` (#ff4757), `--blue` (#4facfe).
Dark mode default; light mode via `body.light-mode`.
