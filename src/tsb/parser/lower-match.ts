/**
 * Lower `match expr { pattern => result, … }` expressions to IIFEs by
 * walking the typed AST (rather than tokenising body text). Each
 * `match_expression` node in a body subtree is rendered as
 *
 *   ((__m) => {
 *     if (<condition>) return <result>;
 *     …
 *     throw new Error("match: no arm matched");
 *   })(<scrutinee>)
 *
 * The transformation is text-level on the output but driven by AST
 * positions on the input — no regex, no token-walking.
 */
import type * as N from "../ast/nodes.generated.ts";

/**
 * Take a body string + the AST node it came from, return the body
 * with every nested `match_expression` replaced by an IIFE.
 */
export function lowerBody(node: N.NodeBase, bodyText: string): string {
  const baseOffset = node.startIndex;
  // Find every match_expression in the subtree rooted at `node`.
  // Process in REVERSE order so earlier-position splices don't
  // shift later positions.
  const matches: N.MatchExpressionNode[] = [];
  collectMatches(node as N.AstNode, matches);
  if (matches.length === 0) return bodyText;
  matches.sort((a, b) => b.startIndex - a.startIndex);

  let out = bodyText;
  for (const m of matches) {
    const start = m.startIndex - baseOffset;
    const end = m.endIndex - baseOffset;
    if (start < 0 || end > out.length) continue;
    const replacement = renderMatchAsIife(m);
    out = out.slice(0, start) + replacement + out.slice(end);
  }
  return out;
}

function collectMatches(
  node: N.AstNode | undefined,
  out: N.MatchExpressionNode[]
): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const c of node) collectMatches(c, out);
    return;
  }
  if (node.kind === "match_expression") {
    out.push(node);
    // Still walk children to handle nested `match` inside arm bodies.
  }
  for (const key of Object.keys(node)) {
    if (["kind", "startIndex", "endIndex", "startPosition", "endPosition", "text"].includes(key)) continue;
    collectMatches((node as unknown as Record<string, unknown>)[key] as N.AstNode, out);
  }
}

// ---------------------------------------------------------------------------
// IIFE rendering for a single match_expression node.
// ---------------------------------------------------------------------------

function renderMatchAsIife(node: N.MatchExpressionNode): string {
  const scrutinee = node.scrutinee.text;
  const arms = (node.children ?? []).filter((c) => c.kind === "match_arm") as N.MatchArmNode[];

  const lines: string[] = ["((__m) => {"];
  for (const arm of arms) {
    lines.push(renderArm(arm));
  }
  lines.push(`  throw new Error("match: no arm matched");`);
  lines.push(`})(${scrutinee})`);
  return lines.join("\n");
}

function renderArm(arm: N.MatchArmNode): string {
  const result = arm.body.text;
  const pattern = arm.pattern;

  switch (pattern.kind) {
    case "wildcard_pattern":
      return `  return ${result};`;

    case "literal_pattern": {
      return `  if (__m === ${pattern.text}) return ${result};`;
    }

    case "binding_pattern": {
      const name = pattern.text;
      return `  { const ${name} = __m; return ${result}; }`;
    }

    case "object_pattern":
      return renderObjectArm(pattern, result, /*structName=*/ undefined);

    case "struct_pattern": {
      const structName = pattern.name.text;
      const body = pattern.body;
      if (body) {
        return renderObjectArm(body as N.PatternBodyNode, result, structName);
      }
      const cond = `typeof __m === "object" && __m !== null && (__m as Record<string, unknown>)._struct === ${JSON.stringify(structName)}`;
      return `  if (${cond}) return ${result};`;
    }

    default:
      // Shouldn't reach — grammar's pattern union covers the cases.
      // (`pattern` is `never` here from exhaustiveness.)
      return `  /* unhandled match pattern */`;
  }
}

function renderObjectArm(
  body: N.PatternBodyNode | N.ObjectPatternNode,
  result: string,
  structName: string | undefined
): string {
  // `object_pattern` wraps a single `pattern_body` child; struct
  // patterns already pass the inner pattern_body directly. Normalise
  // both to the entries list of a pattern_body.
  const inner: N.PatternBodyNode | undefined =
    body.kind === "object_pattern"
      ? (Array.isArray((body as unknown as { children?: unknown }).children)
          ? ((body as unknown as { children: N.AstNode[] }).children[0] as N.PatternBodyNode | undefined)
          : ((body as unknown as { children?: N.PatternBodyNode }).children))
      : (body as N.PatternBodyNode);
  const entries = (inner?.children ?? []) as Array<
    N.PatternCheckNode | N.PatternBindNode | N.PatternShorthandNode
  >;

  const guards: string[] = [];
  if (structName) {
    guards.push(
      `(__m as Record<string, unknown>)._struct === ${JSON.stringify(structName)}`
    );
  }
  const binds: { binding: string; key: string }[] = [];
  for (const entry of entries) {
    if (entry.kind === "pattern_check") {
      const valueNode = entry.value;
      const valueText = valueNode.text;
      guards.push(
        `(__m as Record<string, unknown>).${entry.key.text} === ${valueText}`
      );
    } else if (entry.kind === "pattern_bind") {
      binds.push({ binding: entry.binding.text, key: entry.key.text });
    } else if (entry.kind === "pattern_shorthand") {
      const name = entry.text;
      binds.push({ binding: name, key: name });
    }
  }

  const cond = guards.length === 0
    ? `typeof __m === "object" && __m !== null`
    : `typeof __m === "object" && __m !== null && ${guards.join(" && ")}`;

  if (binds.length === 0) {
    return `  if (${cond}) return ${result};`;
  }
  const bindings = binds
    .map((b) => `const ${b.binding} = (__m as any).${b.key};`)
    .join(" ");
  return `  if (${cond}) { ${bindings} return ${result}; }`;
}
