import {
  Camera,
  Mesh,
  Plane,
  Program,
  Renderer,
  Texture,
  Transform,
  Raycast,
  type OGLRenderingContext,
} from 'ogl';

import { CreationMeta } from '../library/types';
import { renderThumbnailCanvas, clearThumbnailCache } from './thumbnail';
import { GALLERY_CONSTANTS } from './constants';
import { getThemeTokens } from '../ui/theme';

export interface CircularGalleryItem {
  id: string;
  title: string;
  meta: CreationMeta;
  canvas: HTMLCanvasElement;
}

export interface CircularGalleryOptions {
  items: CreationMeta[];
  bend?: number;
  borderRadius?: number;
  scrollSpeed?: number;
  scrollEase?: number;
  onSelect?: (creationId: string) => void;
  onCenteredChange?: (meta: CreationMeta) => void;
  onContextLost?: () => void;
}

function lerp(p1: number, p2: number, t: number) {
  return p1 + (p2 - p1) * t;
}

function autoBind(instance: object) {
  const proto = Object.getPrototypeOf(instance);
  Object.getOwnPropertyNames(proto).forEach((key) => {
    if (key !== 'constructor' && typeof (instance as any)[key] === 'function') {
      (instance as any)[key] = (instance as any)[key].bind(instance);
    }
  });
}

function debounce(func: (...args: any[]) => void, wait: number) {
  let timeout: number | null = null;
  return function (this: any, ...args: any[]) {
    if (timeout !== null) window.clearTimeout(timeout);
    timeout = window.setTimeout(() => func.apply(this, args), wait);
  };
}

/**
 * Creates crisp text texture for card titles in Fraunces font.
 */
function createTitleTexture(
  gl: OGLRenderingContext,
  text: string,
  fontSizePx: number = 24,
  fontFamily: string = "'Fraunces', serif",
  textColor: string = '#1C1A16'
) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let displayText = text.trim();
  if (displayText.length > 24) {
    displayText = displayText.slice(0, 23).trim() + '…';
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;

  context.font = `600 ${fontSizePx}px ${fontFamily}`;
  const metrics = context.measureText(displayText);
  const textWidth = Math.ceil(metrics.width);
  const textHeight = Math.ceil(fontSizePx * 1.3);

  const padX = 20;
  const padY = 14;
  const totalW = textWidth + padX;
  const totalH = textHeight + padY;

  canvas.width = Math.ceil(totalW * dpr);
  canvas.height = Math.ceil(totalH * dpr);

  context.scale(dpr, dpr);
  context.font = `600 ${fontSizePx}px ${fontFamily}`;
  context.fillStyle = textColor;
  context.textBaseline = 'middle';
  context.textAlign = 'center';
  context.clearRect(0, 0, totalW, totalH);
  context.fillText(displayText, totalW / 2, totalH / 2);

  const texture = new Texture(gl, {
    generateMipmaps: false,
    minFilter: gl.LINEAR,
    magFilter: gl.LINEAR,
  });
  texture.image = canvas;
  return { texture, width: totalW, height: totalH };
}

class TitleMesh {
  gl: OGLRenderingContext;
  plane: Mesh;
  text: string;
  textColor: string;
  mesh!: Mesh;
  private texture!: Texture;
  private program!: Program;
  private geometry!: Plane;
  private aspect: number = 1;

  constructor({
    gl,
    plane,
    text,
    textColor,
  }: {
    gl: OGLRenderingContext;
    plane: Mesh;
    text: string;
    textColor: string;
  }) {
    autoBind(this);
    this.gl = gl;
    this.plane = plane;
    this.text = text;
    this.textColor = textColor;
    this.createMesh();
  }

