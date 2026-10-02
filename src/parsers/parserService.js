import { createParserChain } from './parserChain.js';
import { directParser } from './directParser.js';
import { hlsParser } from './hlsParser.js';
import { dashParser } from './dashParser.js';
export const parserService={chain:createParserChain([hlsParser,dashParser,directParser]),resolve(candidate,options={}){return this.chain.resolve(candidate,options);}};
