const PREFIX = 'tvbox:v2:';
const BACKUP_PREFIX = 'tvbox:backup:';

function read(key, fallback) {
  try {
    const raw = window.localStorage.getItem(`${PREFIX}${key}`);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error('STORAGE_SERIALIZE_FAILED');
  window.localStorage.setItem(`${PREFIX}${key}`, serialized);
}

function remove(key) {
  window.localStorage.removeItem(`${PREFIX}${key}`);
}

function has(key) {
  return window.localStorage.getItem(`${PREFIX}${key}`) !== null;
}

function backup(key, value) {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error('STORAGE_BACKUP_SERIALIZE_FAILED');
  window.localStorage.setItem(`${BACKUP_PREFIX}${key}`, serialized);
}

function readBackup(key, fallback) {
  try {
    const raw = window.localStorage.getItem(`${BACKUP_PREFIX}${key}`);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export const storage = {
  read,
  write,
  remove,
  has,
  backup,
  readBackup,
  PREFIX,
  BACKUP_PREFIX,
};
