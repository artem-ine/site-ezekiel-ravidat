import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./env";

export type PatternRule =
  | string
  | {
      pattern: string;
      not?: string[];
    };

export interface GenreDefinition {
  uid: string;
  name: string;
  accent: string;
  description: string;
  patterns: PatternRule[];
  excludeSubjects?: string[];
}

export interface GenreMappingConfig {
  genres: GenreDefinition[];
  ignoreExact: string[];
  ignorePrefixes: string[];
}

export interface MappedGenresResult {
  genres: GenreDefinition[];
  unmappedSubjects: string[];
  ignoredSubjects: string[];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileWordRegex(pat: string): RegExp {
  return new RegExp(`(?:^|\\b)${escapeRegExp(pat)}(?:\\b|$)`, "i");
}

interface CompiledPattern {
  re: RegExp;
  notRegexes: RegExp[];
}

interface CompiledGenre {
  def: GenreDefinition;
  rules: CompiledPattern[];
  excludeRegexes: RegExp[];
}

export class GenreMapper {
  readonly config: GenreMappingConfig;
  private readonly compiled: CompiledGenre[];
  private readonly ignoreExactSet: Set<string>;
  private readonly ignorePrefixes: string[];

  constructor(configPath = path.join(REPO_ROOT, "scripts/genre-mapping.json")) {
    this.config = JSON.parse(
      fs.readFileSync(configPath, "utf8"),
    ) as GenreMappingConfig;
    this.compiled = this.config.genres.map((def) => ({
      def,
      rules: def.patterns.map((rule) =>
        typeof rule === "string"
          ? { re: compileWordRegex(rule), notRegexes: [] }
          : {
              re: compileWordRegex(rule.pattern),
              notRegexes: (rule.not ?? []).map(compileWordRegex),
            },
      ),
      excludeRegexes: (def.excludeSubjects ?? []).map(compileWordRegex),
    }));
    this.ignoreExactSet = new Set(
      this.config.ignoreExact.map((s) => s.toLowerCase().trim()),
    );
    this.ignorePrefixes = this.config.ignorePrefixes.map((s) =>
      s.toLowerCase().trim(),
    );
  }

  mapSubjects(rawSubjects: string[]): MappedGenresResult {
    const matchedMap = new Map<string, GenreDefinition>();
    const unmappedSet = new Set<string>();
    const ignoredSet = new Set<string>();

    const byUid = new Map(this.compiled.map((c) => [c.def.uid, c.def]));

    for (const raw of rawSubjects) {
      const cleaned = raw.trim();
      if (!cleaned) continue;

      const lower = cleaned.toLowerCase();

      // Special structured prefix signals that carry reliable genre info before noise-stripping
      if (lower.startsWith("nyt:young-adult")) {
        const ya = byUid.get("young-adult");
        if (ya) matchedMap.set(ya.uid, ya);
        ignoredSet.add(cleaned);
        continue;
      }
      if (lower.startsWith("nyt:manga")) {
        const gn = byUid.get("graphic-novels");
        if (gn) matchedMap.set(gn.uid, gn);
        ignoredSet.add(cleaned);
        continue;
      }

      // Skip catalog prefixes (series:, franchise:, nyt:, award:, etc.) before regex matching
      // so series names like "series:The Murderbot Diaries" never trip genre keywords like "diaries".
      if (this.ignorePrefixes.some((p) => lower.startsWith(p))) {
        ignoredSet.add(cleaned);
        continue;
      }

      const stripped = lower.replace(/^(?:genre|form)\s*:\s*/i, "").trim();

      let matchedAny = false;
      for (const { def, rules, excludeRegexes } of this.compiled) {
        if (excludeRegexes.some((ex) => ex.test(stripped))) {
          continue;
        }
        const hits = rules.some(
          ({ re, notRegexes }) =>
            re.test(stripped) && !notRegexes.some((nr) => nr.test(stripped)),
        );
        if (hits) {
          matchedMap.set(def.uid, def);
          matchedAny = true;
        }
      }

      if (matchedAny) continue;

      const isIgnored =
        this.ignoreExactSet.has(lower) || this.ignoreExactSet.has(stripped);

      if (isIgnored) {
        ignoredSet.add(cleaned);
      } else {
        unmappedSet.add(cleaned);
      }
    }

    return {
      genres: [...matchedMap.values()],
      unmappedSubjects: [...unmappedSet],
      ignoredSubjects: [...ignoredSet],
    };
  }
}
