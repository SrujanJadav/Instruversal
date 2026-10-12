import { ExampleSong } from './types';
import { convertNotesToStrokes } from './notesToStrokes';
import { ProjectData } from '../library/types';
import { Stroke } from '../state';

export interface ExampleCardMeta {
  id: string;
  title: string;
  credit: string;
  subtitle: string;
}

export const EXAMPLE_METAS: ExampleCardMeta[] = [
  {
    id: 'example-ode-to-joy',
    title: 'Ode to Joy',
    credit: 'Ludwig van Beethoven',
    subtitle: 'Tap to play and explore',
  },
  {
    id: 'example-marimba-pop',
    title: 'Marimba Pop (original)',
    credit: 'Original',
    subtitle: 'Tap to play and explore',
  },
  {
    id: 'example-dreamy-arpeggio',
    title: 'Dreamy Arpeggio',
    credit: 'Original',
    subtitle: 'Tap to play and explore',
  },
];

export async function loadExampleSong(id: string): Promise<ExampleSong> {
  switch (id) {
    case 'example-ode-to-joy': {
      const mod = await import('./odeToJoy');
      return mod.ODE_TO_JOY;
    }
    case 'example-marimba-pop': {
      const mod = await import('./marimbaPop');
      return mod.MARIMBA_POP;
    }
    case 'example-dreamy-arpeggio': {
      const mod = await import('./dreamyArpeggio');
      return mod.DREAMY_ARPEGGIO;
    }
    default:
      throw new Error(`Unknown example ID: ${id}`);
  }
}

export async function loadExampleProject(id: string): Promise<{
  project: ProjectData;
  strokes: Stroke[];
  song: ExampleSong;
}> {
  const song = await loadExampleSong(id);
  const { strokes, project } = convertNotesToStrokes(song);
  return { project, strokes, song };
}