  createMesh() {
    const { texture, width, height } = createTitleTexture(
      this.gl,
      this.text,
      24,
      "'Fraunces', serif",
      this.textColor
    );
    this.texture = texture;
    this.aspect = width / height;
    this.geometry = new Plane(this.gl);
    this.program = new Program(this.gl, {
      vertex: `
        attribute vec3 position;
        attribute vec2 uv;
        uniform mat4 modelViewMatrix;
        uniform mat4 projectionMatrix;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragment: `
        precision highp float;
        uniform sampler2D tMap;
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          vec4 color = texture2D(tMap, vUv);
          if (color.a < 0.05) discard;
          gl_FragColor = vec4(color.rgb, color.a * uOpacity);
        }
      `,
      uniforms: { tMap: { value: texture }, uOpacity: { value: 1.0 } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new Mesh(this.gl, { geometry: this.geometry, program: this.program });
    this.onResize();
    this.mesh.setParent(this.plane);
  }

  onResize() {
    const localTextHeight = 0.11;
    const aspectCorrection = this.plane.scale.x > 0 ? this.plane.scale.y / this.plane.scale.x : 1.25;
    const localTextWidth = localTextHeight * this.aspect * aspectCorrection;
    this.mesh.scale.set(localTextWidth, localTextHeight, 1);
    this.mesh.position.set(0, -0.5 - localTextHeight * 0.5 - 0.04, 0.02);
  }

  setProminence(factor: number) {
    const clamped = Math.max(0, Math.min(1, factor));
    const opacity = 0.55 + 0.45 * clamped;
    this.program.uniforms.uOpacity.value = opacity;
    const scaleMultiplier = 1.0 + 0.08 * clamped;
    const localTextHeight = 0.11 * scaleMultiplier;
    const aspectCorrection = this.plane.scale.x > 0 ? this.plane.scale.y / this.plane.scale.x : 1.25;
    const localTextWidth = localTextHeight * this.aspect * aspectCorrection;
    this.mesh.scale.set(localTextWidth, localTextHeight, 1);
  }

  updateTextColor(color: string) {
    this.textColor = color;
    const { texture, width, height } = createTitleTexture(
      this.gl,
      this.text,
      24,
      "'Fraunces', serif",
      this.textColor
    );
    this.texture = texture;
    this.aspect = width / height;
    this.program.uniforms.tMap.value = texture;
    this.onResize();
  }

  destroy() {
    if (this.texture?.texture) {
      this.gl.deleteTexture(this.texture.texture);
    }
  }
}

class MediaCard {
  gl: OGLRenderingContext;
  geometry: Plane;
  item: CircularGalleryItem;
  index: number;
  originalIndex: number;
  length: number;
  scene: Transform;
  screen: { width: number; height: number };
  viewport: { width: number; height: number };
  bend: number;
  textColor: string;
  borderRadius: number;
  isInfinite: boolean;

  program!: Program;
  plane!: Mesh;
  title!: TitleMesh;
  texture!: Texture;

  extra: number = 0;
  widthTotal: number = 0;
  width: number = 0;
  x: number = 0;
  scale: number = 1;
  padding: number = 2.4;
  speed: number = 0;
  isBefore: boolean = false;
  isAfter: boolean = false;

  constructor({
    geometry,
    gl,
    item,
    index,
    originalIndex,
    length,
    scene,
    screen,
    viewport,
    bend,
    textColor,
    borderRadius = 0.045,
    isInfinite = false,
  }: {
    geometry: Plane;
    gl: OGLRenderingContext;
    item: CircularGalleryItem;
    index: number;
    originalIndex: number;
    length: number;
    scene: Transform;
    screen: { width: number; height: number };
    viewport: { width: number; height: number };
    bend: number;
    textColor: string;
    borderRadius: number;
    isInfinite: boolean;
  }) {
    this.geometry = geometry;
    this.gl = gl;
    this.item = item;
    this.index = index;
    this.originalIndex = originalIndex;
    this.length = length;
    this.scene = scene;
    this.screen = screen;
    this.viewport = viewport;
    this.bend = bend;
    this.textColor = textColor;
    this.borderRadius = borderRadius;
    this.isInfinite = isInfinite;

    this.createShader();
    this.createMesh();
    this.createTitle();
    this.onResize();
  }

  createShader() {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.texture = new Texture(this.gl, {
      generateMipmaps: false,
      minFilter: this.gl.LINEAR,
      magFilter: this.gl.LINEAR,
    });
    this.texture.image = this.item.canvas;

    this.program = new Program(this.gl, {
      depthTest: false,
      depthWrite: false,
      vertex: `
        precision highp float;
        attribute vec3 position;
        attribute vec2 uv;
        uniform mat4 modelViewMatrix;
        uniform mat4 projectionMatrix;
        uniform float uTime;
        uniform float uSpeed;
        uniform float uRippleScale;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 p = position;
          if (uRippleScale > 0.0) {
            p.z = (sin(p.x * 4.0 + uTime) * 1.5 + cos(p.y * 2.0 + uTime) * 1.5) * (0.08 + uSpeed * 0.4) * uRippleScale;
          }
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragment: `
        precision highp float;
        uniform vec2 uImageSizes;
        uniform vec2 uPlaneSizes;
        uniform sampler2D tMap;
        uniform float uBorderRadius;
        varying vec2 vUv;
        
        float roundedBoxSDF(vec2 p, vec2 b, float r) {
          vec2 d = abs(p) - b;
          return length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0) - r;
        }
        
        void main() {
          vec2 ratio = vec2(
            min((uPlaneSizes.x / uPlaneSizes.y) / (uImageSizes.x / uImageSizes.y), 1.0),
            min((uPlaneSizes.y / uPlaneSizes.x) / (uImageSizes.y / uImageSizes.x), 1.0)
          );
          vec2 uv = vec2(
            vUv.x * ratio.x + (1.0 - ratio.x) * 0.5,
            vUv.y * ratio.y + (1.0 - ratio.y) * 0.5
          );
          vec4 color = texture2D(tMap, uv);
          
          float d = roundedBoxSDF(vUv - 0.5, vec2(0.5 - uBorderRadius), uBorderRadius);
          float edgeSmooth = 0.002;
          float alpha = 1.0 - smoothstep(-edgeSmooth, edgeSmooth, d);
          
          gl_FragColor = vec4(color.rgb, color.a * alpha);
        }
      `,
      uniforms: {
        tMap: { value: this.texture },
        uPlaneSizes: { value: [0, 0] },
        uImageSizes: { value: [this.item.canvas.width, this.item.canvas.height] },
        uSpeed: { value: 0 },
        uTime: { value: Math.random() * 100 },
        uRippleScale: { value: prefersReducedMotion ? 0.0 : 0.8 },
        uBorderRadius: { value: this.borderRadius },
      },
      transparent: true,
    });
  }

  createMesh() {
    this.plane = new Mesh(this.gl, {
      geometry: this.geometry,
      program: this.program,
    });
    this.plane.setParent(this.scene);
  }

  createTitle() {
    this.title = new TitleMesh({
      gl: this.gl,
      plane: this.plane,
      text: this.item.title,
      textColor: this.textColor,
    });
  }

  updateTexture(newCanvas: HTMLCanvasElement) {
    this.item.canvas = newCanvas;
    this.texture.image = newCanvas;
    this.program.uniforms.uImageSizes.value = [newCanvas.width, newCanvas.height];
  }

  update(
    scroll: { current: number; last: number },
    direction: 'left' | 'right'
  ) {
    this.plane.position.x = this.x - scroll.current - this.extra;

    const x = this.plane.position.x;
    const H = this.viewport.width / 2;
    const yShift = this.viewport.height * 0.035;

    if (this.bend === 0) {
      this.plane.position.y = yShift;
      this.plane.rotation.z = 0;
    } else {
      const B_abs = Math.abs(this.bend);
      const R = (H * H + B_abs * B_abs) / (2 * B_abs);
      const effectiveX = Math.min(Math.abs(x), H);
      const arc = R - Math.sqrt(Math.max(0.001, R * R - effectiveX * effectiveX));

      if (this.bend > 0) {
        this.plane.position.y = yShift - arc;
        this.plane.rotation.z = -Math.sign(x) * Math.asin(effectiveX / R);
      } else {
        this.plane.position.y = yShift + arc;
        this.plane.rotation.z = Math.sign(x) * Math.asin(effectiveX / R);
      }
    }

    // Centered card title prominence (full opacity, slightly larger)
    const distFromCenter = Math.abs(x);
    const cardHalfWidth = Math.max(0.1, this.plane.scale.x * 0.5);
    const factor = Math.max(0, 1 - distFromCenter / (cardHalfWidth * 1.5));
    this.title.setProminence(factor);

    this.speed = scroll.current - scroll.last;
    this.program.uniforms.uTime.value += 0.035;
    this.program.uniforms.uSpeed.value = this.speed;

    if (this.isInfinite) {
      const planeOffset = this.plane.scale.x / 2;
      const viewportOffset = this.viewport.width / 2;
      this.isBefore = this.plane.position.x + planeOffset < -viewportOffset;
      this.isAfter = this.plane.position.x - planeOffset > viewportOffset;

      if (direction === 'right' && this.isBefore) {
        this.extra -= this.widthTotal;
        this.isBefore = this.isAfter = false;
      }
      if (direction === 'left' && this.isAfter) {
        this.extra += this.widthTotal;
        this.isBefore = this.isAfter = false;
      }
    }
  }

  onResize(
    {
      screen,
      viewport,
    }: {
      screen?: { width: number; height: number };
      viewport?: { width: number; height: number };
    } = {}
  ) {
    if (screen) this.screen = screen;
    if (viewport) {
      this.viewport = viewport;
    }

    const isMobile = this.screen.width < 768;

    // Sized so card AND in-scene title caption fit inside stage height (~75-78%)
    const maxCardHeight = this.viewport.height * (isMobile ? 0.74 : 0.76);
    const maxCardWidth = this.viewport.width * 0.82;
    const cardHeight = Math.min(maxCardHeight, maxCardWidth * 1.25);

    this.plane.scale.y = cardHeight;
    this.plane.scale.x = (cardHeight * 4) / 5;

    this.program.uniforms.uPlaneSizes.value = [
      this.plane.scale.x,
      this.plane.scale.y,
    ];

    this.title.onResize();

    this.padding = isMobile ? 1.6 : 2.4;
    this.width = this.plane.scale.x + this.padding;
    this.widthTotal = this.width * this.length;
    this.x = this.width * this.index;
  }

  destroy() {
    this.title.destroy();
    if (this.texture?.texture) {
      this.gl.deleteTexture(this.texture.texture);
    }
    this.plane.setParent(null);
  }
}

