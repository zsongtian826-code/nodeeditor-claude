import type { SVGProps } from 'react';

const PATHS = {
  play: 'M8 5l11 7-11 7z',
  action: 'M13 3L5 14h6l-1 7 8-11h-6z',
  branch: 'M12 3l9 9-9 9-9-9z',
  stop: 'M6 6h12v12H6z',
  note: 'M5 4h14v11l-5 5H5z M14 20v-5h5',
  undo: 'M9 14L4 9l5-5 M4 9h9a6 6 0 010 12h-3',
  redo: 'M15 14l5-5-5-5 M20 9h-9a6 6 0 000 12h3',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  fit: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5',
  move: 'M12 3v18M3 12h18 M12 3l-3 3m3-3l3 3 M12 21l-3-3m3 3l3-3 M3 12l3-3m-3 3l3 3 M21 12l-3-3m3 3l-3 3',
  cursor: 'M5 3l14 7-6 2-2 6z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  warning: 'M12 3l10 18H2z M12 10v5 M12 18v.01',
  check: 'M5 12l5 5 9-10',
  cross: 'M6 6l12 12M18 6L6 18',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  copy: 'M8 8h11v12H8z M5 16V4h11',
  group: 'M3 8V3h5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5 M8 8h8v8H8z',
  ungroup: 'M3 8V3h5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5 M6 6l12 12',
  download: 'M12 4v12 M7 11l5 5 5-5 M5 20h14',
  upload: 'M12 16V4 M7 9l5-5 5 5 M5 20h14',
  file: 'M6 3h8l4 4v14H6z M14 3v4h4',
  markdown: 'M3 6h18v12H3z M7 15V9l2.5 3L12 9v6 M16 9v6 M14 13l2 2 2-2',
  sun: 'M12 8a4 4 0 100 8 4 4 0 000-8z M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5L19 19 M5 19l1.5-1.5 M17.5 6.5L19 5',
  moon: 'M20 14A8 8 0 1110 4a7 7 0 0010 10z',
  help: 'M12 3a9 9 0 100 18 9 9 0 000-18z M9.5 9.5a2.5 2.5 0 114 2c-1 .8-1.5 1.2-1.5 2.5 M12 17v.01',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14z M20 20l-4-4',
  layout: 'M4 5h6v4H4z M14 5h6v4h-6z M9 15h6v4H9z M7 9v3h10V9 M12 12v3',
  map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14',
  sheet: 'M4 15l8-8 8 8',
  chevronDown: 'M6 9l6 6 6-6',
  sliders: 'M5 5v14 M12 5v14 M19 5v14 M3 9h4 M10 14h4 M17 8h4',
  newfile: 'M6 3h8l4 4v14H6z M14 3v4h4 M12 11v6 M9 14h6',
  keyboard: 'M3 6h18v12H3z M7 10h.01 M11 10h.01 M15 10h.01 M7 14h10',
  multi: 'M4 4h8v8H4z M12 12h8v8h-8z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  const filled = name === 'play' || name === 'stop';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 1.5 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export const NODE_ICON: Record<string, IconName> = {
  start: 'play',
  action: 'action',
  condition: 'branch',
  end: 'stop',
  note: 'note',
};
