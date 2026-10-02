const PREFIX = 'tvbox:v2:';

function read(key, fallback) {
  try {
    const raw = window.localStorage.getItem(`${PREFIX}${key}`);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  window.localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(value));
}

export const storage = { read, write, PREFIX };
