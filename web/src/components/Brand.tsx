import { useTheme } from "../lib/theme";

/** The Gaffer Booth mark in its ruled logo cell. */
export function Brand() {
  return (
    <span className="logo" role="img" aria-label="Gaffer Booth">
      <svg viewBox="0 0 30 26" aria-hidden="true">
        <path d="M2 24 L15 2 L28 24 L21 24 L15 13 L9 24 Z" fill="currentColor" />
      </svg>
    </span>
  );
}

/** Moon in light mode, sun in dark mode, as a ruled icon cell. The choice is remembered; until then the system decides. */
export function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const dark = theme === "dark";
  return (
    <button type="button" className="icon" onClick={toggle} title={dark ? "Light theme" : "Dark theme"} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        {dark ? (
          <>
            <circle cx="8" cy="8" r="3" />
            <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" />
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
    <svg className="check" viewBox="0 0 14 14" aria-hidden="true">
      <path d="m2.5 7.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
    </svg>
  );
}

export function Cross() {
  return (
    <svg className="check" viewBox="0 0 14 14" aria-hidden="true">
      <path d="m3 3 8 8M11 3l-8 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
    </svg>
  );
}

export function Pulse() {
  return <span className="pulse" aria-hidden="true" />;
}