export class CircularGallery {
  private container: HTMLElement;
  private options: CircularGalleryOptions;
  private renderer!: Renderer;
  private gl!: OGLRenderingContext;
  private camera!: Camera;
  private scene!: Transform;
  private planeGeometry!: Plane;
  private raycast!: Raycast;

  private medias: MediaCard[] = [];
  private items: CircularGalleryItem[] = [];
  private isInfinite: boolean = false;

  private scrollSpeed: number;
  private scroll: {
    ease: number;
    current: number;
    target: number;
    last: number;
    position: number;
  };

  private isDown: boolean = false;
  private startX: number = 0;
  private startY: number = 0;
  private pointerDownTime: number = 0;
  private activePointerId: number | null = null;

  private screen!: { width: number; height: number };
  private viewport!: { width: number; height: number };
  private raf: number | null = null;
  private isPaused: boolean = false;
  private onCheckDebounced: () => void;
  private lastCenteredOriginalIndex: number = -1;

  constructor(container: HTMLElement, options: CircularGalleryOptions) {
    this.container = container;
    this.options = options;
    this.scrollSpeed = options.scrollSpeed ?? GALLERY_CONSTANTS.scrollSpeed;
    this.scroll = {
      ease: options.scrollEase ?? GALLERY_CONSTANTS.scrollEase,
      current: 0,
      target: 0,
      last: 0,
      position: 0,
    };

    autoBind(this);
    this.onCheckDebounced = debounce(this.onCheck.bind(this), GALLERY_CONSTANTS.snapDebounceMs);

    this.initWebGL();
    this.initItems(options.items);
    this.addEventListeners();
    this.update();
  }

