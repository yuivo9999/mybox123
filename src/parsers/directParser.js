import { createResolvedMediaInput } from '../models/parser.js';

export const directParser = {
  id: 'direct',
  priority: 10,
  matches(candidate) {
    return !candidate?.parserHint || candidate.parserHint === 'direct';
  },
  async resolve(candidate) {
    return createResolvedMediaInput({
      ...candidate,
      url: candidate.mediaUrl ?? candidate.url,
    });
  },
};
