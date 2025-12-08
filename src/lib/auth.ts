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
  // Keep anon_id for now - user might want to log back in
}

export function getAnonId(): string | null {
  return localStorage.getItem(ANON_ID_KEY);
}

export function setAnonId(id: string): void {
  localStorage.setItem(ANON_ID_KEY, id);
}

