/**
 * Source map generation for `.tsb` → `.ts` lowering.
 *
 * Strategy:
 *
 *   - The emitter produces an ordered list of `EmitChunk`s — `{ text,
 *     sourceOffset }` pairs whose concatenation IS the final TS.
 *   - We walk the chunks, tracking (generatedLine, generatedColumn) as we
 *     advance through their text. Whenever a chunk *starts* on a new
 *     generated line, we emit a Source Map v3 segment pointing to the
 *     chunk's source byte offset (converted to source line/column).
 *
 * The fidelity isn't byte-per-token, but it's far better than the
 * everything-maps-to-(0,0) placeholder: every top-level declaration's
 * generated lines land back near their source declaration. Macro-introduced
 * lines without a `sourceOffset` keep the most recent known source position
 * so debuggers don't jump to (0,0).
 */
import type { EmitChunk } from "./typescript/index.ts";

export interface SourceMap {
  version: 3;
  file: string;
  sources: string[];
  sourcesContent: string[];
  names: string[];
  mappings: string;
}

export function generateSourceMap(
  generatedFile: string,
  sourceFile: string,
  sourceContent: string,
  chunks: readonly EmitChunk[]
): SourceMap {
  const lineColCache = buildLineStartCache(sourceContent);
  const mappings = buildMappings(chunks, lineColCache);
  return {
    version: 3,
    file: generatedFile,
    sources: [sourceFile],
    sourcesContent: [sourceContent],
    names: [],
    mappings,
  };
}

/**
 * Build the comma-and-semicolon-separated `mappings` string. Each
 * generated line is a `;`-separated group; segments within a line are
 * `,`-separated. We emit at most one segment per generated line: the
 * (sourceLine, sourceColumn) of the chunk that introduces that line.
 */
function buildMappings(
  chunks: readonly EmitChunk[],
  lineStartCache: readonly number[]
): string {
  // (sourceLine, sourceColumn) for each generated line; null when we
  // don't have provenance for that line.
  const lineMap: ([number, number] | null)[] = [];
  let genLine = 0;
  let genCol = 0;
  let lastKnownSource: [number, number] | null = null;
  const ensureLine = (n: number): void => {
    while (lineMap.length <= n) lineMap.push(null);
  };

  for (const chunk of chunks) {
    let chunkSource: [number, number] | null = null;
    if (chunk.sourceOffset !== undefined) {
      chunkSource = offsetToLineCol(chunk.sourceOffset, lineStartCache);
      lastKnownSource = chunkSource;
    }
    // The chunk's start position contributes a segment at the current
    // (genLine, genCol). Use chunkSource if available, otherwise the
    // last known source position.
    const startSource = chunkSource ?? lastKnownSource;
    if (startSource) {
      ensureLine(genLine);
      if (lineMap[genLine] === null) lineMap[genLine] = startSource;
    }

    for (let i = 0; i < chunk.text.length; i++) {
      if (chunk.text.charCodeAt(i) === 10) {
        genLine++;
        genCol = 0;
        // The first column of every new generated line maps to the same
        // source position as the chunk start (best-fidelity per-line).
        if (startSource) {
          ensureLine(genLine);
          if (lineMap[genLine] === null) lineMap[genLine] = startSource;
        }
      } else {
        genCol++;
      }
    }
  }

  // Encode: one segment per line where we have a source position; empty
  // for lines we don't.
  const groups: string[] = [];
  let prevGenCol = 0;
  let prevSrcLine = 0;
  let prevSrcCol = 0;
  for (const entry of lineMap) {
    if (entry === null) {
      groups.push("");
      // Generated column resets at every line in Source Map v3, but the
      // *delta* tracking resets too: we restart prevGenCol at 0 for the
      // first segment of each line.
      prevGenCol = 0;
      continue;
    }
    const [srcLine, srcCol] = entry;
    // Segment: [genCol, sourceIndex, srcLine, srcCol]. genCol delta
    // resets to 0 at the start of every line.
    const seg = [
      vlq(0 - prevGenCol),
      vlq(0), // sourceIndex (we only have one source file)
      vlq(srcLine - prevSrcLine),
      vlq(srcCol - prevSrcCol),
    ].join("");
    groups.push(seg);
    prevGenCol = 0;
    prevSrcLine = srcLine;
    prevSrcCol = srcCol;
  }
  return groups.join(";");
}

/**
 * Build a cache mapping line index → byte offset of that line's start.
 * Used to convert byte offsets back to (line, column) without rescanning.
 */
function buildLineStartCache(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}

function offsetToLineCol(
  offset: number,
  lineStarts: readonly number[]
): [number, number] {
  // Binary search for the largest line-start <= offset.
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (lineStarts[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  return [lo, offset - lineStarts[lo]!];
}

/**
 * Source map v3 VLQ encoding. Numbers are stored as base64-VLQ with a
 * sign bit in the lowest position.
 */
const VLQ_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function vlq(num: number): string {
  let v = num < 0 ? ((-num) << 1) | 1 : num << 1;
  let out = "";
  do {
    let digit = v & 31;
    v >>>= 5;
    if (v > 0) digit |= 32;
    out += VLQ_CHARS[digit];
  } while (v > 0);
  return out;
}

/**
 * Append the `//# sourceMappingURL=…` comment to a generated TS string.
 * The URL is the basename of the map file so it resolves alongside the
 * emitted .ts.
 */
export function appendSourceMappingURL(ts: string, mapBasename: string): string {
  const sep = ts.endsWith("\n") ? "" : "\n";
  return `${ts}${sep}//# sourceMappingURL=${mapBasename}\n`;
}
