import { useTheme } from "../lib/theme";

/** The Gaffer Booth mark (a volt tile) and name. */
export function Brand() {
  return (
    <span className="brand">
      <span className="mark" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M4 18 L12 4 L20 18 Z" fill="none" stroke="var(--volt-ink)" strokeWidth="2.6" strokeLinejoin="round" />
          <circle cx="12" cy="14" r="2.4" fill="var(--volt-ink)" />
        </svg>
      </span>
      Gaffer Booth
    </span>
  );
}

/** Moon in light mode, sun in dark mode. The choice is remembered; until then the system decides. */
export function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const dark = theme === "dark";
  return (
    <button type="button" className="icon-btn" onClick={toggle} title={dark ? "Light theme" : "Dark theme"} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        {dark ? (
          <>
            <circle cx="8" cy="8" r="2.8" />
            <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
          </>
        ) : (
          <path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7Z" />
        )}
      </svg>
    </button>
  );
}

export function Check() {
  return (
    <svg className="check" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Cross() {
  return (
    <svg className="check" viewBox="0 0 12 12" aria-hidden="true">
      <path d="m3.3 3.3 5.4 5.4M8.7 3.3 3.3 8.7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Pulse() {
  return <span className="pulse" aria-hidden="true" />;
}
