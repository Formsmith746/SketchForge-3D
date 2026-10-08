import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// MCP reads the editor status line in English (englishNotice) while the interface shows the same notice translated.
// That holds only if a notice translates through the translator it is given: notice((t) => t("editor.…")).
const SOURCES = ["apps/web/src/components/SketchForgeEditor.tsx", "apps/web/src/components/SketchWorkspace.tsx", "apps/web/src/app/page.tsx"];
const repoRoot = path.resolve(__dirname, "../..");

function isReference(node: ts.Identifier) {
  const parent = node.parent;
  if ((ts.isPropertyAccessExpression(parent) || ts.isPropertyAssignment(parent)) && parent.name === node) return false;
  return !ts.isParameter(parent);
}

/** Whether `node` uses a `t` that is not a parameter of a function inside `node`: the interface translator. */
function usesInterfaceTranslator(node: ts.Node, shadowed = false): boolean {
  if (ts.isFunctionLike(node) && node.parameters.some((parameter) => ts.isIdentifier(parameter.name) && parameter.name.text === "t")) shadowed = true;
  if (!shadowed && ts.isIdentifier(node) && node.text === "t" && isReference(node)) return true;
  return ts.forEachChild(node, (child) => usesInterfaceTranslator(child, shadowed) || undefined) ?? false;
}

function noticeProblems(file: string): string[] {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(repoRoot, file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const translatedVariables = new Set<string>();
  const collect = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && usesInterfaceTranslator(node.initializer)) {
      translatedVariables.add(node.name.text);
    }
    ts.forEachChild(node, collect);
  };
  collect(source);

  const problems: string[] = [];
  const check = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "notice" && node.arguments[0]) {
      const where = `${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
      if (usesInterfaceTranslator(node.arguments[0])) problems.push(`${where} translates with the interface translator`);
      const findTranslated = (inner: ts.Node) => {
        if (ts.isIdentifier(inner) && translatedVariables.has(inner.text) && isReference(inner)) {
          problems.push(`${where} uses ${inner.text}, translated in the interface language beforehand`);
        }
        ts.forEachChild(inner, findTranslated);
      };
      findTranslated(node.arguments[0]);
    }
    ts.forEachChild(node, check);
  };
  check(source);
  return problems;
}

describe("status line notices", () => {
  it("translate only through the translator they are given, so MCP reads them in English", () => {
    expect(SOURCES.flatMap(noticeProblems)).toEqual([]);
  });
});
