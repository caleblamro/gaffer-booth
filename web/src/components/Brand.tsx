export function Wordmark() {
  return (
    <span className="wordmark">
      <svg className="mark" viewBox="0 0 22 22" aria-hidden="true">
        <rect x="1" y="1" width="20" height="20" rx="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M11 1v20M1 11h4M17 11h4" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="11" cy="11" r="3.2" fill="var(--tally)" />
      </svg>
      Gaffer<span>Booth</span>
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