  private initWebGL() {
    try {
      this.renderer = new Renderer({
        alpha: true,
        antialias: true,
        dpr: Math.min(window.devicePixelRatio || 1, 2),
      });
      this.gl = this.renderer.gl;
      this.gl.clearColor(0, 0, 0, 0);

      this.gl.canvas.style.display = 'block';
      this.gl.canvas.style.width = '100%';
      this.gl.canvas.style.height = '100%';
      this.gl.canvas.style.touchAction = 'none';

      this.container.appendChild(this.gl.canvas);

      this.camera = new Camera(this.gl);
      this.camera.fov = GALLERY_CONSTANTS.cameraFov;
      this.camera.position.z = GALLERY_CONSTANTS.cameraZ;

      this.scene = new Transform();
      this.raycast = new Raycast();

      this.planeGeometry = new Plane(this.gl, {
        heightSegments: 40,
        widthSegments: 60,
      });

      this.onResize();
    } catch (err) {
      console.error('Failed to initialize WebGL for CircularGallery:', err);
      this.options.onContextLost?.();
    }
  }

  private initItems(rawItems: CreationMeta[]) {
    // Top 12 creations
    const slice = rawItems.slice(0, 12);
    this.isInfinite = slice.length >= 6;

    this.items = slice.map((meta) => ({
      id: meta.id,
      title: meta.title,
      meta,
      canvas: renderThumbnailCanvas(meta),
    }));

    const galleryData = this.isInfinite
      ? [...this.items, ...this.items]
      : [...this.items];

    const tokens = getThemeTokens();
    const bend = this.options.bend ?? GALLERY_CONSTANTS.bend;
    const borderRadius = this.options.borderRadius ?? GALLERY_CONSTANTS.borderRadius;

    this.medias = galleryData.map((item, index) => {
      const originalIndex = index % this.items.length;
      return new MediaCard({
        geometry: this.planeGeometry,
        gl: this.gl,
        item,
        index,
        originalIndex,
        length: galleryData.length,
        scene: this.scene,
        screen: this.screen,
        viewport: this.viewport,
        bend,
        textColor: tokens.ink,
        borderRadius,
        isInfinite: this.isInfinite,
      });
    });

    // Reset scroll to 0 (centered on most recent item)
    this.scroll.current = 0;
    this.scroll.target = 0;
    this.scroll.last = 0;
    this.notifyCentered(0);
  }

