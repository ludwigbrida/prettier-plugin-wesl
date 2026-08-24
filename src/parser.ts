import type { WeslItem, WeslProgram } from "./ast.js";
import { lex } from "./lexer.js";

export function parse(source: string): WeslProgram {
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
      end: itemTokens.at(-1)!.endOffset ?? 0,
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

  return {
    type: "Program",
    tokens,
    body,
    start: 0,
    end: source.length,
  };
}
