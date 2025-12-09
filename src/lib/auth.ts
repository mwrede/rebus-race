// Authentication utilities for Google OAuth and username management

const USERNAME_KEY = 'rebus_username';
const GOOGLE_USER_KEY = 'rebus_google_user';
const ANON_ID_KEY = 'rebus_anon_id';

export interface GoogleUser {
  sub: string; // Google user ID
  email: string;
  name: string;
  picture: string;
}

export function getUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function setUsername(username: string): void {
  localStorage.setItem(USERNAME_KEY, username);
}

export function hasUsername(): boolean {
  return !!getUsername();
}

export function clearUsername(): void {
  localStorage.removeItem(USERNAME_KEY);
}

export function getGoogleUser(): GoogleUser | null {
  const stored = localStorage.getItem(GOOGLE_USER_KEY);
  return stored ? JSON.parse(stored) : null;
}

export function setGoogleUser(user: GoogleUser | null): void {
  if (user) {
    localStorage.setItem(GOOGLE_USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(GOOGLE_USER_KEY);
  }
}

export function clearGoogleUser(): void {
  localStorage.removeItem(GOOGLE_USER_KEY);
}

export function logout(): void {
  clearUsername();
  clearGoogleUser();
  // Clear anon_id so new user gets fresh data
  localStorage.removeItem(ANON_ID_KEY);
  // Clear all game state from localStorage
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith('rebus_game_state_') || key === 'rebus_wins' || key === 'rebus_won_puzzles')) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
}

export function getAnonId(): string | null {
  return localStorage.getItem(ANON_ID_KEY);
}

export function setAnonId(id: string): void {
  localStorage.setItem(ANON_ID_KEY, id);
}

export function hasGoogleAuth(): boolean {
  return !!getGoogleUser();
}

export function isFullyAuthenticated(): boolean {
  return hasUsername() && hasGoogleAuth();
}

