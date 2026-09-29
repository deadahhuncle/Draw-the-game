import '@fontsource-variable/fraunces/full.css';
import '@fontsource-variable/fraunces/full-italic.css';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';
import '@fontsource-variable/caveat';
import './styles/main.css';
import { App } from './ui/app';
import { registerServiceWorker, installTouchGuards } from './ui/pwa';
import { installAudio } from './audio/audio';
import { InklightAudio } from './audio/engine';

installAudio(new InklightAudio());

const params = new URLSearchParams(location.search);
const root = document.getElementById('app')!;
const app = new App(root, {
  level: params.get('level') ?? undefined,
  solve: params.has('solve'),
  go: params.has('go'),
  unlock: params.has('unlock'),
  screen: params.get('screen') ?? undefined,
  done: params.has('done') ? Number(params.get('done')) || 0 : undefined,
  from: params.get('from') ?? undefined,
});

// Canvas text (handwritten notes) needs the fonts before the first static layers are built.
Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1200))]).finally(() => {
  app.start();
  root.classList.add('ready');
});

installTouchGuards();
registerServiceWorker();