  public updateTheme() {
    clearThumbnailCache();
    const tokens = getThemeTokens();
    for (const media of this.medias) {
      const freshCanvas = renderThumbnailCanvas(media.item.meta);
      media.updateTexture(freshCanvas);
      media.title.updateTextColor(tokens.ink);
    }
  }

  private onPointerDown(e: PointerEvent) {
    if (this.activePointerId !== null) return;
    this.activePointerId = e.pointerId;
    this.isDown = true;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.pointerDownTime = performance.now();
    this.scroll.position = this.scroll.current;
    try {
      this.container.setPointerCapture(e.pointerId);
    } catch {}
  }

  private onPointerMove(e: PointerEvent) {
    if (!this.isDown || e.pointerId !== this.activePointerId) return;
    const dx = e.clientX - this.startX;
    const distance = -dx * (this.scrollSpeed * 0.022);
    this.scroll.target = this.scroll.position + distance;

    if (!this.isInfinite && this.medias.length > 0) {
      const width = this.medias[0].width;
      const maxScroll = width * (this.items.length - 1);
      // Soft elastic resistance beyond bounds
      if (this.scroll.target < 0) {
        this.scroll.target *= 0.3;
      } else if (this.scroll.target > maxScroll) {
        this.scroll.target = maxScroll + (this.scroll.target - maxScroll) * 0.3;
      }
    }
  }

