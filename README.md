# Schematic Viewer — Minecraft Layer Visualizer

A fast, fully-client-side web application for previewing and analyzing Minecraft schematics in both 2D layer-by-layer blueprints and fully-textured 3D models.

![Schematic Viewer Interface](./preview.png) *(Preview placeholder)*

## ✨ Features

- **Wide Format Support**: Reads both modern `.schem` (Sponge format) and Litematica `.litematic` files automatically.
- **Top-Down 2D Layer Blueprint**: Slice through the build block-by-layer. Ideal for survival builders following instructions step-by-step.
- **3D Orbit View**: Seamlessly switch to a fully-textured 3D representation using Three.js GPU instancing to handle millions of blocks smoothly.
- **Tomography Illumination**: In 3D mode, activate "Illuminate Layer" to dim the entire build down to shadow, highlighting only your current work layer.
- **Material List & Counts**: Automatically calculates the blocks required for the build and translates IDs into beautifully formatted, stack-aware inventory counts. Searchable and localized.
- **Themes**: Native Dark and Light modes, persisting your preference across sessions.
- **No Server Processing**: 100% of the decoding, NBT decompression (using `nbtify`), and 3D rendering happens securely in your local browser. No data leaves your machine.

## 🛠 Tech Stack

- **Core**: Vanilla HTML5, CSS3, JavaScript (ES6 Modules)
- **3D Rendering**: [Three.js](https://threejs.org/) (via GPU `InstancedMesh` buffers for extreme performance)
- **File Parsing**: [NBTify](https://github.com/mworzala/nbtify) (for parsing uncompressed and GZip/Zlib compressed DataTree buffers natively in the browser)
- **Styling**: Modern CSS Variables with Glassmorphism UI tokens.
- **Textures**: Direct vanilla asset mapping utilizing lazy-loading and HTML canvas cloning.

## 🚀 How to Run

Since the application uses standard ES Modules (`<script type="module">`), modern browsers require it to be served via an HTTP server (to avoid CORS restrictions with local files).

**Option 1: Python (Easiest)**
1. Open your terminal in the project directory.
2. Run `python3 -m http.server 3000` (or `python -m SimpleHTTPServer 3000` for older Python 2).
3. Open `http://localhost:3000` in your browser.

**Option 2: Node.js**
1. Install an HTTP server like `serve` via npm: `npm install -g serve`
2. Run `serve` in the project directory.

**Option 3: VS Code**
1. Install the **Live Server** extension.
2. Right-click `index.html` and select "Open with Live Server".

## 📦 Deployment (Hosting for Free)

Because this is a completely static, client-side web application, you can host it anywhere for free!
- **Vercel** or **Netlify**: Just drag & drop the entire project folder into their dashboard.
- **GitHub Pages**: Upload the repository to GitHub, go to Settings > Pages, and deploy from the `main` branch.

## 🧱 Supported Blocks & Textures
The engine automatically maps over 150+ generic block states (stone variants, wood, glass, concrete, terracotta, ores, etc.) to 2D colors and 3D assets. Unknown blocks or missing textures gracefully fallback to placeholder colored cubes corresponding to their base material group.

## 📄 License
This module is open-source. Feel free to fork, modify, and integrate into your own mapping tools!
