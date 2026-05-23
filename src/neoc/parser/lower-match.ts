/**
 * Lower `match expr { pattern => result, … }` expressions to Lua IIFEs
 * by walking the typed AST.
 *
 *   (function(__m)
 *     if <condition> then return <result> end
 *     ...
 *     error("match: no arm matched")
 *   end)(<scrutinee>)
 */
import type * as N from "../ast/nodes.generated.ts";

export function lowerBody(node: N.NodeBase, bodyText: string): string {
  const baseOffset = node.startIndex;
  const matches: N.MatchExpressionNode[] = [];
  collectMatches(node as N.AstNode, matches);
  if (matches.length === 0) return bodyText;
  // Reverse order so earlier-position splices don't shift later ones.
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
  }
  for (const key of Object.keys(node)) {
    if (["kind", "startIndex", "endIndex", "startPosition", "endPosition", "text"].includes(key)) continue;
    collectMatches((node as unknown as Record<string, unknown>)[key] as N.AstNode, out);
  }
}

function renderMatchAsIife(node: N.MatchExpressionNode): string {
  const scrutinee = node.scrutinee.text;
  const arms = (node.children ?? []).filter((c) => c.kind === "match_arm") as N.MatchArmNode[];

  // Lua forbids any statement after `return` in a block. Wildcard /
  // binding arms render as bare `return ...` and always match, so a
  // trailing `error("…")` would never run and the parser would reject
  // it. Skip the fallback when those arms are present. A guarded
  // wildcard / binding arm is NOT a true catch-all — the guard can
  // fail and the next arm runs — so it doesn't count here.
  const hasCatchAll = arms.some(
    (a) =>
      a.guard === undefined &&
      (a.pattern.kind === "wildcard_pattern" || a.pattern.kind === "binding_pattern")
  );

  const lines: string[] = ["(function(__m)"];
  for (const arm of arms) {
    lines.push(renderArm(arm));
  }
  if (!hasCatchAll) {
    lines.push(`  error("match: no arm matched")`);
  }
  lines.push(`end)(${scrutinee})`);
  return lines.join("\n");
}

function renderArm(arm: N.MatchArmNode): string {
  const result = arm.body.text;
  const pattern = arm.pattern;
  const guard = arm.guard?.text;

  switch (pattern.kind) {
    case "wildcard_pattern":
      return guard
        ? `  if ${guard} then return ${result} end`
        : `  return ${result}`;

    case "literal_pattern": {
      const cond = guard
        ? `__m == ${pattern.text} and (${guard})`
        : `__m == ${pattern.text}`;
      return `  if ${cond} then return ${result} end`;
    }

    case "binding_pattern": {
      const name = pattern.text;
      if (guard) {
        return `  do local ${name} = __m; if ${guard} then return ${result} end end`;
      }
      return `  do local ${name} = __m; return ${result} end`;
    }

    case "object_pattern":
      return renderObjectArm(pattern, result, undefined, guard);

    case "struct_pattern": {
      const structName = pattern.name.text;
      const body = pattern.body;
      if (body) {
        return renderObjectArm(body as N.PatternBodyNode, result, structName, guard);
      }
      const cond = guard
        ? `type(__m) == "table" and __m._struct == ${luaString(structName)} and (${guard})`
        : `type(__m) == "table" and __m._struct == ${luaString(structName)}`;
      return `  if ${cond} then return ${result} end`;
    }

    default:
      return `  -- unhandled match pattern`;
  }
}

function renderObjectArm(
  body: N.PatternBodyNode | N.ObjectPatternNode,
  result: string,
  structName: string | undefined,
  guard: string | undefined
): string {
  const inner: N.PatternBodyNode | undefined =
    body.kind === "object_pattern"
      ? (Array.isArray((body as unknown as { children?: unknown }).children)
          ? ((body as unknown as { children: N.AstNode[] }).children[0] as N.PatternBodyNode | undefined)
          : ((body as unknown as { children?: N.PatternBodyNode }).children))
      : (body as N.PatternBodyNode);
  const entries = (inner?.children ?? []) as Array<
    N.PatternCheckNode | N.PatternBindNode | N.PatternShorthandNode
  >;

  const guards: string[] = [`type(__m) == "table"`];
  if (structName) {
    guards.push(`__m._struct == ${luaString(structName)}`);
  }
  const binds: { binding: string; key: string }[] = [];
  for (const entry of entries) {
    if (entry.kind === "pattern_check") {
      const valueText = entry.value.text;
      guards.push(`__m.${entry.key.text} == ${valueText}`);
    } else if (entry.kind === "pattern_bind") {
      binds.push({ binding: entry.binding.text, key: entry.key.text });
    } else if (entry.kind === "pattern_shorthand") {
      const name = entry.text;
      binds.push({ binding: name, key: name });
    }
  }

  const cond = guards.join(" and ");
  if (binds.length === 0) {
    if (guard) {
      return `  if ${cond} then if ${guard} then return ${result} end end`;
    }
    return `  if ${cond} then return ${result} end`;
  }
  const bindings = binds
    .map((b) => `local ${b.binding} = __m.${b.key}`)
    .join("; ");
  if (guard) {
    return `  if ${cond} then ${bindings}; if ${guard} then return ${result} end end`;
  }
  return `  if ${cond} then ${bindings}; return ${result} end`;
}

function luaString(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
