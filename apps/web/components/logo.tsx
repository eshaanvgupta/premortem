/** Original open-branch mark: an observed path and a deliberately separated alternative. */
export function LogoMark({ small = false }: { small?: boolean }) {
  return (
    <svg
      className={small ? 'brand-mark small' : 'brand-mark'}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M10 40V8M10 24h12L38 8"
        stroke="currentColor"
        strokeWidth="5.5"
        strokeLinecap="square"
      />
      <path
        d="m27 29 11 11"
        stroke="currentColor"
        strokeWidth="5.5"
        strokeLinecap="square"
        opacity=".48"
      />
    </svg>
  );
}
