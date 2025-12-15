/**
 * Edge Heatmap - WebGL-based density visualization for bundled edges
 * Based on Holten & van Wijk, 2009 - "floating-point accumulation buffer"
 *
 * TD-4: GPU heatmap showing edge overdraw density
 * - Renders all edge segments to accumulation buffer
 * - Maps accumulation values to color gradient
 * - Returns canvas for overlay on SVG visualization
 */

import type { BundledEdge } from "./fdeb-bundler.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Shader Sources
// ─────────────────────────────────────────────────────────────────────────────

// Vertex shader: positions edge segment vertices
const EDGE_VERTEX_SHADER = `
  attribute vec2 a_position;
  uniform vec2 u_resolution;

  void main() {
    // Convert from pixels to clip space (-1 to 1)
    vec2 clipSpace = (a_position / u_resolution) * 2.0 - 1.0;
    // Flip Y axis (WebGL has Y up, we want Y down)
    gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
  }
`;

// Fragment shader: increments accumulation (additive blending)
const EDGE_FRAGMENT_SHADER = `
  precision mediump float;
  uniform float u_alpha;

  void main() {
    // Output a small alpha value that accumulates with additive blending
    gl_FragColor = vec4(1.0, 1.0, 1.0, u_alpha);
  }
`;

// Vertex shader for full-screen quad (color mapping pass)
const QUAD_VERTEX_SHADER = `
  attribute vec2 a_position;
  varying vec2 v_texCoord;

  void main() {
    gl_Position = vec4(a_position, 0, 1);
    v_texCoord = (a_position + 1.0) * 0.5;
  }
`;

