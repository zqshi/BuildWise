export function avatarTextOf(userId: string): string {
  return userId.slice(-2).toUpperCase();
}

export function maskUserId(userId: string): string {
  if (/^\d{11}$/.test(userId)) {
    return `${userId.slice(0, 3)}****${userId.slice(-4)}`;
  }
  return userId;
}

export function AddUserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4.8 17a4.2 4.2 0 0 1 8.4 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M16.5 8.2v5.6M13.7 11h5.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
