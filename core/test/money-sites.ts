// Every place in core, server and web where a "$" is glued to a value by hand: a template's `$${x}`, or JSX text ending
// in "$" right before `{x}`. Each one skips the one formatter (core/src/money.ts), so a price over $999 reads "$1218.00"
// (C's panel, Nov 6). Also every string that spells a price of four or more digits with no comma ("$1218"). Read with
// the TypeScript parser, not a regex: in JSX, "Your limit: ${limit}" is text plus an expression, not a template.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

export interface MoneySite { file: string; line: number; kind: "template" | "jsx" | "concat" | "literal"; text: string }

const BARE_PRICE = /\$\d{4,}(?![\d,])/; // "$1218", "$1218.00": a comma would follow the first one to three digits

export function moneySitesIn(file: string, src: string): MoneySite[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: MoneySite[] = [];
  const at = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const site = (n: ts.Node, kind: MoneySite["kind"], text: string) => out.push({ file, line: at(n), kind, text: text.replace(/\s+/g, " ").trim() });
  const visit = (n: ts.Node): void => {
    if (ts.isTemplateExpression(n)) {
      let before = n.head.text;
      for (const span of n.templateSpans) {
        if (before.endsWith("$")) site(span.expression, "template", span.expression.getText(sf));
        before = span.literal.text;
      }
    }
    if (ts.isJsxElement(n) || ts.isJsxFragment(n)) {
      const kids = n.children;
      kids.forEach((k, i) => {
        const next = kids[i + 1];
        if (ts.isJsxText(k) && k.text.endsWith("$") && next && ts.isJsxExpression(next) && next.expression) site(next, "jsx", next.expression.getText(sf));
      });
    }
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken && ts.isStringLiteralLike(n.left) && n.left.text.endsWith("$")) {
      site(n.right, "concat", n.right.getText(sf));
    }
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n) || ts.isJsxText(n)) && BARE_PRICE.test(n.text)) {
      site(n, "literal", BARE_PRICE.exec(n.text)![0]);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** Every site in the repo's committed core, server and web sources (the formatter's own files, money.ts and usd-of.ts, aside). */
export function moneySites(root: string): MoneySite[] {
  const files = execFileSync("git", ["ls-files", "core/src", "server/src", "web/src"], { cwd: root, encoding: "utf8" })
    .split("\n").filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".d.ts") && f !== "core/src/money.ts" && f !== "core/src/usd-of.ts");
  return files.flatMap((f) => moneySitesIn(f, readFileSync(`${root}/${f}`, "utf8")));
}
