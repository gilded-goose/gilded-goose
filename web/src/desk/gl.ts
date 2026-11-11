// The egg's WebGL context, decided before three.js is even fetched (Track B; Round 0 a11y/perf finding 5, Round 1
// follow-up). Software rendering, no GPU (Chrome's SwiftShader, Mesa's llvmpipe or softpipe, Windows' Basic Render
// Driver and WARP, a virtual machine's or a headless browser's GL): there the studio's pre-filtering and the first
// frame are one main-thread task of seconds, for an egg that then draws at a few frames a second, and the 116 KB (br)
// of three.js would be bytes for nothing. The still picture is the same render, so it is the egg there, and nothing
// downloads. The context made here is the one three.js draws with (eggThree.ts), so nothing is created twice.

/** The attributes three.js wants; a context handed to it must have been made with these. */
export const GL_ATTRS: WebGLContextAttributes = { alpha: true, antialias: true, powerPreference: "low-power" };

const SOFTWARE_GL = /swiftshader|llvmpipe|softpipe|software|basic render|\bwarp\b|mesa offscreen/i;

/** Whether this context draws in software. Chrome names the real renderer through WEBGL_debug_renderer_info (and
 *  Firefox through RENDERER itself); a browser that hides it (Safari's "Apple GPU") is taken at its word: a GPU. */
export function softwareGL(gl: WebGL2RenderingContext): boolean {
  try {
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    return SOFTWARE_GL.test(String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER)));
  } catch { return false; }
}

/** A WebGL2 context on `canvas` that draws on a GPU, or null where there is no WebGL2 or it draws in software (the
 *  still picture stays, and a software context is given back at once). The context alone is cheap (about 15 ms
 *  measured, on software GL as on a GPU); the seconds would be in the studio that never gets built here. */
export function eggContext(canvas: HTMLCanvasElement): WebGL2RenderingContext | null {
  let gl: WebGL2RenderingContext | null;
  try { gl = canvas.getContext("webgl2", GL_ATTRS); } catch { return null; }
  if (!gl) return null;
  if (softwareGL(gl)) { gl.getExtension("WEBGL_lose_context")?.loseContext(); return null; }
  return gl;
}
