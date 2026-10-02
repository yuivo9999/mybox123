import { storage } from '../storage/storage';

export const sourceRepository = {
  getAll: (fallback = []) => storage.read('sources', fallback),
  saveAll: (sources) => storage.write('sources', sources),
};
