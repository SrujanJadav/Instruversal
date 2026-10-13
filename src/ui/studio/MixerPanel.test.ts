import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Song, SongLane } from '../../song/types';
import { SongPlaybackEngine } from '../../song/playbackEngine';

// Lightweight DOM mock for headless testing in Node/Vitest
class MockElement {
  public tagName: string;
  public className: string = '';
  public id: string = '';
  public attributes: Map<string, string> = new Map();
  public dataset: Record<string, string> = {};
  public style: Record<string, string> = {};
  public classList = {
    add: (c: string) => {
      const classes = new Set(this.className.split(/\s+/).filter(Boolean));
      classes.add(c);
      this.className = Array.from(classes).join(' ');
    },
    remove: (c: string) => {
      const classes = new Set(this.className.split(/\s+/).filter(Boolean));
      classes.delete(c);
      this.className = Array.from(classes).join(' ');
    },
    contains: (c: string) => this.className.split(/\s+/).includes(c),
  };
  public children: MockElement[] = [];
  public listeners: Map<string, Function[]> = new Map();
  public value: string = '';
  public textContent: string = '';
  public checked: boolean = false;
  private _innerHTML: string = '';

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(k: string, v: string) {
    this.attributes.set(k, v);
    if (k === 'id') this.id = v;
    if (k === 'class') this.className = v;
    if (k.startsWith('data-')) {
      const camel = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      this.dataset[camel] = v;
    }
  }

  getAttribute(k: string) {
    return this.attributes.get(k) ?? null;
  }

  removeAttribute(k: string) {
    this.attributes.delete(k);
  }

  addEventListener(type: string, fn: Function) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(fn);
  }

  removeEventListener(type: string, fn: Function) {
    const list = this.listeners.get(type);
    if (list) this.listeners.set(type, list.filter((f) => f !== fn));
  }

  dispatchEvent(event: any) {
    const list = this.listeners.get(event.type);
    if (list) list.forEach((fn) => fn(event));
    return true;
  }

  click() {
    this.dispatchEvent({ type: 'click', target: this });
  }

  get innerHTML(): string {
    return this._innerHTML;
  }

  set innerHTML(html: string) {
    this._innerHTML = html;
    this.children = parseHTML(html);
  }

  querySelector<T extends MockElement>(selector: string): T | null {
    const list = this.querySelectorAll<T>(selector);
    return list.length > 0 ? list[0] : null;
  }

  querySelectorAll<T extends MockElement>(selector: string): T[] {
    const results: T[] = [];
    const traverse = (el: MockElement) => {
      for (const child of el.children) {
        if (matchesSelector(child, selector)) {
          results.push(child as unknown as T);
        }
        traverse(child);
      }
    };
    traverse(this);
    return results;
  }
}

