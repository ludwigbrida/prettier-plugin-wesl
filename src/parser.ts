import { parsers as wgslParsers } from "prettier-plugin-wgsl";
import type { Program, ProgramEntry, WeslItem, WeslProgram } from "./ast.js";
import { lex } from "./lexer.js";

const weslOnlyTokens = new Set([
  "import",
  "package",
  "public",
  "private",
  "super",
  "self",
]);

function usesWeslSyntax(source: string): boolean {
  const { tokens } = lex(source);

  return tokens.some(
    (token, index) =>
      weslOnlyTokens.has(token.image) ||
      (token.image === "@" &&
        (tokens[index + 1]?.image === "if" ||
          tokens[index + 1]?.image === "elif" ||
          tokens[index + 1]?.image === "else")),
  );
}

function hasConditionalAttribute(
  tokens: ReturnType<typeof lex>["tokens"],
): boolean {
  return tokens.some(
    (token, index) =>
      token.image === "@" &&
      (tokens[index + 1]?.image === "if" ||
        tokens[index + 1]?.image === "elif" ||
        tokens[index + 1]?.image === "else"),
  );
}

function hasComments(tokens: ReturnType<typeof lex>["tokens"]): boolean {
  return tokens.some(
    (token) =>
      token.tokenType.name === "LineComment" ||
      token.tokenType.name === "BlockComment",
  );
}

function shiftOffsets(value: unknown, offset: number): void {
  if (typeof value !== "object" || value === null) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if ((key === "start" || key === "end") && typeof child === "number") {
      (value as Record<string, unknown>)[key] = child + offset;
    } else if (Array.isArray(child)) {
      for (const entry of child) {
        shiftOffsets(entry, offset);
      }
    } else {
      shiftOffsets(child, offset);
    }
  }
}

function parseWesl(source: string): WeslProgram {
  const { tokens } = lex(source);
  const body: WeslItem[] = [];
  let start = 0;
  let paren = 0;
  let bracket = 0;
  let brace = 0;

  const finish = (endIndex: number) => {
    if (endIndex <= start) {
      return;
    }

    const itemTokens = tokens.slice(start, endIndex);

    body.push({
      type: "Item",
      kind: itemTokens.some((token) => token.image === "import")
        ? "Import"
        : "Declaration",
      tokens: itemTokens,
      start: itemTokens[0].startOffset ?? 0,
      end: (itemTokens.at(-1)!.endOffset ?? -1) + 1,
    });

    start = endIndex;
  };

  for (let index = 0; index < tokens.length; index++) {
    const image = tokens[index].image;

    if (image === "(") {
      paren++;
    } else if (image === ")") {
      paren--;
    } else if (image === "[") {
      bracket++;
    } else if (image === "]") {
      bracket--;
    } else if (image === "{") {
      brace++;
    } else if (image === "}") {
      brace--;

      if (
        brace === 0 &&
        paren === 0 &&
        bracket === 0 &&
        tokens[index + 1]?.image !== ";"
      ) {
        finish(index + 1);
      }
    } else if (image === ";" && brace === 0 && paren === 0 && bracket === 0) {
      finish(index + 1);
    }

    if (paren < 0 || bracket < 0 || brace < 0) {
      throw new SyntaxError(
        `Unbalanced delimiter near offset ${tokens[index].startOffset}`,
      );
    }
  }

  if (paren !== 0 || bracket !== 0 || brace !== 0) {
    throw new SyntaxError("Unbalanced delimiter in WESL/WGSL source");
  }

  finish(tokens.length);

  const firstDeclaration = body.findIndex(
    (item) => item.kind === "Declaration",
  );
  const hasOnlyLeadingImports =
    firstDeclaration > 0 &&
    body.slice(0, firstDeclaration).every((item) => item.kind === "Import") &&
    body.slice(firstDeclaration).every((item) => item.kind === "Declaration");

  if (
    firstDeclaration > 0 &&
    hasOnlyLeadingImports &&
    !hasConditionalAttribute(tokens) &&
    !hasComments(tokens)
  ) {
    const declarationsStart = body[firstDeclaration - 1].end;
    const translationUnit = wgslParsers.wgsl.parse(
      source.slice(declarationsStart),
    ) as Program;

    shiftOffsets(translationUnit, declarationsStart);

    return {
      type: "Program",
      tokens,
      body: [
        ...body.slice(0, firstDeclaration),
        translationUnit,
      ] as ProgramEntry[],
      start: 0,
      end: source.length,
    };
  }

  return {
    type: "Program",
    tokens,
    body,
    start: 0,
    end: source.length,
  };
}

export function parse(source: string): Program {
  try {
    return wgslParsers.wgsl.parse(source) as Program;
  } catch (error) {
    if (usesWeslSyntax(source)) {
      return parseWesl(source);
    }

    throw error;
  }
}
