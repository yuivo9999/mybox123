import { createResolvedMediaInput, inferMediaProtocol } from '../models/parser.js';

export const directParser = {
  id: 'direct',
  priority: 100,
  matches(candidate) {
    const protocol = String(candidate?.protocol ?? inferMediaProtocol(candidate?.mediaUrl ?? candidate?.url)).toLowerCase();
    return (!candidate?.parserHint || candidate.parserHint === 'direct')
      && protocol !== 'hls'
      && protocol !== 'dash';
  },
  async resolve(candidate) {
    return createResolvedMediaInput({
      ...candidate,
      url: candidate.mediaUrl ?? candidate.url,
    });
  },
};
