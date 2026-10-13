import { Song } from '../../song/types';

export class StudioHistory {
  private undoStack: Song[] = [];
  private redoStack: Song[] = [];
  private readonly maxDepth: number = 50;

  constructor(initialSong: Song) {
    this.undoStack = [JSON.parse(JSON.stringify(initialSong))];
    this.redoStack = [];
  }

  public pushState(song: Song): void {
    const clone = JSON.parse(JSON.stringify(song));
    this.undoStack.push(clone);
    if (this.undoStack.length > this.maxDepth + 1) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  public canUndo(): boolean {
    return this.undoStack.length > 1;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public undo(): Song | null {
    if (!this.canUndo()) return null;
    const current = this.undoStack.pop()!;
    this.redoStack.push(current);
    const previous = this.undoStack[this.undoStack.length - 1];
    return JSON.parse(JSON.stringify(previous));
  }

  public redo(): Song | null {
    if (!this.canRedo()) return null;
    const next = this.redoStack.pop()!;
    this.undoStack.push(next);
    return JSON.parse(JSON.stringify(next));
  }
}
