import { useEffect, useRef, useState } from "react";
import type { RelightPixels } from "../../shared/relighting";
/** GPU presents canonical CPU pixels. Straight texture -> explicit premultiplication, no color transform or smoothing. */
export function RelightCanvas({
  pixels,
  zoom,
  pixelArt,
  forceCPU = false,
}: {
  pixels: RelightPixels;
  zoom: number;
  pixelArt: boolean;
  forceCPU?: boolean;
}) {
  const target = useRef<HTMLDivElement>(null);
  const [backend, setBackend] = useState("");
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = pixels.width;
    canvas.height = pixels.height;
    canvas.style.width = `${pixels.width * zoom}px`;
    canvas.style.height = `${pixels.height * zoom}px`;
    canvas.style.imageRendering = pixelArt ? "pixelated" : "auto";
    canvas.setAttribute("aria-label", "Live Lichtvorschau");
    let gl: WebGLRenderingContext | null = null;
    let dispose = () => {};
    const cpu = () => {
      const c = document.createElement("canvas");
      c.width = pixels.width;
      c.height = pixels.height;
      c.style.cssText = canvas.style.cssText;
      c.setAttribute("aria-label", "Live Lichtvorschau");
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("Canvas nicht verfügbar.");
      ctx.putImageData(
        new ImageData(
          new Uint8ClampedArray(pixels.data),
          pixels.width,
          pixels.height,
        ),
        0,
        0,
      );
      target.current?.replaceChildren(c);
      setBackend("CPU Canvas2D · kanonische RGBA8-Pixel");
    };
    try {
      gl = forceCPU
        ? null
        : canvas.getContext("webgl", {
            alpha: true,
            premultipliedAlpha: true,
            antialias: false,
            preserveDrawingBuffer: true,
            depth: false,
            stencil: false,
          });
      if (
        !gl ||
        pixels.width > gl.getParameter(gl.MAX_TEXTURE_SIZE) ||
        pixels.height > gl.getParameter(gl.MAX_TEXTURE_SIZE)
      )
        throw new Error("GPU nicht verfügbar");
      const context = gl;
      const shader = (type: number, code: string) => {
        const s = context.createShader(type)!;
        context.shaderSource(s, code);
        context.compileShader(s);
        if (!context.getShaderParameter(s, context.COMPILE_STATUS))
          throw new Error("GPU Shader");
        return s;
      };
      const vs = shader(
        gl.VERTEX_SHADER,
        "attribute vec2 p; varying vec2 uv; void main(){gl_Position=vec4(p,0.,1.);uv=vec2((p.x+1.)*.5,(1.-p.y)*.5);}",
      );
      const fs = shader(
        gl.FRAGMENT_SHADER,
        "precision highp float; varying vec2 uv; uniform sampler2D tex; void main(){vec4 c=texture2D(tex,uv);gl_FragColor=vec4(c.rgb*c.a,c.a);}",
      );
      const program = gl.createProgram()!;
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error("GPU Programm");
      gl.useProgram(program);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW,
      );
      const at = gl.getAttribLocation(program, "p");
      gl.enableVertexAttribArray(at);
      gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        pixels.width,
        pixels.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels.data,
      );
      gl.viewport(0, 0, pixels.width, pixels.height);
      gl.disable(gl.BLEND);
      gl.disable(gl.DITHER);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (gl.getError() !== gl.NO_ERROR) throw new Error("GPU Darstellung");
      const fallback = () => cpu();
      canvas.addEventListener("webglcontextlost", fallback);
      target.current?.replaceChildren(canvas);
      setBackend("GPU WebGL · kanonische CPU-Pixel, Nearest-Textur");
      dispose = () => {
        canvas.removeEventListener("webglcontextlost", fallback);
        context.deleteTexture(texture);
        context.deleteBuffer(buffer);
        context.deleteProgram(program);
        context.deleteShader(vs);
        context.deleteShader(fs);
        context.getExtension("WEBGL_lose_context")?.loseContext();
      };
    } catch {
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
      cpu();
    }
    return () => {
      dispose();
      target.current?.replaceChildren();
    };
  }, [pixels, zoom, pixelArt, forceCPU]);
  return (
    <>
      <small role="status" aria-label="Lichtdarstellung">
        {backend}
      </small>
      <div className="relight-canvas checker" ref={target} />
    </>
  );
}
