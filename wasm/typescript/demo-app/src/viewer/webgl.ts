// Whether the browser can render with WebGL2 at all. niivue (src/viewer/
// panel.ts) needs a WebGL2 context for every panel; where none can be
// created (WebGL disabled in the settings, a blocklisted GPU without a
// software fallback, some remote desktops) the app reports it once, up
// front, instead of failing inside the viewer set-up.

/**
 * Probe a throwaway canvas for a WebGL2 context and release the context
 * again, since browsers cap the live contexts per page. An exception from
 * `getContext` counts as unavailable.
 */
export function webgl2Available(doc: Document = document): boolean {
  try {
    const canvas = doc.createElement('canvas')
    const gl = canvas.getContext('webgl2')
    if (!gl) {
      return false
    }
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}