function matchesSelector(el: MockElement, selector: string): boolean {
  const parts = selector.match(/(#[a-zA-Z0-9_-]+|\.[a-zA-Z0-9_-]+|\[[a-zA-Z0-9_-]+(?:=[^\]]+)?\]|[a-zA-Z0-9_-]+)/g);
  if (!parts) return false;

  for (const part of parts) {
    if (part.startsWith('#')) {
      if (el.id !== part.slice(1)) return false;
    } else if (part.startsWith('.')) {
      if (!el.classList.contains(part.slice(1))) return false;
    } else if (part.startsWith('[') && part.endsWith(']')) {
      const inner = part.slice(1, -1);
      if (inner.includes('=')) {
        const [attr, rawVal] = inner.split('=');
        const val = rawVal.replace(/^["']|["']$/g, '');
        if (el.getAttribute(attr) !== val) return false;
      } else {
        if (!el.attributes.has(inner)) return false;
      }
    } else {
      if (el.tagName.toLowerCase() !== part.toLowerCase()) return false;
    }
  }
  return true;
}

function parseHTML(html: string): MockElement[] {
  const rootElements: MockElement[] = [];
  const stack: MockElement[] = [];
  const voidTags = new Set(['input', 'img', 'br', 'hr', 'meta', 'link']);

  const tokenRegex = /<\/?([a-zA-Z0-9-]+)([^>]*)>|<!--[\s\S]*?-->/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(html)) !== null) {
    const rawTag = match[0];
    if (rawTag.startsWith('<!--')) continue;

    const isClosing = rawTag.startsWith('</');
    const tagName = match[1].toLowerCase();

    if (isClosing) {
      if (stack.length > 0 && stack[stack.length - 1].tagName.toLowerCase() === tagName) {
        stack.pop();
      }
    } else {
      const attrStr = match[2];
      const isSelfClosing = attrStr.trim().endsWith('/') || voidTags.has(tagName);
      const el = new MockElement(tagName);

      const attrRegex = /([a-zA-Z0-9_-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      let attrMatch: RegExpExecArray | null;
      while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
        const attrName = attrMatch[1];
        if (attrName === '/') continue;
        const attrVal = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
        el.setAttribute(attrName, attrVal);
        if (attrName === 'value') el.value = attrVal;
        if (attrName === 'checked') el.checked = true;
      }

      if (stack.length > 0) {
        stack[stack.length - 1].children.push(el);
      } else {
        rootElements.push(el);
      }

      if (!isSelfClosing) {
        stack.push(el);
      }
    }
  }

  return rootElements;
}

if (typeof globalThis.document === 'undefined') {
  (globalThis as any).document = {
    createElement: (tag: string) => new MockElement(tag),
  };
}

if (typeof globalThis.requestAnimationFrame === 'undefined') {
  (globalThis as any).requestAnimationFrame = (cb: Function) => setTimeout(() => cb(Date.now()), 16);
  (globalThis as any).cancelAnimationFrame = (id: any) => clearTimeout(id);
}

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    requestAnimationFrame: (cb: Function) => setTimeout(() => cb(Date.now()), 16),
    cancelAnimationFrame: (id: any) => clearTimeout(id),
    setTimeout: (fn: Function, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: any) => clearTimeout(id),
  };
}

// Now import MixerPanel
import { MixerPanel } from './MixerPanel';

describe('MixerPanel Component', () => {
  const sampleLane: SongLane = {
    id: 'lane-1',
    name: 'Lead Lane',
    volumeDb: 0,
    pan: 0,
    mute: false,
    solo: false,
    sendReverb: 0.2,
    sendDelay: 0.1,
  };

  const sampleSong: Song = {
    id: 'song-test',
    title: 'Test Song',
    bpm: 110,
    beatsPerBar: 4,
    totalBars: 16,
    schemaVersion: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lanes: [sampleLane],
    assets: {},
    placements: [],
    markers: [],
    loopRegion: null,
    master: {
      preset: 'clean',
      gainDb: 0,
      eq: { lowDb: 0, midDb: 0, highDb: 0 },
      compressor: { on: true, thresholdDb: -18, ratio: 2.5, attackMs: 30, releaseMs: 100, makeupDb: 0 },
      effects: {} as any,
    },
  };

  let mockEngine: SongPlaybackEngine;

  beforeEach(() => {
    mockEngine = {
      getLaneMeterLevel: vi.fn().mockReturnValue(-12),
      getMasterMeterLevel: vi.fn().mockReturnValue({ peakDb: -6, rmsDb: -14 }),
    } as any;
  });

  it('renders channel strips and master section', () => {
    const onUpdateLane = vi.fn();
    const onUpdateMaster = vi.fn();
    const onAutoBalance = vi.fn();
    const onOpenEffects = vi.fn();
    const onClose = vi.fn();

    const panel = new MixerPanel(sampleSong, mockEngine, {
      onUpdateLane,
      onUpdateMaster,
      onAutoBalance,
      onOpenEffects,
      onClose,
    });

    panel.open();

    expect(panel.element.style.display).toBe('flex');
    expect(panel.element.querySelector('.studio-channel-strip')).toBeDefined();
    expect(panel.element.querySelector('.studio-master-strip')).toBeDefined();

    // Volume fader exists
    const volSlider = panel.element.querySelector<any>('[data-control="volume"]');
    expect(volSlider).toBeDefined();
    expect(volSlider?.value).toBe('0');

    // Presets exist
    const presetBtn = panel.element.querySelector<any>('[data-preset="warm"]');
    expect(presetBtn).toBeDefined();

    presetBtn?.click();
    expect(onUpdateMaster).toHaveBeenCalledWith(
      expect.objectContaining({
        preset: 'warm',
        eq: expect.objectContaining({ lowDb: 2 }),
      })
    );

    panel.dispose();
  });

  it('triggers lane updates on slider and mute/solo interactions', () => {
    const onUpdateLane = vi.fn();
    const onUpdateMaster = vi.fn();

    const panel = new MixerPanel(sampleSong, mockEngine, {
      onUpdateLane,
      onUpdateMaster,
      onAutoBalance: vi.fn(),
      onOpenEffects: vi.fn(),
      onClose: vi.fn(),
    });

    panel.open();

    const muteBtn = panel.element.querySelector<any>('[data-action="mute"]');
    muteBtn?.click();
    expect(onUpdateLane).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'lane-1',
        mute: true,
      })
    );

    const soloBtn = panel.element.querySelector<any>('[data-action="solo"]');
    soloBtn?.click();
    expect(onUpdateLane).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'lane-1',
        solo: true,
      })
    );

    panel.dispose();
  });
});
