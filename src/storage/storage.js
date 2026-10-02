import { ErrorCode } from '../models/errors.js';
import { errorService } from '../services/errorService.js';

const PREFIX = 'tvbox:v2:';
const BACKUP_PREFIX = 'tvbox:backup:';

function read(key, fallback) {
  try {
    const raw = window.localStorage.getItem(`${PREFIX}${key}`);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (error) {
    errorService.report(error, { scope: 'storage-read', key });
    return fallback;
  }
}

function write(key, value) {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw errorService.normalize(new Error('STORAGE_SERIALIZE_FAILED'), { code: ErrorCode.STORAGE, context: { scope: 'storage-write', key } });
  try {
    window.localStorage.setItem(`${PREFIX}${key}`, serialized);
  } catch (error) {
    throw errorService.normalize(error, { code: ErrorCode.STORAGE, context: { scope: 'storage-write', key } });
  }
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
  } catch (error) {
    errorService.report(error, { scope: 'storage-backup-read', key });
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
