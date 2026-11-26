import type { CSSProperties } from 'react';

/**
 * Line icons on a 24px grid, 1.75 stroke. Direction-aware icons (arrows, chevrons, cart)
 * carry the `flip` class and mirror automatically under dir="rtl".
 */
const paths = {
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  bag: 'M5 8h14l-1.2 12.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8zM9 8V6a3 3 0 0 1 6 0v2',
  heart: 'M12 20s-7.5-4.6-9.2-9.4C1.6 7.2 3.8 4 7.2 4c2 0 3.6 1.1 4.8 2.8C13.2 5.1 14.8 4 16.8 4c3.4 0 5.6 3.2 4.4 6.6C19.5 15.4 12 20 12 20z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  menu: 'M4 7h16M4 12h16M4 17h10',
  x: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-start': 'M15 6l-6 6 6 6',
  'chevron-end': 'M9 6l6 6-6 6',
  'arrow-end': 'M5 12h14M13 6l6 6-6 6',
  'arrow-start': 'M19 12H5M11 6l-6 6 6 6',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z',
  truck: 'M2 6h11v10H2zM13 9h4.5l3.5 3.5V16h-8M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  split: 'M4 12h16M4 6h7M4 18h7M15 6h5M15 18h5',
  return: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  filter: 'M4 6h16M7 12h10M10 18h4',
  refresh: 'M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4',
  'cloud-off': 'M3 3l18 18M8 7.4A6 6 0 0 1 17.8 11 4 4 0 0 1 20 18.5M16.5 19H7a4 4 0 0 1-1.6-7.7',
  alert: 'M12 3l10 18H2zM12 10v4M12 17.5v.5',
  lock: 'M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3',
  pin: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  share: 'M18 8a3 3 0 1 0 0-.01M6 15a3 3 0 1 0 0-.01M18 22a3 3 0 1 0 0-.01M8.6 13.5l6.8-4M8.6 16.5l6.8 4',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  tag: 'M3 12V4h8l10 10-8 8zM7.5 8.5h.01',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M22 21a7 7 0 0 0-4-6.3',
  store: 'M4 10v10h16V10M2 10l2-6h16l2 6zM9 20v-6h6v6',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  sparkle: 'M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z',
  card: 'M2 6h20v12H2zM2 10h20M6 15h4',
  cash: 'M2 7h20v10H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 10v4M18 10v4',
  phone: 'M8 2h8v20H8zM11 18h2',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  'external': 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  code: 'M8 7l-5 5 5 5M16 7l5 5-5 5',
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
  bike: 'M5.5 19a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM18.5 19a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5.5 15.5 9 8h5l4.5 7.5M12 15.5 9 8M14 5h3',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  fire: 'M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-5 5-5 8-1-1-2-2-2-4-2 2-2 5-2 8 0 4 3 7 7 7z',
  percent: 'M19 5 5 19M7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  chef: 'M7 14v6h10v-6M6 14a4 4 0 0 1-1-7.9A5 5 0 0 1 12 3a5 5 0 0 1 7 3.1A4 4 0 0 1 18 14z',
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
  pause: 'M7 4h3v16H7zM14 4h3v16h-3z',
  play: 'M7 4l13 8-13 8z',
  board: 'M4 4h5v16H4zM10 4h5v10h-5zM16 4h4v7h-4z',
  bed: 'M3 18V7M3 13h18v5M21 18v-5a3 3 0 0 0-3-3h-7v3M7 11.5a1.5 1.5 0 1 0 0-.01',
  bath: 'M4 12h16v3a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM6 12V5a2 2 0 0 1 4 0M7 20l-1 2M17 20l1 2',
  ruler: 'M3 17 17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',
  calendar: 'M4 6h16v15H4zM4 10h16M8 3v5M16 3v5',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
  key: 'M15 7a4 4 0 1 0-3.5 5.9L4 20v-3h3v-3h3l1.5-1.5',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  columns: 'M4 4h5v16H4zM10 4h4v16h-4zM15 4h5v16h-5z',
  building: 'M4 21V5l8-3v19M12 9h8v12M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2M2 21h20',
  chat: 'M4 5h16v11H9l-5 4z',
  trending: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  pool: 'M3 18c2 0 2-1.5 4.5-1.5S9.5 18 12 18s2.5-1.5 4.5-1.5S19 18 21 18M3 14c2 0 2-1.5 4.5-1.5S9.5 14 12 14s2.5-1.5 4.5-1.5S19 14 21 14M8 12V5a2 2 0 0 1 4 0M14 12V5a2 2 0 0 1 4 0M8 8h6',
  tent: 'M3 20 12 4l9 16zM12 4v16M9 20l3-6 3 6',
  palm: 'M12 21v-9M12 12c-1-4-5-5-8-4 3 0 5 2 6 4M12 12c1-4 5-5 8-4-3 0-5 2-6 4M12 12c-3-2-6-1-7 1 2-1 4 0 5 1M12 12c3-2 6-1 7 1-2-1-4 0-5 1',
  wifi: 'M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0M12 19.5h.01',
  tv: 'M3 5h18v12H3zM8 21h8M12 17v4',
  ball: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7l4 3-1.5 4.5h-5L8 10z',
  grill: 'M4 10h16a8 8 0 0 1-16 0zM8 18l-2 4M16 18l2 4M9 6c0-1 1-1 1-2M13 6c0-1 1-1 1-2',
  sofa: 'M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3M2 12a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v6H2zM5 18v2M19 18v2',
  mountain: 'M2 20 9 8l4 6 3-4 6 10z',
  door: 'M6 21V3h12v18M3 21h18M14 12h.01',
  gift: 'M3 9h18v4H3zM5 13v8h14v-8M12 9v12M12 9c-2-4-6-4-6-1s6 1 6 1zM12 9c2-4 6-4 6-1s-6 1-6 1z',
  women: 'M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 13v8M9 18h6',
  child: 'M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 22l1-8-3-3M16 22l-1-8 3-3M9 11h6',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  moonStar: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5zM17 3l.7 1.6L19.3 5l-1.6.7L17 7.3l-.7-1.6L14.7 5l1.6-.4z',
  stethoscope: 'M6 3v5a4 4 0 0 0 8 0V3M5 3h2M13 3h2M10 12v3a5 5 0 0 0 10 0v-3M20 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  video: 'M3 6h12v12H3zM15 10l6-3v10l-6-3',
  tooth: 'M7 3C4.5 3 3 5 3 7.5c0 2.5 1.5 3.5 2 6C5.5 16 6 21 8 21c1.8 0 1.5-5 4-5s2.2 5 4 5c2 0 2.5-5 3-7.5.5-2.5 2-3.5 2-6C21 5 19.5 3 17 3c-2 0-3 1-5 1S9 3 7 3z',
  'shield-check': 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM8.5 12l2.5 2.5 4.5-5',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z',
  'clock-check': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 12.5l2.5 2.5 4.5-5',
  'user-plus': 'M10 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a8 8 0 0 1 16 0M19 8v6M16 11h6',
  repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
  'chevron-up': 'M6 15l6-6 6 6',
} as const;

export type IconName = keyof typeof paths;
const flips = new Set<IconName>(['chevron-start', 'chevron-end', 'arrow-end', 'arrow-start', 'logout', 'return']);

export function Icon({ name, size = 20, className = '', style, label }: { name: IconName; size?: number; className?: string; style?: CSSProperties; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${flips.has(name) ? 'flip' : ''} ${className}`}
      style={{ flex: 'none', ...style }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={paths[name]} />
    </svg>
  );
}
