import { Lexer, createToken } from "chevrotain";

const makeKeyword = (word: string) =>
  createToken({
    name: `Keyword_${word}`,
    pattern: new RegExp(`${word}\\b`),
  });

export const Whitespace = createToken({
  name: "Whitespace",
  pattern: /[ \t\r\n]+/,
  group: Lexer.SKIPPED,
});

export const LineComment = createToken({
  name: "LineComment",
  pattern: /\/\/[^\r\n]*/,
  group: "comments",
});

export const BlockComment = createToken({
  name: "BlockComment",
  pattern: /\/\*[\s\S]*?\*\//,
  group: "comments",
});

export const HexFloat = createToken({
  name: "HexFloat",
  pattern: /0x[0-9a-fA-F]+(?:\.[0-9a-fA-F]*)?[pP][+-]?\d+[fh]?/,
});

export const HexInteger = createToken({
  name: "HexInteger",
  pattern: /0x[0-9a-fA-F]+[iu]?/,
});

export const NumberLiteral = createToken({
  name: "NumberLiteral",
  pattern: /(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?[fhiu]?/,
});

export const keywords = [
  "alias",
  "bitcast",
  "break",
  "case",
  "const",
  "const_assert",
  "continue",
  "continuing",
  "default",
  "diagnostic",
  "discard",
  "else",
  "enable",
  "false",
  "fn",
  "for",
  "if",
  "let",
  "loop",
  "override",
  "requires",
  "return",
  "struct",
  "switch",
  "true",
  "var",
  "while",
  "import",
  "as",
  "package",
  "super",
  "public",
  "private",
].map(makeKeyword);

export const Identifier = createToken({
  name: "Identifier",
  pattern: /[A-Za-z_][A-Za-z0-9_]*/,
});

export const Operator = createToken({
  name: "Operator",
  pattern:
    /(?:<<=|>>=|&&|\|\||==|!=|<=|>=|->|\+\+|--|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|<<|>>|::|[+\-*/%&|^~!=<>])/,
});

export const Punctuation = createToken({
  name: "Punctuation",
  pattern: /[(){}\[\],;:.@]/,
});

export const allTokens = [
  Whitespace,
  LineComment,
  BlockComment,
  HexFloat,
  HexInteger,
  NumberLiteral,
  ...keywords,
  Operator,
  Punctuation,
  Identifier,
];

export const weslLexer = new Lexer(allTokens, { ensureOptimizations: true });

export function lex(source: string) {
  const result = weslLexer.tokenize(source);
  if (result.errors.length > 0) {
    const error = result.errors[0];
    throw new SyntaxError(
      `Unexpected character at ${error.line}:${error.column}: ${error.message}`,
    );
  }
  const comments = result.groups.comments ?? [];

  return {
    tokens: [...result.tokens, ...comments].sort(
      (left, right) => left.startOffset - right.startOffset,
    ),
  };
}
