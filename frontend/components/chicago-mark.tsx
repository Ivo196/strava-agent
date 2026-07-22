export function ChicagoMark() {
  return (
    <span className="chicago-mark" aria-hidden="true">
      <svg viewBox="0 0 40 40" role="img">
        <rect width="40" height="40" rx="9" fill="#f8fbff" />
        <path d="M0 10h40v5H0zM0 25h40v5H0z" fill="#67b7e1" />
        {[6.5, 15.5, 24.5, 33.5].map((x) => (
          <g key={x} transform={`translate(${x} 20)`} stroke="#e03131" strokeWidth="1.7" strokeLinecap="round">
            <path d="M0-3.3V3.3M-2.85-1.65l5.7 3.3M-2.85 1.65l5.7-3.3" />
          </g>
        ))}
      </svg>
    </span>
  );
}
