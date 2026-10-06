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
  if (!name || value.length > 3000) {
    return;
  }
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
    return;
  } catch {
    // Fall back to a small cookie only for compact values.
    if (value.length <= 3000) {
      setCookie(key, value, 30);
    }
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

export function setVisibleTestCookie(): void {
  if (typeof document === 'undefined') return;
  setCookie('aradad_test_cookie', 'ok', 7);
}

export function clearVisibleTestCookie(): void {
  if (typeof document === 'undefined') return;
  deleteCookie('aradad_test_cookie');
}
