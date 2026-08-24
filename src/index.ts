import type { Plugin } from "prettier";
import { parse } from "./parser.js";
import { printer } from "./printer.js";

export const languages = [
  {
    name: "WESL",
    parsers: ["wesl"],
    extensions: [".wesl"],
    vscodeLanguageIds: ["wesl"],
  },
];

export const parsers: Plugin["parsers"] = {
  wesl: {
    parse,
    astFormat: "wesl-ast",
    locStart: (node: { start: number }) => node.start,
    locEnd: (node: { end: number }) => node.end,
  },
};

export const printers: Plugin["printers"] = { "wesl-ast": printer };

const plugin: Plugin = { languages, parsers, printers };

export default plugin;
