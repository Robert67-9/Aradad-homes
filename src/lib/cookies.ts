export function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    const cookieValue = parts.pop()?.split(';').shift() ?? '';
    try {
      return decodeURIComponent(cookieValue);
    } catch {
      return cookieValue;
    }
  }
  return '';
}

export function setCookie(name: string, value: string, days = 30, path = '/'): void {
  if (typeof document === 'undefined') return;
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  const cookieValue = encodeURIComponent(value);
  document.cookie = `${name}=${cookieValue}; expires=${expires.toUTCString()}; path=${path}; SameSite=Lax`;
}

export function deleteCookie(name: string, path = '/'): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}; SameSite=Lax`;
}

export function readStorageValue(key: string): string {
  if (typeof window === 'undefined') return '';
  const fromLocalStorage = window.localStorage.getItem(key);
  if (fromLocalStorage !== null) return fromLocalStorage;
  return getCookie(key);
}

export function writeStorageValue(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Fall back to cookie storage when browser storage is blocked or full.
    setCookie(key, value, 30);
  }
}

export function removeStorageValue(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // noop
  }
  deleteCookie(key);
}
