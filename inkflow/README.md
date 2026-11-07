# InkFlow Studio

Raster drawing + frame animation app (desktop, Windows/macOS, and Android) with a built-in **MCP bridge** so an AI assistant can draw and animate for you.

## Features
- Brush (pressure + stabilizer), pencil, eraser, shapes, flood fill that reads all visible layers, color picker
- Mirror/symmetry drawing, opacity, size, 16-color palette + full picker
- Layers: opacity, blend modes (multiply/screen/overlay/dodge), reorder, copy, hide
- Frame-by-frame animation: timeline, onion skin (prev/next), copy frame, playback, FPS
- Zoom/pan, undo/redo (40 steps, strokes/fills), PNG export, WebM video export, `.inkflow` save/open
- Keys: B P E G L R O I H tools, `[` `]` size, `,` `.` frames, Enter play, Space pan, Ctrl+Z / Ctrl+Y

## AI via MCP
```bash
npm install
npm run mcp        # stdio MCP server; the app connects to ws://127.0.0.1:7077
```
Claude Desktop / any MCP client config:
```json
{ "mcpServers": { "inkflow": { "command": "node", "args": ["/absolute/path/to/inkflow/mcp/server.mjs"] } } }
```
Open InkFlow; the "AI link" dot turns green. Tools: `new_document, add_layer, set_layer, stroke, shape, fill, text, add_frame, goto_frame, tween, play, set_fps, set_onion, snapshot (AI sees the canvas), batch, export_video, save_project`.
Try: "Draw a cartoon cat on its own layer, then animate it bouncing across the screen over 24 frames."
On Android, run the MCP server on your computer with `INKFLOW_HOST=0.0.0.0`, then tap "AI link" in the app and enter `<your-computer-LAN-IP>:7077`.

## Build and publish the installers (GitHub Actions)
1. Push this folder to a GitHub repo (include the hidden `.github` folder).
2. **Test build:** Actions > "Build and Release Installers" > Run workflow. Installers appear as artifacts on the run.
3. **Publish a release:** tag and push:
   ```bash
   git tag v1.0.0 && git push origin v1.0.0
   ```
   The workflow builds `.dmg` (macOS runner), `.exe` (Windows runner) and `.apk` (Linux runner with Android SDK), then a `release` job attaches all three to a new GitHub Release.
4. Download from the repo's **Releases** page and install.

Builds are unsigned: macOS needs right-click > Open the first time, Windows SmartScreen shows "More info > Run anyway", and the APK needs "install unknown apps". The APK is a debug build; a Play Store release would need a signed release build.
