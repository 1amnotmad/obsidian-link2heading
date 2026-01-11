import type { HeadingCache, EditorPosition } from "obsidian";
import type { Link2HeadingSettings } from "./settings";

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
	settings: Link2HeadingSettings
): InsertionResult | null {
	const topLine = getLineAfterFrontmatter(editor);

	if (!settings.parentHeading) {
		return { insertionPoint: { line: topLine, ch: 0 }, parentLevel: null, needsParentCreation: false };
	}

	const parentHeading = existingHeadings?.find(
		(h) => h.heading.toLowerCase() === settings.parentHeading.toLowerCase()
	);

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
			return { insertionPoint: { line: topLine, ch: 0 }, parentLevel: null, needsParentCreation: true };
		case "none":
			return null;
	}
}

/** Builds markdown text for heading insertion with proper spacing. */
export function buildHeadingText(
	headingText: string,
	level: number,
	parentHeading: string | null,
	parentLevel: number,
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
		text += `${"#".repeat(parentLevel)} ${parentHeading}\n\n`;
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
	if (!linktext.includes("#")) return null;

	const [filePart, headingPart] = linktext.split("#");
	if (!headingPart) return null;

	const resolvedPath = resolveFile(filePart || "", sourcePath);
	return {
		file: resolvedPath || filePart || "",
		heading: decodeURIComponent(headingPart),
	};
}
