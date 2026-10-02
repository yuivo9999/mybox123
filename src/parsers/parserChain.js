import { ParserErrorCode, createResolvedMediaInput } from '../models/parser.js';

export function createParserChain(parsers = []) {
  const ordered = [...parsers].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

  return {
    list() {
      return [...ordered];
    },
    async resolve(candidate, context = {}) {
      if (!candidate?.mediaUrl && !candidate?.url) {
        throw new Error(ParserErrorCode.INPUT_INVALID);
      }

      for (const parser of ordered) {
        if (!(await parser.matches(candidate, context))) continue;
        const result = await parser.resolve(candidate, context);
        if (!result) throw new Error(ParserErrorCode.PARSER_NOT_MATCHED);
        return createResolvedMediaInput(result);
      }

      throw new Error(ParserErrorCode.PARSER_NOT_MATCHED);
    },
  };
}