  private onPointerUp(e: PointerEvent) {
    if (e.pointerId !== this.activePointerId) return;
    this.isDown = false;
    this.activePointerId = null;
    try {
      if (this.container.hasPointerCapture(e.pointerId)) {
        this.container.releasePointerCapture(e.pointerId);
      }
    } catch {}

    const dist = Math.hypot(e.clientX - this.startX, e.clientY - this.startY);
    const elapsed = performance.now() - this.pointerDownTime;

    if (dist <= GALLERY_CONSTANTS.tapMaxDistancePx && elapsed <= GALLERY_CONSTANTS.tapMaxDurationMs) {
      // Tap detected: raycast against meshes
      this.handleCardTap(e.clientX, e.clientY);
    } else {
      this.onCheck();
    }
  }

  private handleCardTap(clientX: number, clientY: number) {
    if (!this.medias || this.medias.length === 0) return;

    const rect = this.gl.canvas.getBoundingClientRect();
    const mouse = {
      x: ((clientX - rect.left) / rect.width) * 2 - 1,
      y: -((clientY - rect.top) / rect.height) * 2 + 1,
    };

    this.raycast.castMouse(this.camera, [mouse.x, mouse.y]);
    const meshes = this.medias.map((m) => m.plane);
    const hits = this.raycast.intersectBounds(meshes);

    if (hits.length > 0) {
      const hitMesh = hits[0];
      const hitMedia = this.medias.find((m) => m.plane === hitMesh);
      if (hitMedia) {
        // Check if card is currently centered
        const isCentered = Math.abs(hitMedia.plane.position.x) < hitMedia.plane.scale.x * 0.45;
        if (isCentered) {
          // Centered card tapped: open project!
          this.options.onSelect?.(hitMedia.item.id);
        } else {
          // Side card tapped: scroll it to center
          this.scrollToIndex(hitMedia.index);
        }
      }
    }
  }

  public scrollToIndex(targetIndex: number) {
    if (!this.medias || this.medias.length === 0) return;
    const width = this.medias[0].width;
    this.scroll.target = width * targetIndex;
    if (!this.isInfinite) {
      const maxScroll = width * (this.items.length - 1);
      this.scroll.target = Math.max(0, Math.min(maxScroll, this.scroll.target));
    }
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    this.scroll.target += delta * 0.005 * this.scrollSpeed;

    if (!this.isInfinite && this.medias.length > 0) {
      const width = this.medias[0].width;
      const maxScroll = width * (this.items.length - 1);
      this.scroll.target = Math.max(0, Math.min(maxScroll, this.scroll.target));
    }

    this.onCheckDebounced();
  }

