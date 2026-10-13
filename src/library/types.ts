import { SerializedProject } from '../audio/projectState';

export type ProjectData = SerializedProject;

export interface SimplifiedPoint {
  x: number;
  y: number;
}

export interface SimplifiedStroke {
  trackId: string;
  points: SimplifiedPoint[];
  width: number;
}

export type SyncStatus = 'synced' | 'syncing' | 'local' | 'error';

export interface CreationMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  bpm: number;
  bars: number;
  rootNote: number;
  scaleName: string;
  keyLabel: string;
  trackColors: string[];
  strokeCount: number;
  simplifiedStrokes: SimplifiedStroke[];
  syncStatus?: SyncStatus;
  isPublic?: boolean;
  publicSlug?: string | null;
}

export interface Creation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  project: ProjectData;
  schemaVersion: number;
  preview?: any;
  syncStatus?: SyncStatus;
  isPublic?: boolean;
  publicSlug?: string | null;
}

export interface CreationStore {
  isInMemory?: boolean;
  list(): Promise<CreationMeta[]>;
  get(id: string): Promise<Creation | null>;
  save(c: Creation): Promise<void>;
  remove(id: string): Promise<void>;
  getAllFull?(): Promise<Creation[]>;
  setPublic?(id: string, isPublic: boolean): Promise<string | null>;
  getPublicCreation?(slug: string): Promise<Creation | null>;
}
