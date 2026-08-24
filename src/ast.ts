import type { IToken } from "chevrotain";

export interface WeslNode {
  type: "Program" | "Item";
  tokens: IToken[];
  start: number;
  end: number;
}

export interface WeslItem extends WeslNode {
  type: "Item";
  kind: "Import" | "Declaration";
}

export interface WeslProgram extends WeslNode {
  type: "Program";
  body: WeslItem[];
}
