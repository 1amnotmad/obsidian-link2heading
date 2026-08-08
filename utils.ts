import type { HeadingCache, EditorPosition } from "obsidian";
import type {
	HeadingRuleEntry,
	HeadingRuleBehavior,
	RuleFallback,
} from "./settings";

export interface RuleMatchFile {
	path: string;
}

export interface RuleMatchMetadata {
	frontmatter?: Record<string, unknown>;
	headings?: RuleMatchHeading[];
}

export interface RuleMatchHeading {
	heading: string;
	level: number;
}

export interface InsertionResult {
	insertionPoint: EditorPosition;
	parentLevel: number | null;
	needsParentCreation: boolean;
}

/** Minimal editor interface for testability. */
export interface EditorLike {
	getLine(line: number): string;
	lineCount(): number;
}

/** Parses a Markdown heading value that includes its level prefix. */
export function parseHeadingValue(value: string): { level: number; text: string } | null {
	const match = /^(#+) (.*\S.*)$/.exec(value);
	if (!match) return null;

	return {
		level: match[1].length,
		text: match[2],
	};
}

function normalizeSlashes(path: string): string {
	return path.trim()
		.replace(/\\/g, "/")
		.replace(/^\/+/, "")
		.replace(/\/{2,}/g, "/");
}

function normalizePath(path: string): string {
	return normalizeSlashes(path).replace(/\.md$/, "");
}

/** Checks whether a Markdown file is the target of a parsed heading link. */
export function isHeadingTargetFile(filePath: string, targetPath: string): boolean {
	const openedPath = normalizePath(filePath);
	const target = normalizePath(targetPath);
	if (!openedPath || !target) return false;
	if (openedPath === target) return true;

	// Unresolved links may only have a basename. Compare the whole basename,
	// rather than using a suffix match that lets AnotherNote match Note.
	if (target.includes("/")) return false;
	return openedPath.slice(openedPath.lastIndexOf("/") + 1) === target;
}

function normalizeFolder(folder: string): string {
	return normalizeSlashes(folder).replace(/\/+$/, "");
}

function getBehavior(rule: HeadingRuleBehavior): HeadingRuleBehavior {
	return {
		parentHeading: rule.parentHeading,
		headingLevel: rule.headingLevel,
		missingParentBehavior: rule.missingParentBehavior,
	};
}

/** Resolves effective heading behavior using fixed rule-type precedence. */
export function resolveHeadingSettings(
	file: RuleMatchFile,
	metadata: RuleMatchMetadata | null,
	rules: HeadingRuleEntry[],
	fallback: RuleFallback
): HeadingRuleBehavior | null {
	const filePath = normalizePath(file.path);

	for (const rule of rules) {
		if (rule.matchType !== "file") continue;
		const rulePath = normalizePath(rule.path);
		if (rulePath && rulePath === filePath) return getBehavior(rule);
	}

	let folderMatch: HeadingRuleEntry | null = null;
	let folderMatchDepth = -1;
	for (const rule of rules) {
		if (rule.matchType !== "folder") continue;
		const folder = normalizeFolder(rule.folder);
		if (!folder || !filePath.startsWith(folder + "/")) continue;

		const depth = folder.split("/").length;
		if (depth > folderMatchDepth) {
			folderMatch = rule;
			folderMatchDepth = depth;
		}
	}
	if (folderMatch) return getBehavior(folderMatch);

	const headings = metadata?.headings;
	if (headings) {
		for (const rule of rules) {
			if (rule.matchType !== "heading") continue;
			const heading = parseHeadingValue(rule.heading);
			if (!heading) continue;

			if (headings.some(
				(candidate) => candidate.level === heading.level && candidate.heading === heading.text
			)) {
				return getBehavior(rule);
			}
		}
	}

	const frontmatter = metadata?.frontmatter;
	if (frontmatter) {
		for (const rule of rules) {
			if (rule.matchType !== "frontmatter") continue;
			const property = rule.property.trim();
			if (!property || (!rule.anyValue && !rule.value)) continue;

			const key = Object.keys(frontmatter).find(
				(candidate) => candidate.toLowerCase() === property.toLowerCase()
			);
			if (key === undefined) continue;
			if (rule.anyValue) return getBehavior(rule);

			const value = frontmatter[key];
			if (Array.isArray(value) ? value.includes(rule.value) : value === rule.value) {
				return getBehavior(rule);
			}
		}
	}

	return fallback.mode === "global" ? getBehavior(fallback.rule) : null;
}

/** Returns the first line after YAML frontmatter, or 0 if none exists. */
export function getLineAfterFrontmatter(editor: EditorLike): number {
	if (editor.getLine(0) !== "---") return 0;

	for (let i = 1; i < editor.lineCount(); i++) {
		if (editor.getLine(i) === "---") return i + 1;
	}
	return 0;
}

/** Calculates heading level based on settings and parent context. */
export function calculateHeadingLevel(
	headingLevelSetting: string,
	parentLevel: number | null
): number {
	if (headingLevelSetting !== "auto") {
		const level = parseInt(headingLevelSetting.replace("h", ""));
		return Math.min(Math.max(level, 1), 6);
	}
	if (parentLevel !== null) return Math.min(parentLevel + 1, 6);
	return 3;
}

/** Determines where to insert a new heading based on settings. */
export function findInsertionPoint(
	editor: EditorLike,
	existingHeadings: HeadingCache[] | undefined,
	settings: HeadingRuleBehavior
): InsertionResult | null {
	const topLine = getLineAfterFrontmatter(editor);

	if (!settings.parentHeading) {
		return { insertionPoint: { line: topLine, ch: 0 }, parentLevel: null, needsParentCreation: false };
	}

	const parsedParentHeading = parseHeadingValue(settings.parentHeading);
	const parentHeading = parsedParentHeading
		? existingHeadings?.find(
			(h) => h.level === parsedParentHeading.level && h.heading === parsedParentHeading.text
		)
		: undefined;

	if (parentHeading) {
		return {
			insertionPoint: { line: parentHeading.position.end.line + 1, ch: 0 },
			parentLevel: parentHeading.level,
			needsParentCreation: false,
		};
	}

	switch (settings.missingParentBehavior) {
		case "top":
			return { insertionPoint: { line: topLine, ch: 0 }, parentLevel: null, needsParentCreation: false };
		case "create":
			return {
				insertionPoint: { line: topLine, ch: 0 },
				parentLevel: parsedParentHeading?.level ?? null,
				needsParentCreation: parsedParentHeading !== null,
			};
		case "none":
			return null;
	}
}

/** Builds markdown text for heading insertion with proper spacing. */
export function buildHeadingText(
	headingText: string,
	level: number,
	parentHeading: string | null,
	needsParentCreation: boolean,
	prevLineContent: string
): { text: string; linesAdded: number } {
	let text = "";
	let linesAdded = 0;

	if (prevLineContent && prevLineContent !== "---") {
		text += "\n";
		linesAdded++;
	}

	if (needsParentCreation && parentHeading) {
		text += `${parentHeading}\n\n`;
		linesAdded += 2;
	}

	text += `${"#".repeat(level)} ${headingText}\n\n`;
	linesAdded += 2;

	return { text, linesAdded };
}

/** Parses a wiki-link into file path and heading components. */
export function parseLinkWithHeading(
	linktext: string,
	sourcePath: string,
	resolveFile: (linkPath: string, sourcePath: string) => string | null
): { file: string; heading: string } | null {
	const headingSeparator = linktext.indexOf("#");
	if (headingSeparator === -1) return null;

	const filePart = linktext.slice(0, headingSeparator);
	const headingPart = linktext.slice(headingSeparator + 1);
	if (!headingPart) return null;

	let heading: string;
	try {
		heading = decodeURIComponent(headingPart);
	} catch {
		heading = headingPart;
	}
	if (/[\r\n]/.test(heading)) return null;

	const resolvedPath = resolveFile(filePart || "", sourcePath);
	return {
		file: resolvedPath || filePart || sourcePath,
		heading,
	};
}
