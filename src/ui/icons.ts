// Hairline line-art icons (24×24, stroke = currentColor). Hand-tuned for a quiet, inked look.

const wrap = (body: string, sw = 1.5) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

/** Four-point spark, the game's star. */
export const SPARK_PATH = 'M12 2.2c.5 5.3 2.2 7.2 9.8 9.8-7.6 2.6-9.3 4.5-9.8 9.8-.5-5.3-2.2-7.2-9.8-9.8 7.6-2.6 9.3-4.5 9.8-9.8z';

export const ICONS = {
  go: wrap('<path d="M8.6 5.8c0-.9 1-1.4 1.7-.9l8.4 6.2c.6.5.6 1.3 0 1.8l-8.4 6.2c-.7.5-1.7 0-1.7-.9z" fill="currentColor" stroke-width="1"/>'),
  stop: wrap('<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke-width="1"/>'),
  retry: wrap('<path d="M18.6 13.2A6.8 6.8 0 1 1 16.8 7"/><path d="M17.6 3.6l-.4 3.9-3.9-.3"/>', 1.6),
  undo: wrap('<path d="M8.6 13.6L4.4 9.4l4.2-4.2"/><path d="M4.6 9.4h9.2a5.6 5.6 0 0 1 0 11.2H10"/>', 1.6),
  clear: wrap('<path d="M5 7h14M10 4.2h4M7 7l.8 12a1.6 1.6 0 0 0 1.6 1.5h5.2a1.6 1.6 0 0 0 1.6-1.5L17 7"/>'),
  hint: wrap('<path d="M9.6 17.6h4.8M10.2 20.4h3.6"/><path d="M12 3.4a5.6 5.6 0 0 0-3.3 10.1c.5.4.8 1 .8 1.6v.4h5v-.4c0-.6.3-1.2.8-1.6A5.6 5.6 0 0 0 12 3.4z"/>'),
  pause: wrap('<path d="M9.2 6.5v11M14.8 6.5v11"/>', 1.9),
  close: wrap('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
  home: wrap('<path d="M4.5 11.2L12 5l7.5 6.2"/><path d="M6.8 9.6v9.4h10.4V9.6"/><path d="M10.4 19v-4.4h3.2V19"/>'),
  map: wrap('<path d="M3.5 7l5.5-2.2 6 2.2 5.5-2.2v12.4l-5.5 2.2-6-2.2-5.5 2.2z"/><path d="M9 4.8v12.4M15 7v12.4"/>'),
  journey: wrap('<path d="M3.5 17.5c3-.2 3.6-4.3 6.3-4.6 2.7-.3 3 3.2 5.6 2.6 2.4-.6 2.3-5.6 5.1-6.4" stroke-dasharray="0.1 2.6" stroke-width="1.8"/><circle cx="20.5" cy="7.2" r="1.6"/>'),
  next: wrap('<path d="M5 12h13.5M13.5 6.8l5.2 5.2-5.2 5.2"/>'),
  back: wrap('<path d="M19 12H5.5M10.5 6.8L5.3 12l5.2 5.2"/>'),
  gear: wrap('<circle cx="12" cy="12" r="2.8"/><path d="M12 3.2v2.2M12 18.6v2.2M5.8 5.8l1.5 1.5M16.7 16.7l1.5 1.5M3.2 12h2.2M18.6 12h2.2M5.8 18.2l1.5-1.5M16.7 7.3l1.5-1.5"/>'),
  sound: wrap('<path d="M4.5 9.6h3L12 5.8v12.4l-4.5-3.8h-3z"/><path d="M15.6 9.2a4 4 0 0 1 0 5.6M18.2 6.8a7.4 7.4 0 0 1 0 10.4"/>'),
  music: wrap('<path d="M9 17.6V6.4l10-2.2v11.2"/><circle cx="6.6" cy="17.6" r="2.4"/><circle cx="16.6" cy="15.4" r="2.4"/>'),
  hand: wrap('<path d="M8 13V5.6a1.5 1.5 0 0 1 3 0V11M11 10.6V4.2a1.5 1.5 0 0 1 3 0v6.4M14 10.6V5.6a1.5 1.5 0 0 1 3 0V14c0 4-2.5 6.5-6 6.5-2.6 0-4-1.3-5.3-3.4L4 14.2a1.4 1.4 0 0 1 2.3-1.6L8 14.5"/>'),
  spark: wrap(`<path d="${SPARK_PATH}" fill="currentColor" stroke-width="0.6"/>`),
  sparkOutline: wrap(`<path d="${SPARK_PATH}"/>`, 1.1),
  lamp: wrap('<path d="M12 2.6v1.8"/><path d="M9.2 4.4h5.6"/><path d="M8.6 6.4c-1.4 1.6-1.9 3.5-1.9 5.4s.6 3.9 1.9 5.4h6.8c1.3-1.5 1.9-3.5 1.9-5.4s-.5-3.8-1.9-5.4z"/><path d="M12 6.4v10.8" stroke-width="0.9"/><path d="M9.6 19.4h4.8"/>'),
  vibrate: wrap('<rect x="8" y="4" width="8" height="16" rx="2"/><path d="M4.6 9v6M19.4 9v6"/>'),
  motion: wrap('<path d="M3 12c3-4.6 6-4.6 9 0s6 4.6 9 0"/>'),
  phone: wrap('<rect x="7" y="2.8" width="10" height="18.4" rx="2.4"/><path d="M11 18.2h2"/>'),
  skip: wrap('<path d="M6 6.5l6.5 5.5L6 17.5zM13 6.5l6.5 5.5-6.5 5.5z" stroke-width="1.3"/>'),
  ink: wrap('<path d="M5 19c3.2-.3 4.6-3.2 6.6-6.8 1.8-3.3 3.4-6 7.4-7.2"/><path d="M17.2 3.8l2.8 2.6-1.8 1.9-2.8-2.6z" fill="currentColor"/>'),
  credits: wrap('<path d="M12 20.4s-7.4-4.4-7.4-9.6A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 7.4 2.8c0 5.2-7.4 9.6-7.4 9.6z"/>'),
  reset: wrap('<path d="M4.6 12a7.4 7.4 0 1 0 2.2-5.2"/><path d="M4.4 3.8v3.6H8"/>'),
};

export type IconName = keyof typeof ICONS;