// Fragment shader: maps accumulation to color gradient
const COLOR_FRAGMENT_SHADER = `
  precision mediump float;
  uniform sampler2D u_texture;
  uniform vec3 u_colors[5];  // Gradient colors (5 stops)
  uniform float u_maxValue;  // Maximum accumulation for normalization
  uniform bool u_logScale;   // Use logarithmic scale
  varying vec2 v_texCoord;

  void main() {
    float value = texture2D(u_texture, v_texCoord).a;

    // Normalize to 0-1 range
    float normalized;
    if (u_logScale) {
      normalized = log(1.0 + value) / log(1.0 + u_maxValue);
    } else {
      normalized = value / u_maxValue;
    }
    normalized = clamp(normalized, 0.0, 1.0);

    // Map to gradient (5 color stops)
    vec3 color;
    if (normalized < 0.25) {
      color = mix(u_colors[0], u_colors[1], normalized * 4.0);
    } else if (normalized < 0.5) {
      color = mix(u_colors[1], u_colors[2], (normalized - 0.25) * 4.0);
    } else if (normalized < 0.75) {
      color = mix(u_colors[2], u_colors[3], (normalized - 0.5) * 4.0);
    } else {
      color = mix(u_colors[3], u_colors[4], (normalized - 0.75) * 4.0);
    }

    // Alpha based on accumulation (transparent where no edges)
    float alpha = normalized > 0.01 ? 0.8 : 0.0;

    gl_FragColor = vec4(color, alpha);
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Default Gradient Colors (Holten paper)
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_HEATMAP_COLORS = [
  "#2E4A62", // dark blue (low)
  "#4A7C8E", // cyan
  "#6BAF73", // green
  "#FFB86F", // orange
  "#FF6B6B", // red (high)
];

// ─────────────────────────────────────────────────────────────────────────────
// EdgeHeatmap Class
// ─────────────────────────────────────────────────────────────────────────────

export interface EdgeHeatmapConfig {
  /** Width of the heatmap canvas */
  width: number;
  /** Height of the heatmap canvas */
  height: number;
  /** Gradient colors from low to high density (5 colors) */
  colors?: string[];
  /** Use logarithmic scale for density mapping */
  logScale?: boolean;
  /** Line width for edge rendering */
  lineWidth?: number;
}

export class EdgeHeatmap {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private width: number;
  private height: number;
  private colors: number[][];
  private logScale: boolean;
  private lineWidth: number;

  // WebGL resources
  private edgeProgram: WebGLProgram | null = null;
  private colorProgram: WebGLProgram | null = null;
  private accumulationFramebuffer: WebGLFramebuffer | null = null;
  private accumulationTexture: WebGLTexture | null = null;

  constructor(config: EdgeHeatmapConfig) {
    this.width = config.width;
    this.height = config.height;
    this.logScale = config.logScale ?? true;
    this.lineWidth = config.lineWidth ?? 2;

    // Parse color strings to RGB arrays
    const colorStrs = config.colors || DEFAULT_HEATMAP_COLORS;
    this.colors = colorStrs.map(this.parseColor);

    // Create canvas
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.canvas.style.position = "absolute";
    this.canvas.style.pointerEvents = "none";

    // Get WebGL context
    const gl = this.canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });

    if (!gl) {
      throw new Error("WebGL not supported");
    }

    this.gl = gl;
    this.initWebGL();
  }

  /**
   * Render edges to accumulation buffer and apply color gradient
   */
  renderEdges(edges: BundledEdge[]): void {
    const gl = this.gl;

    // Clear and set up for accumulation pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.accumulationFramebuffer);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Enable additive blending for accumulation
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    // Use edge program
    gl.useProgram(this.edgeProgram);

    // Set uniforms
    const resolutionLoc = gl.getUniformLocation(this.edgeProgram!, "u_resolution");
    const alphaLoc = gl.getUniformLocation(this.edgeProgram!, "u_alpha");
    gl.uniform2f(resolutionLoc, this.width, this.height);
    gl.uniform1f(alphaLoc, 0.02); // Small alpha for gradual accumulation

    // Build vertex data from all edges
    const vertices: number[] = [];

    for (const edge of edges) {
      const points = edge.subdivisionPoints;
      if (points.length < 2) continue;

      // Add line segments
      for (let i = 0; i < points.length - 1; i++) {
        vertices.push(points[i].x, points[i].y);
        vertices.push(points[i + 1].x, points[i + 1].y);
      }
    }

    if (vertices.length === 0) return;

    // Create and bind vertex buffer
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

    // Set up attribute
    const positionLoc = gl.getAttribLocation(this.edgeProgram!, "a_position");
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    // Set line width (if supported)
    gl.lineWidth(this.lineWidth);

    // Draw all line segments
    gl.drawArrays(gl.LINES, 0, vertices.length / 2);

    // Clean up
    gl.deleteBuffer(positionBuffer);

    // Now apply color mapping pass
    this.applyColorMapping();
  }

  /**
   * Apply color gradient based on accumulation buffer
   */
  private applyColorMapping(): void {
    const gl = this.gl;

    // Switch to main framebuffer (canvas)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Disable blending for final output
    gl.disable(gl.BLEND);

    // Use color program
    gl.useProgram(this.colorProgram);

    // Bind accumulation texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.accumulationTexture);
    const textureLoc = gl.getUniformLocation(this.colorProgram!, "u_texture");
    gl.uniform1i(textureLoc, 0);

    // Set color uniforms (flatten to vec3 array)
    const colorLoc = gl.getUniformLocation(this.colorProgram!, "u_colors");
    const flatColors = this.colors.flat();
    gl.uniform3fv(colorLoc, flatColors);

    // Set max value (adjust based on expected edge density)
    const maxValueLoc = gl.getUniformLocation(this.colorProgram!, "u_maxValue");
    gl.uniform1f(maxValueLoc, 0.5); // Tune this based on edge count

    // Set log scale
    const logScaleLoc = gl.getUniformLocation(this.colorProgram!, "u_logScale");
    gl.uniform1i(logScaleLoc, this.logScale ? 1 : 0);

    // Draw full-screen quad
    const quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1,
        -1,
        1,
        -1,
        -1,
        1,
        -1,
        1,
        1,
        -1,
        1,
        1,
      ]),
      gl.STATIC_DRAW,
    );

    const positionLoc = gl.getAttribLocation(this.colorProgram!, "a_position");
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Clean up
    gl.deleteBuffer(quadBuffer);
  }

  /**
   * Get the canvas element for DOM insertion
   */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Resize the heatmap canvas
   */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;

    // Recreate framebuffer with new size
    this.initFramebuffer();
  }

  /**
   * Dispose of WebGL resources
   */
  dispose(): void {
    const gl = this.gl;

    if (this.edgeProgram) gl.deleteProgram(this.edgeProgram);
    if (this.colorProgram) gl.deleteProgram(this.colorProgram);
    if (this.accumulationFramebuffer) gl.deleteFramebuffer(this.accumulationFramebuffer);
    if (this.accumulationTexture) gl.deleteTexture(this.accumulationTexture);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private Methods
  // ───────────────────────────────────────────────────────────────────────────

  private initWebGL(): void {
    // Compile shaders and create programs
    this.edgeProgram = this.createProgram(EDGE_VERTEX_SHADER, EDGE_FRAGMENT_SHADER);
    this.colorProgram = this.createProgram(QUAD_VERTEX_SHADER, COLOR_FRAGMENT_SHADER);

    // Create framebuffer for accumulation
    this.initFramebuffer();
  }

  private initFramebuffer(): void {
    const gl = this.gl;

    // Delete old resources if they exist
    if (this.accumulationFramebuffer) gl.deleteFramebuffer(this.accumulationFramebuffer);
    if (this.accumulationTexture) gl.deleteTexture(this.accumulationTexture);

    // Create texture for accumulation buffer
    this.accumulationTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.accumulationTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      this.width,
      this.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Create framebuffer
    this.accumulationFramebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.accumulationFramebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.accumulationTexture,
      0,
    );

    // Verify framebuffer is complete
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      console.error("[EdgeHeatmap] Framebuffer not complete:", status);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private createProgram(vertexSrc: string, fragmentSrc: string): WebGLProgram {
    const gl = this.gl;

    const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSrc);
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSrc);

    const program = gl.createProgram()!;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("[EdgeHeatmap] Program link error:", gl.getProgramInfoLog(program));
    }

    // Clean up shaders (they're linked to program now)
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    return program;
  }

  private compileShader(type: number, source: string): WebGLShader {
    const gl = this.gl;

    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("[EdgeHeatmap] Shader compile error:", gl.getShaderInfoLog(shader));
    }

    return shader;
  }

  private parseColor(hex: string): number[] {
    // Parse hex color to normalized RGB (0-1)
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
      return [
        parseInt(result[1], 16) / 255,
        parseInt(result[2], 16) / 255,
        parseInt(result[3], 16) / 255,
      ];
    }
    return [0, 0, 0];
  }
}

// Re-export Point type for convenience
export type { Point } from "./edge-compatibility.ts";
