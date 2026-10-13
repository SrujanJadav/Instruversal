import { describe, it, expect } from 'vitest';
import { StudioHistory } from './StudioHistory';
import { createSongFromCreation } from '../../song/helpers';
import { Creation } from '../../library/types';
import { SongPlacement, SongLane } from '../../song/types';

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
  public tabIndex: number = -1;
  private _innerHTML: string = '';

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(k: string, v: string) {
    this.attributes.set(k, v);
    if (k === 'id') this.id = v;
    if (k === 'class') this.className = v;
    if (k === 'tabindex') this.tabIndex = parseInt(v, 10);
    if (k.startsWith('data-')) {
      const camel = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      this.dataset[camel] = v;
    }
  }

  getAttribute(k: string) {
    if (k === 'tabindex') return String(this.tabIndex);
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

  focus() {}

  appendChild(child: MockElement) {
    this.children.push(child);
    return child;
  }

  getContext() {
    return new Proxy(
      {},
      {
        get: (_target, prop) => {
          if (typeof prop === 'string') {
            return () => {};
          }
          return undefined;
        },
        set: () => true,
      }
    );
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
        if (attr.startsWith('data-')) {
          const camel = attr.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          if (el.dataset[camel] !== val && el.getAttribute(attr) !== val) return false;
        } else if (el.getAttribute(attr) !== val) {
          return false;
        }
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

// Now import Timeline after DOM mock is ready
import { Timeline } from './Timeline';

describe('Studio History & Timeline Interaction Logic (Step 7)', () => {
  const sampleCreation: Creation = {
    id: 'c-test-1',
    title: 'Sunny Day',
    createdAt: 1000,
    updatedAt: 2000,
    schemaVersion: 3,
    project: {
      version: 3,
      bpm: 100,
      bars: 2,
      rootNote: 0,
      scaleName: 'major pentatonic',
      playbackMode: 'flow',
      glide: 30,
      tracks: [],
      strokes: [],
    },
  };

  it('manages per-song undo/redo history correctly', () => {
    const song = createSongFromCreation(sampleCreation);
    const history = new StudioHistory(song);

    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);

    // Edit 1: change title
    const song2 = { ...song, title: 'Updated Title' };
    history.pushState(song2);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);

    // Edit 2: add a placement
    const newPlacement: SongPlacement = {
      id: 'p-2',
      assetId: 'asset-1',
      laneId: 'lane-1',
      startBar: 4,
      lengthBars: 4,
      offsetBars: 0,
      gainDb: 0,
      transpose: 0,
      fadeInBars: 0,
      fadeOutBars: 0,
      mute: false,
    };
    const song3 = { ...song2, placements: [...song2.placements, newPlacement] };
    history.pushState(song3);

    // Undo edit 2
    const undone1 = history.undo();
    expect(undone1).not.toBeNull();
    expect(undone1?.placements.length).toBe(1);
    expect(undone1?.title).toBe('Updated Title');
    expect(history.canRedo()).toBe(true);

    // Undo edit 1
    const undone2 = history.undo();
    expect(undone2).not.toBeNull();
    expect(undone2?.title).toBe('Sunny Day Song');

    // Redo edit 1
    const redone1 = history.redo();
    expect(redone1).not.toBeNull();
    expect(redone1?.title).toBe('Updated Title');
  });

  it('caps history stack at maximum depth', () => {
    const song = createSongFromCreation(sampleCreation);
    const history = new StudioHistory(song);

    for (let i = 0; i < 60; i++) {
      history.pushState({ ...song, title: `Title ${i}` });
    }

    let undoCount = 0;
    while (history.canUndo()) {
      history.undo();
      undoCount++;
    }

    // Depth is capped at 50
    expect(undoCount).toBe(50);
  });

  it('regression: Lane 2 can be selected and navigated via arrow keys', () => {
    const song = createSongFromCreation(sampleCreation);
    const lane2: SongLane = {
      id: 'lane-2',
      name: 'Lane 2',
      volumeDb: 0,
      pan: 0,
      mute: false,
      solo: false,
      sendReverb: 0,
      sendDelay: 0,
    };
    const multiLaneSong = { ...song, lanes: [...song.lanes, lane2] };

    let selectedLaneFromCallback: string | null = null;
    const timeline = new Timeline(multiLaneSong, {
      onSelectPlacement: () => {},
      onUpdatePlacement: () => {},
      onDeletePlacement: () => {},
      onDuplicatePlacement: () => {},
      onSplitPlacement: () => {},
      onAddLane: () => {},
      onRemoveLane: () => {},
      onUpdateLane: () => {},
      onAddMarker: () => {},
      onSetLoopRegion: () => {},
      onSeek: () => {},
      onAddDrawingClick: () => {},
      onSelectLane: (id) => {
        selectedLaneFromCallback = id;
      },
    });

    // Initial selected lane defaults to lane 1
    expect(timeline.getSelectedLaneId()).toBe(song.lanes[0].id);

    // Selecting Lane 2 updates selected lane
    timeline.selectLane('lane-2');
    expect(timeline.getSelectedLaneId()).toBe('lane-2');
    expect(selectedLaneFromCallback).toBe('lane-2');

    // Lane row elements have accessibility attributes and selected class
    const lane2Row = timeline.element.querySelector('[data-lane-id="lane-2"]');
    expect(lane2Row).not.toBeNull();
    expect(lane2Row?.classList.contains('selected')).toBe(true);
    expect(lane2Row?.getAttribute('tabindex')).toBe('0');
  });
});
