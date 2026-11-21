/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import ts from 'typescript';

/**
 * PRD accessibility rule: every control has a screen-reader label. Reads every screen and
 * component and checks each control:
 * - Pressable needs accessibilityRole, and accessibilityLabel unless it holds visible text
 *   (TalkBack and VoiceOver read the text inside a button as its label).
 * - TextInput needs accessibilityLabel (a placeholder disappears once something is typed).
 * - Switch needs accessibilityLabel.
 */

const root = join(__dirname, '..', '..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : files(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

type Problem = string;

function check(path: string): Problem[] {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const problems: Problem[] = [];

  const attrs = (el: ts.JsxOpeningLikeElement) => {
    const names = new Set<string>();
    let spread = false;
    for (const p of el.attributes.properties) {
      if (ts.isJsxSpreadAttribute(p)) spread = true;
      else names.add(p.name.getText(source));
    }
    return { names, spread };
  };

  const hasText = (node: ts.Node): boolean => {
    let found = false;
    const visit = (n: ts.Node) => {
      if (found) return;
      if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && /^(Text|TextInput)$/.test(n.tagName.getText(source))) {
        found = true;
        return;
      }
      if (ts.isJsxText(n) && n.getText(source).trim()) {
        found = true;
        return;
      }
      ts.forEachChild(n, visit);
    };
    visit(node);
    return found;
  };

  const where = (n: ts.Node) => `${relative(root, path)}:${source.getLineAndCharacterOfPosition(n.getStart(source)).line + 1}`;

  const visit = (node: ts.Node) => {
    const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
    if (opening) {
      const tag = opening.tagName.getText(source);
      const { names, spread } = attrs(opening);
      if (!spread) {
        if (tag === 'Pressable') {
          if (!names.has('accessibilityRole')) problems.push(`${where(opening)} Pressable has no accessibilityRole`);
          if (!names.has('accessibilityLabel') && !hasText(node)) problems.push(`${where(opening)} icon-only Pressable has no accessibilityLabel`);
        }
        if ((tag === 'TextInput' || tag === 'Switch') && !names.has('accessibilityLabel')) {
          problems.push(`${where(opening)} ${tag} has no accessibilityLabel`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return problems;
}

it('every control has a screen-reader role and label', () => {
  const problems = [...files(join(root, 'app')), ...files(join(root, 'components'))].flatMap(check);
  expect(problems).toEqual([]);
});
