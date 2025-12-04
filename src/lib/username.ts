const USERNAME_KEY = 'rebus_username';

export function getUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function setUsername(username: string): void {
  localStorage.setItem(USERNAME_KEY, username);
}

export function hasUsername(): boolean {
  return !!getUsername();
}

