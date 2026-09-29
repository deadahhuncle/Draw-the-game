// Hairline line-art icons (24×24, stroke = currentColor). Hand-tuned for a quiet, inked look.

const wrap = (body: string, sw = 1.6) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  go: wrap('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke-width="1.2"/>'),
  stop: wrap('<rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke-width="1.2"/>'),
  retry: wrap('<path d="M19 12a7 7 0 1 1-2.05-4.95"/><path d="M19 4.5v4h-4"/>'),
  undo: wrap('<path d="M9 14L4.5 9.5 9 5"/><path d="M4.5 9.5H14a5.5 5.5 0 0 1 0 11h-3"/>'),
  clear: wrap('<path d="M5 7h14M10 4h4M7 7l.8 12.2A1.5 1.5 0 0 0 9.3 20.6h5.4a1.5 1.5 0 0 0 1.5-1.4L17 7"/>'),
  hint: wrap('<path d="M9.5 17.5h5M10 20.5h4"/><path d="M12 3.5a5.5 5.5 0 0 0-3.2 10c.5.4.7.9.7 1.5v.5h5v-.5c0-.6.2-1.1.7-1.5A5.5 5.5 0 0 0 12 3.5z"/>'),
  pause: wrap('<path d="M9 6v12M15 6v12"/>', 2),
  close: wrap('<path d="M6 6l12 12M18 6L6 18"/>'),
  home: wrap('<path d="M4 11l8-6.5 8 6.5"/><path d="M6.5 9.5V19h11V9.5"/>'),
  map: wrap('<path d="M4 6.5l5-2 6 2 5-2v13l-5 2-6-2-5 2z"/><path d="M9 4.5v13M15 6.5v13"/>'),
  next: wrap('<path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5"/>'),
  gear: wrap('<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7"/>'),
  sound: wrap('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  music: wrap('<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>'),
  hand: wrap('<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5M14 10.5V5.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 6.5-6 6.5-2.6 0-4-1.3-5.3-3.4L4 14.2a1.4 1.4 0 0 1 2.3-1.6L8 14.5"/>'),
  spark: wrap('<path d="M12 2.5l1.9 7.6 7.6 1.9-7.6 1.9L12 21.5l-1.9-7.6L2.5 12l7.6-1.9z" fill="currentColor" stroke-width="1"/>'),
  sparkOutline: wrap('<path d="M12 2.5l1.9 7.6 7.6 1.9-7.6 1.9L12 21.5l-1.9-7.6L2.5 12l7.6-1.9z"/>', 1.3),
  lamp: wrap('<path d="M12 2.5v2"/><path d="M9 4.5h6"/><path d="M8.5 6.5c-1.5 1.6-2 3.5-2 5.5s.6 4 2 5.5h7c1.4-1.5 2-3.5 2-5.5s-.5-3.9-2-5.5z"/><path d="M9.5 19.5h5"/>'),
  vibrate: wrap('<rect x="8" y="4" width="8" height="16" rx="2"/><path d="M4.5 9v6M19.5 9v6"/>'),
  motion: wrap('<path d="M3 12c3-5 6-5 9 0s6 5 9 0"/>'),
};

export type IconName = keyof typeof ICONS;
