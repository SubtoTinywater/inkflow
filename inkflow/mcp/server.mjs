#!/usr/bin/env node
// InkFlow MCP server: exposes drawing/animation tools to an AI assistant (stdio).
// The InkFlow app connects to this process over WebSocket (default 127.0.0.1:7077).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebSocketServer } from 'ws';
import { z } from 'zod';

const HOST = process.env.INKFLOW_HOST || '127.0.0.1';
const PORT = +(process.env.INKFLOW_PORT || 7077);
const wss = new WebSocketServer({ host: HOST, port: PORT });
let app = null, seq = 0;
const pending = new Map();
wss.on('connection', ws => {
  app = ws;
  ws.on('message', m => {
    const r = JSON.parse(m), p = pending.get(r.id); if (!p) return;
    pending.delete(r.id); r.error ? p.rej(new Error(r.error)) : p.res(r.result);
  });
  ws.on('close', () => { if (app === ws) app = null; });
});
wss.on('error', e => console.error('InkFlow bridge error:', e.message));

const call = (method, params = {}) => new Promise((res, rej) => {
  if (!app) return rej(new Error(`InkFlow app is not connected. Open InkFlow Studio (it connects to ws://${HOST}:${PORT} automatically).`));
  const id = ++seq; pending.set(id, { res, rej });
  app.send(JSON.stringify({ id, method, params }));
  setTimeout(() => pending.delete(id) && rej(new Error('InkFlow did not respond in time')), 30000);
});

const server = new McpServer({ name: 'inkflow-studio', version: '1.0.0' }, {
  instructions: 'Draw and animate in InkFlow Studio. Coordinates are pixels, origin top-left, x right, y down, canvas default 1280x720. Frames and layers are 0-indexed. Workflow: new_document -> add_layer (separate layers for background / line art / color) -> stroke/shape/fill/text -> snapshot to look at your work and correct it -> add_frame(duplicate) and redraw changes, or tween to move/scale/rotate a layer across frames. Prefer batch to send many commands at once.'
});

const color = z.string().describe('CSS hex like #ff8800').optional();
const layer = z.number().int().optional().describe('Layer index; defaults to active layer');
const frame = z.number().int().optional().describe('Frame index; defaults to current frame (frames are created if needed)');
const tools = [
  ['get_info', 'Canvas size, fps, frame count, layer list.', {}, 'info'],
  ['new_document', 'Start a new blank document.', { width: z.number().optional(), height: z.number().optional(), fps: z.number().optional(), frames: z.number().optional() }],
  ['add_layer', 'Add a layer above the active one and make it active.', { name: z.string().optional() }],
  ['set_layer', 'Rename, show/hide, set opacity (0-1) or blend mode (source-over, multiply, screen, overlay, color-dodge), or make a layer active.', { index: z.number().int().optional(), name: z.string().optional(), visible: z.boolean().optional(), opacity: z.number().optional(), blend: z.string().optional(), active: z.boolean().optional() }],
  ['clear_layer', 'Erase a layer\'s cel on a frame.', { layer, frame }],
  ['stroke', 'Draw a freehand brush stroke through points [[x,y,pressure?],...]. Use many points for smooth curves. erase=true erases; mirror=true mirrors across the vertical center.', { points: z.array(z.array(z.number()).min(2).max(3)).min(1), color, size: z.number().optional(), opacity: z.number().optional(), erase: z.boolean().optional(), mirror: z.boolean().optional(), layer, frame }],
  ['shape', 'Draw a line (x,y -> x2,y2), rect or ellipse (x,y,w,h bounding box).', { type: z.enum(['line', 'rect', 'ellipse']), x: z.number(), y: z.number(), w: z.number().optional(), h: z.number().optional(), x2: z.number().optional(), y2: z.number().optional(), color, size: z.number().optional(), fill: z.boolean().optional(), opacity: z.number().optional(), mirror: z.boolean().optional(), layer, frame }],
  ['fill', 'Bucket fill the enclosed region at (x,y). Region is detected from ALL visible layers; paint goes on the target layer.', { x: z.number(), y: z.number(), color, tolerance: z.number().optional(), layer, frame }],
  ['text', 'Draw text with its top-left at (x,y).', { text: z.string(), x: z.number(), y: z.number(), size: z.number().optional(), color, font: z.string().optional(), layer, frame }],
  ['add_frame', 'Insert a frame after `after` (default current) and jump to it. duplicate=true copies the previous frame, ideal for tweaking poses.', { duplicate: z.boolean().optional(), after: z.number().int().optional() }],
  ['goto_frame', 'Select a frame.', { index: z.number().int() }],
  ['set_fps', 'Set playback fps (1-60).', { fps: z.number() }],
  ['set_onion', 'Toggle onion skinning.', { on: z.boolean() }],
  ['tween', 'Animate a layer by copying its cel on frame `from` across frames up to `to` with eased translation (dx,dy px), scale multiplier and rotation (degrees). Great for bouncing balls, slides, spins, zooms.', { layer, from: z.number().int(), to: z.number().int(), dx: z.number().optional(), dy: z.number().optional(), scale: z.number().optional(), rotate: z.number().optional(), easing: z.boolean().optional() }],
  ['play', 'Start or stop playback in the app.', { on: z.boolean().optional() }],
  ['export_video', 'Export the animation to a .webm download in the app.', {}],
  ['save_project', 'Download the project as a .inkflow file in the app.', {}],
  ['batch', 'Run many commands in order. commands: [{method, params}] where method is any other tool name (stroke, shape, fill, text, add_layer, add_frame, tween, ...).', { commands: z.array(z.object({ method: z.string(), params: z.record(z.any()).optional() })) }]
];
const alias = { get_info: 'info' };
for (const [name, desc, shape] of tools) {
  server.tool(name, desc, shape, async params => {
    try {
      const r = await call(alias[name] || name, params);
      return { content: [{ type: 'text', text: typeof r === 'string' ? r : JSON.stringify(r) }] };
    } catch (e) { return { isError: true, content: [{ type: 'text', text: e.message }] }; }
  });
}
server.tool('snapshot', 'Render a frame to an image so you can SEE your drawing and fix mistakes.', { frame, max: z.number().optional().describe('Longest side in px, default 768') }, async params => {
  try {
    const r = await call('snapshot', params);
    return { content: [{ type: 'image', data: r.__image, mimeType: 'image/png' }] };
  } catch (e) { return { isError: true, content: [{ type: 'text', text: e.message }] }; }
});
await server.connect(new StdioServerTransport());
console.error(`InkFlow MCP ready. Waiting for the app on ws://${HOST}:${PORT}`);
