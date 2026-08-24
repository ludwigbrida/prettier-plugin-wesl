import type { IToken } from "chevrotain";
import type { WeslProgram } from "./ast.js";

const word = /^[A-Za-z0-9_]/;
const noSpaceBefore = new Set([")", "]", ",", ";", ".", "::", ":"]);
const noSpaceAfter = new Set(["(", "[", ".", "::", "@"]);
const controlWords = new Set(["if", "for", "while", "switch", "loop"]);
const unaryOperators = new Set(["!", "~"]);
const binaryOperators = new Set([
  "=",
  "+",
  "-",
  "*",
  "/",
  "%",
  "==",
  "!=",
  "<",
  ">",
  "<=",
  ">=",
  "&&",
  "||",
  "&",
  "|",
  "^",
  "<<",
  ">>",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "&=",
  "|=",
  "^=",
  "<<=",
  ">>=",
  "->",
]);
const isTemplateHead = (value: string | undefined) =>
  value !== undefined &&
  /^(?:vec[2-4]|mat[2-4]x[2-4]|array|ptr|atomic|bitcast|texture(?:_[a-z0-9]+)+)$/i.test(
    value,
  );

function isComment(token: IToken) {
  return (
    token.tokenType.name === "LineComment" ||
    token.tokenType.name === "BlockComment"
  );
}

function requiresSpace(previous: string | undefined, current: string): boolean {
  if (!previous || noSpaceBefore.has(current) || noSpaceAfter.has(previous)) {
    return false;
  }

  if (current === "@") {
    return previous !== "@" && previous !== ";";
  }

  if (current === "(" || current === "[") {
    return controlWords.has(previous);
  }

  if (current === "{") {
    return previous !== ",";
  }

  if (previous === "}") {
    return current !== ";" && current !== ",";
  }

  if (previous === ",") {
    return false;
  }

  if (previous === ":") {
    return true;
  }

  if (unaryOperators.has(current)) {
    return binaryOperators.has(previous);
  }

  if (binaryOperators.has(previous) || binaryOperators.has(current)) {
    return true;
  }

  if ((previous === ")" || previous === "]") && word.test(current)) {
    return true;
  }

  return word.test(previous) && word.test(current);
}

interface DelimiterContext {
  kind: "paren" | "import" | "list" | "block";
  multiline: boolean;
}

function formatItem(
  tokens: IToken[],
  options: { tabWidth?: number; useTabs?: boolean; printWidth?: number },
  flatImports = false,
): string {
  const indentUnit = options.useTabs ? "\t" : " ".repeat(options.tabWidth ?? 2);
  const printWidth = options.printWidth ?? 80;
  let output = "";
  let indentation = 0;
  let templateDepth = 0;
  let previous: string | undefined;
  const delimiters: DelimiterContext[] = [];
  const atLineStart = () => output.length === 0 || output.endsWith("\n");
  const newline = () => {
    output = output.replace(/[ \t]+$/, "");

    if (!output.endsWith("\n")) {
      output += "\n";
    }
  };
  const append = (text: string) => {
    if (atLineStart()) {
      output += indentUnit.repeat(indentation);
    }

    output += text;
  };
  const braceKind = (index: number): DelimiterContext["kind"] => {
    for (let cursor = index - 1; cursor >= 0; cursor--) {
      const image = tokens[cursor].image;

      if (image === ";" || image === "}") {
        return "block";
      }

      if (image === "import") {
        return "import";
      }

      if (image === "struct") {
        return "list";
      }
    }

    return "block";
  };
  const currentLineLength = () => output.length - output.lastIndexOf("\n") - 1;
  const nextIsClose = (index: number) =>
    tokens[index + 1]?.image === ")" || tokens[index + 1]?.image === "}";

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const image = token.image;
    if (image === "@" && previous === ";" && indentation === 0) {
      output = output.replace(/\n[ \t]*$/, "\n");
    }
    if (isComment(token)) {
      if (previous && !atLineStart()) {
        append(" ");
      }

      append(image.trim());
      newline();
      previous = undefined;
      continue;
    }
    if (image === "{") {
      if (requiresSpace(previous, image)) {
        append(" ");
      }

      append("{");
      const kind = braceKind(index);
      const multiline = kind !== "import" || !flatImports;

      delimiters.push({
        kind,
        multiline,
      });

      if (multiline) {
        indentation++;
        newline();
      }
      previous = image;
      continue;
    }
    if (image === "}") {
      const context = delimiters.pop();

      if (
        (context?.kind === "list" ||
          (context?.kind === "import" && context.multiline)) &&
        previous !== "," &&
        previous !== "{"
      ) {
        append(",");
      }

      if (context?.multiline) {
        indentation = Math.max(0, indentation - 1);
        newline();
      }

      append("}");
      previous = image;
      continue;
    }
    if (image === "(") {
      delimiters.push({ kind: "paren", multiline: false });

      if (requiresSpace(previous, image)) {
        append(" ");
      }

      append(image);
    } else if (image === ")") {
      const context = delimiters.pop();

      if (context?.multiline) {
        if (previous !== "," && previous !== "(") {
          append(",");
        }

        indentation = Math.max(0, indentation - 1);
        newline();
      }
      append(")");
    } else if (image === "<" && isTemplateHead(previous)) {
      append("<");
      templateDepth++;
    } else if (image === ">" && templateDepth > 0) {
      append(">");
      templateDepth--;
    } else if (image === ",") {
      if (nextIsClose(index)) {
        previous = image;
        continue;
      }
      append(",");
      const context = delimiters.at(-1);
      if (context?.kind === "import" && !context.multiline) {
        append(" ");
      } else if (templateDepth > 0 || context?.kind === "paren") {
        if (
          context?.kind === "paren" &&
          (context.multiline || currentLineLength() > printWidth - 8)
        ) {
          if (!context.multiline) {
            context.multiline = true;
            indentation++;
          }
          newline();
        } else {
          append(" ");
        }
      } else {
        newline();
      }
    } else if (image === ";") {
      append(";");

      if (delimiters.at(-1)?.kind === "paren") {
        append(" ");
      } else {
        newline();
      }
    } else {
      if (
        !(templateDepth > 0 && previous === "<") &&
        requiresSpace(previous, image)
      ) {
        append(" ");
      }

      append(image);
    }
    previous = image;
  }
  return output.replace(/[ \t\n]+$/, "");
}

function shouldPrintImportFlat(
  tokens: IToken[],
  options: { printWidth?: number },
): boolean {
  const output = formatItem(tokens, options, true);
  const printWidth = options.printWidth ?? 80;

  return !output.includes("\n") && output.length <= printWidth;
}

export const printer = {
  print(
    path: { node: WeslProgram },
    options: { tabWidth?: number; useTabs?: boolean; printWidth?: number },
  ) {
    const { body } = path.node;
    return `${body
      .map((item, index) => {
        const next = body[index + 1];
        const separator = next
          ? item.kind === "Import" && next.kind !== "Import"
            ? "\n\n"
            : "\n"
          : "";
        const flatImports =
          item.kind === "Import" && shouldPrintImportFlat(item.tokens, options);

        return `${formatItem(item.tokens, options, flatImports)}${separator}`;
      })
      .join("")}\n`;
  },
  getVisitorKeys() {
    return [];
  },
};
