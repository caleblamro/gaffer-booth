/** The Gaffer Booth logo tile and name. `onDark` drops the gradient tile for the setup hero. */
export function Brand({ onDark = false }: { onDark?: boolean }) {
  return (
    <span className={`brand${onDark ? " on-dark" : ""}`}>
      <span className="logo" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M4 18 L12 4 L20 18 Z" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" />
          <circle cx="12" cy="14" r="2.4" fill="#fff" />
        </svg>
      </span>
      Gaffer Booth
    </span>
  );
}

export function Check() {
  return (
    <svg className="check" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Pulse() {
  return <span className="pulse" aria-hidden="true" />;
}
