type Props = { name: string; size?: number; className?: string };
const paths: Record<string, JSX.Element> = {
  home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/><path d="M9 21v-8h6v8"/></>,
  today: <><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4m8-4v4M3 10h18m-13 5 3 3 5-5"/></>,
  planner: <><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4m8-4v4M3 10h18M8 14h1m6 0h1m-8 4h1m6 0h1"/></>,
  chores: <><path d="m14 3 7 7m-3-4L8 16m-3-4 7 7-3 3-7-7Z"/><path d="m5 16 3 3"/></>,
  inventory: <><path d="m3 7 9-4 9 4-9 4Zm0 0v11l9 4 9-4V7M12 11v11m-5-17 9 4v4"/></>,
  shopping: <><path d="M3 3h2l3 13h10l3-9H6m4 14h.01M18 21h.01"/><circle cx="10" cy="21" r="1"/><circle cx="18" cy="21" r="1"/></>,
  meals: <><path d="M4 3v6a3 3 0 0 0 6 0V3M7 3v18m13-18c-5 3-5 10 0 10V3Zm0 10v8"/></>,
  dates: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8m-8 4h8m-8 4h3m4 0h1m-8 3h3"/></>,
  guide: <><path d="M12 21S3 16 3 9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 7-9 12-9 12Z"/><path d="M9 11h6m-3-3v6"/></>,
  manage: <><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="18" r="2"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  leaf: <><path d="M20 3C8 2 2 7 5 15s15 4 15-12ZM4 21l11-12"/></>,
};
export function Icon({name,size=20,className}:Props) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.home}</svg>;
}
