import type { IToken } from "chevrotain";
import type { Doc } from "prettier";
import { doc } from "prettier";
import { printers as wgslPrinters } from "prettier-plugin-wgsl";
import type { WeslItem, WeslProgram } from "./ast.js";

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
  /^(?:var|vec[2-4]|mat[2-4]x[2-4]|array|ptr|atomic|bitcast|texture(?:_[a-z0-9]+)+)$/i.test(
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
  const firstFunctionIndex = tokens.findIndex((token) => token.image === "fn");
  const hasLeadingFunctionAttribute =
    firstFunctionIndex > 0 &&
    tokens.slice(0, firstFunctionIndex).some((token) => token.image === "@");
  const atLineStart = () => output.length === 0 || output.endsWith("\n");
  const newline = () => {
    output = output.replace(/[ \t]+$/, "");

    if (!output.endsWith("\n")) {
      output += "\n";
    }
  };
  const blankline = () => {
    newline();
    output += "\n";
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
      const isConditionalAttribute =
        (previous === "if" || previous === "elif") &&
        tokens[index - 2]?.image === "@";

      if (!isConditionalAttribute && requiresSpace(previous, image)) {
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
        const context = delimiters.at(-1);

        if (
          context?.kind === "list" ||
          (context?.kind === "import" && context.multiline) ||
          (context?.kind === "paren" && context.multiline)
        ) {
          append(",");
        }

        previous = image;
        continue;
      }
      append(",");
      const context = delimiters.at(-1);
      if (context?.kind === "import" && !context.multiline) {
        append(" ");
      } else if (context?.kind === "list") {
        blankline();
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
      if (image === "fn" && hasLeadingFunctionAttribute && !atLineStart()) {
        newline();
        previous = undefined;
      }

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

const wgslPrinter = wgslPrinters["wgsl-ast"];
const { hardline, indent, join } = doc.builders;

function isWgslNode(node: unknown): boolean {
  return typeof node === "object" && node !== null && "kind" in node;
}

function isWeslItem(node: unknown): node is WeslItem {
  return (
    typeof node === "object" &&
    node !== null &&
    "type" in node &&
    node.type === "Item"
  );
}

function isStructDeclaration(
  node: unknown,
): node is { kind: "StructDeclaration"; name: string; members: unknown[] } {
  return (
    typeof node === "object" &&
    node !== null &&
    "kind" in node &&
    node.kind === "StructDeclaration"
  );
}

function isTranslationUnit(node: unknown): node is {
  kind: "TranslationUnit";
  directives: unknown[];
  declarations: unknown[];
} {
  return (
    typeof node === "object" &&
    node !== null &&
    "kind" in node &&
    node.kind === "TranslationUnit"
  );
}

function printStructWithBlankLines(
  path: { node: { name: string; members: unknown[] } },
  print: unknown,
): Doc {
  if (path.node.members.length === 0) {
    return `struct ${path.node.name} {}`;
  }

  const members = (
    path as unknown as {
      map: (print: unknown, property: string) => Doc[];
    }
  ).map(print, "members");

  return [
    "struct ",
    path.node.name,
    " {",
    indent([hardline, join([",", hardline, hardline], members)]),
    ",",
    hardline,
    "}",
  ];
}

function printTranslationUnitWithBlankLines(
  path: {
    node: {
      directives: unknown[];
      declarations: unknown[];
    };
  },
  print: unknown,
): Doc {
  const docsPath = path as unknown as {
    map: (print: unknown, property: string) => Doc[];
  };
  const directives = docsPath.map(print, "directives");
  const declarations = docsPath.map(print, "declarations");
  const result: Doc[] = [];

  for (const directive of directives) {
    if (result.length > 0) {
      result.push(hardline);
    }

    result.push(directive);
  }

  for (const declaration of declarations) {
    if (result.length > 0) {
      result.push(hardline, hardline);
    }

    result.push(declaration);
  }

  return result.length === 0 ? "" : [...result, hardline];
}

function hasBlankLineBetween(
  previous: { end: number },
  current: { start: number },
  source: string | undefined,
): boolean {
  return (
    source !== undefined &&
    /\r?\n[\t ]*\r?\n/.test(source.slice(previous.end, current.start))
  );
}

export const printer: {
  print: (
    path: { node: unknown },
    options: {
      tabWidth?: number;
      useTabs?: boolean;
      printWidth?: number;
      originalText?: string;
    },
    print: unknown,
    args: unknown,
  ) => Doc;
  canAttachComment: (node: unknown) => boolean;
  printComment: (path: unknown) => Doc;
  getCommentChildNodes: (node: unknown) => object[];
} = {
  print(
    path: { node: unknown },
    options: {
      tabWidth?: number;
      useTabs?: boolean;
      printWidth?: number;
      originalText?: string;
    },
    print: unknown,
    args: unknown,
  ) {
    if (isWeslItem(path.node)) {
      const flatImports =
        path.node.kind === "Import" &&
        shouldPrintImportFlat(path.node.tokens, options);

      return formatItem(path.node.tokens, options, flatImports);
    }

    if (isWgslNode(path.node)) {
      if (isTranslationUnit(path.node)) {
        return printTranslationUnitWithBlankLines(path as never, print);
      }

      if (isStructDeclaration(path.node)) {
        return printStructWithBlankLines(path as never, print);
      }

      return wgslPrinter.print(
        path as never,
        options as never,
        print as never,
        args,
      );
    }

    const { body } = path.node as WeslProgram;
    const docs = (
      path as unknown as {
        map: (print: unknown, property: string) => Doc[];
      }
    ).map(print, "body");
    const result: Doc[] = [];

    for (let index = 0; index < docs.length; index++) {
      if (index > 0) {
        const previous = body[index - 1];
        const current = body[index];
        const separatesImports =
          isWeslItem(previous) &&
          previous.kind === "Import" &&
          !(isWeslItem(current) && current.kind === "Import");
        const separatesDeclarations =
          !(isWeslItem(previous) && previous.kind === "Import") ||
          !(isWeslItem(current) && current.kind === "Import");
        const preservesBlankLine = hasBlankLineBetween(
          previous,
          current,
          options.originalText,
        );

        result.push(
          hardline,
          ...(separatesImports || separatesDeclarations || preservesBlankLine
            ? [hardline]
            : []),
        );
      }

      result.push(docs[index]);
    }

    return isWeslItem(body.at(-1)) ? [...result, hardline] : result;
  },
  canAttachComment(node) {
    return wgslPrinter.canAttachComment(node as never);
  },
  printComment(path) {
    return wgslPrinter.printComment(path as never);
  },
  getCommentChildNodes(node) {
    if (isWgslNode(node)) {
      return wgslPrinter.getCommentChildNodes(node as never);
    }

    if (!isWeslItem(node) && typeof node === "object" && node !== null) {
      return (node as WeslProgram).body;
    }

    return wgslPrinter.getCommentChildNodes(node as never);
  },
};
