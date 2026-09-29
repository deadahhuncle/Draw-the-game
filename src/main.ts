import '@fontsource-variable/fraunces/full.css';
import '@fontsource-variable/fraunces/full-italic.css';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';
import '@fontsource-variable/caveat';
import './styles/main.css';
import { App } from './ui/app';

const params = new URLSearchParams(location.search);
const root = document.getElementById('app')!;
const app = new App(root, {
  level: params.get('level') ?? undefined,
  solve: params.has('solve'),
  go: params.has('go'),
  unlock: params.has('unlock'),
});

// Canvas text (handwritten notes) needs the fonts before the first static layers are built.
Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1200))]).finally(() => app.start());

// Block page gestures that fight with drawing (pinch zoom, pull-to-refresh, double-tap zoom).
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