  private onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.scrollByStep(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.scrollByStep(-1);
    } else if (e.key === 'Enter') {
      if (this.lastCenteredOriginalIndex >= 0 && this.items[this.lastCenteredOriginalIndex]) {
        this.options.onSelect?.(this.items[this.lastCenteredOriginalIndex].id);
      }
    }
  }

  private scrollByStep(step: number) {
    if (!this.medias || this.medias.length === 0) return;
    const width = this.medias[0].width;
    const currentIndex = Math.round(this.scroll.target / width);
    let nextIndex = currentIndex + step;

    if (!this.isInfinite) {
      nextIndex = Math.max(0, Math.min(this.items.length - 1, nextIndex));
    }

    this.scroll.target = width * nextIndex;
  }

  private onCheck() {
    if (!this.medias || this.medias.length === 0) return;
    const width = this.medias[0].width;
    let itemIndex = Math.round(this.scroll.target / width);

    if (!this.isInfinite) {
      itemIndex = Math.max(0, Math.min(this.items.length - 1, itemIndex));
    }

    this.scroll.target = width * itemIndex;
  }

  public onResize() {
    this.screen = {
      width: this.container.clientWidth,
      height: this.container.clientHeight,
    };
    if (this.screen.width === 0 || this.screen.height === 0) return;

    this.renderer.setSize(this.screen.width, this.screen.height);
    this.camera.perspective({
      aspect: this.screen.width / this.screen.height,
    });

    const fov = (this.camera.fov * Math.PI) / 180;
    const height = 2 * Math.tan(fov / 2) * this.camera.position.z;
    const width = height * this.camera.aspect;
    this.viewport = { width, height };

    if (this.medias) {
      this.medias.forEach((media) =>
        media.onResize({ screen: this.screen, viewport: this.viewport })
      );
    }
  }

  private update() {
    if (this.isPaused) return;

    const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      this.scroll.current = this.scroll.target;
    } else {
      this.scroll.current = lerp(
        this.scroll.current,
        this.scroll.target,
        this.scroll.ease
      );
    }

    const direction = this.scroll.current >= this.scroll.last ? 'right' : 'left';

    let closestDist = Infinity;
    let closestMedia: MediaCard | null = null;

    if (this.medias) {
      for (const media of this.medias) {
        media.update(this.scroll, direction);
        const dist = Math.abs(media.plane.position.x);
        if (dist < closestDist) {
          closestDist = dist;
          closestMedia = media;
        }
      }
    }

    if (closestMedia) {
      this.notifyCentered(closestMedia.originalIndex);
    }

    this.renderer.render({ scene: this.scene, camera: this.camera });
    this.scroll.last = this.scroll.current;
    this.raf = window.requestAnimationFrame(this.update);
  }

  private notifyCentered(originalIndex: number) {
    if (originalIndex !== this.lastCenteredOriginalIndex) {
      this.lastCenteredOriginalIndex = originalIndex;
      const meta = this.items[originalIndex]?.meta;
      if (meta) {
        this.options.onCenteredChange?.(meta);
      }
    }
  }

  public setPaused(paused: boolean) {
    this.isPaused = paused;
    if (!paused && !this.raf) {
      this.update();
    }
  }

  public getCentredCreationId(): string | null {
    if (this.lastCenteredOriginalIndex >= 0 && this.items[this.lastCenteredOriginalIndex]) {
      return this.items[this.lastCenteredOriginalIndex].id;
    }
    return null;
  }

  private addEventListeners() {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    this.container.addEventListener('wheel', this.onWheel, { passive: false });
    this.container.addEventListener('pointerdown', this.onPointerDown);
    this.container.addEventListener('pointermove', this.onPointerMove);
    this.container.addEventListener('pointerup', this.onPointerUp);
    this.container.addEventListener('pointercancel', this.onPointerUp);

    this.gl.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      console.warn('WebGL context lost in CircularGallery.');
      this.options.onContextLost?.();
    });
  }

  public destroy() {
    if (this.raf !== null) {
      window.cancelAnimationFrame(this.raf);
      this.raf = null;
    }

    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    this.container.removeEventListener('wheel', this.onWheel);
    this.container.removeEventListener('pointerdown', this.onPointerDown);
    this.container.removeEventListener('pointermove', this.onPointerMove);
    this.container.removeEventListener('pointerup', this.onPointerUp);
    this.container.removeEventListener('pointercancel', this.onPointerUp);

    if (this.medias) {
      for (const m of this.medias) {
        m.destroy();
      }
      this.medias = [];
    }

    if (this.gl && this.gl.canvas && this.gl.canvas.parentNode) {
      this.gl.canvas.parentNode.removeChild(this.gl.canvas);
    }
  }
}
