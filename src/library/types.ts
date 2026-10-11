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

export interface CreationMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  bpm: number;
  rootNote: number;
  scaleName: string;
  keyLabel: string;
  trackColors: string[];
  strokeCount: number;
  simplifiedStrokes: SimplifiedStroke[];
}

export interface Creation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  project: ProjectData;
  schemaVersion: number;
}

export interface CreationStore {
  isInMemory?: boolean;
  list(): Promise<CreationMeta[]>;
  get(id: string): Promise<Creation | null>;
  save(c: Creation): Promise<void>;
  remove(id: string): Promise<void>;
  getAllFull?(): Promise<Creation[]>;
}
