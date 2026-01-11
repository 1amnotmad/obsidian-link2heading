import {
	getLineAfterFrontmatter,
	calculateHeadingLevel,
	findInsertionPoint,
	buildHeadingText,
	parseLinkWithHeading,
	EditorLike,
} from "./utils";
import type { HeadingCache } from "obsidian";
import type { Link2HeadingSettings } from "./settings";

function createMockEditor(lines: string[]): EditorLike {
	return {
		getLine: (line: number) => lines[line] || "",
		lineCount: () => lines.length,
	};
}

function createMockHeading(
	heading: string,
	level: number,
	endLine: number
): HeadingCache {
	return {
		heading,
		level,
		position: {
			start: { line: endLine, col: 0, offset: 0 },
			end: { line: endLine, col: heading.length + level + 1, offset: 0 },
		},
	};
}

describe("getLineAfterFrontmatter", () => {
	it("returns 0 when no frontmatter exists", () => {
		const editor = createMockEditor(["# Title", "Content"]);
		expect(getLineAfterFrontmatter(editor)).toBe(0);
	});

	it("returns line after closing --- when frontmatter exists", () => {
		const editor = createMockEditor([
			"---",
			"title: Test",
			"---",
			"# Content",
		]);
		expect(getLineAfterFrontmatter(editor)).toBe(3);
	});

	it("returns 0 when frontmatter is not closed", () => {
		const editor = createMockEditor(["---", "title: Test", "# Content"]);
		expect(getLineAfterFrontmatter(editor)).toBe(0);
	});

	it("handles empty file", () => {
		const editor = createMockEditor([]);
		expect(getLineAfterFrontmatter(editor)).toBe(0);
	});

	it("handles frontmatter with multiple fields", () => {
		const editor = createMockEditor([
			"---",
			"title: Test",
			"date: 2024-01-01",
			"tags: [a, b]",
			"---",
			"Content here",
		]);
		expect(getLineAfterFrontmatter(editor)).toBe(5);
	});
});

describe("calculateHeadingLevel", () => {
	it("returns specified level when not auto", () => {
		expect(calculateHeadingLevel("h1", null)).toBe(1);
		expect(calculateHeadingLevel("h2", null)).toBe(2);
		expect(calculateHeadingLevel("h3", null)).toBe(3);
		expect(calculateHeadingLevel("h6", null)).toBe(6);
	});

	it("ignores parent level when specific level is set", () => {
		expect(calculateHeadingLevel("h2", 1)).toBe(2);
		expect(calculateHeadingLevel("h4", 2)).toBe(4);
	});

	it("returns parent level + 1 when auto and parent exists", () => {
		expect(calculateHeadingLevel("auto", 1)).toBe(2);
		expect(calculateHeadingLevel("auto", 2)).toBe(3);
		expect(calculateHeadingLevel("auto", 5)).toBe(6);
	});

	it("caps at h6 when auto would exceed it", () => {
		expect(calculateHeadingLevel("auto", 6)).toBe(6);
	});

	it("returns 3 when auto and no parent", () => {
		expect(calculateHeadingLevel("auto", null)).toBe(3);
	});

	it("clamps invalid levels to valid range", () => {
		expect(calculateHeadingLevel("h0", null)).toBe(1);
		expect(calculateHeadingLevel("h7", null)).toBe(6);
	});
});

describe("findInsertionPoint", () => {
	const defaultSettings: Link2HeadingSettings = {
		parentHeading: "",
		headingLevel: "auto",
		missingParentBehavior: "top",
	};

	it("returns top of file when no parent heading configured", () => {
		const editor = createMockEditor(["# Title", "Content"]);
		const result = findInsertionPoint(editor, undefined, defaultSettings);

		expect(result).toEqual({
			insertionPoint: { line: 0, ch: 0 },
			parentLevel: null,
			needsParentCreation: false,
		});
	});

	it("returns after frontmatter when no parent heading configured", () => {
		const editor = createMockEditor(["---", "title: Test", "---", "Content"]);
		const result = findInsertionPoint(editor, undefined, defaultSettings);

		expect(result).toEqual({
			insertionPoint: { line: 3, ch: 0 },
			parentLevel: null,
			needsParentCreation: false,
		});
	});

	it("returns after parent heading when found", () => {
		const editor = createMockEditor(["# Title", "## Notes", "Content"]);
		const headings = [
			createMockHeading("Title", 1, 0),
			createMockHeading("Notes", 2, 1),
		];
		const settings = { ...defaultSettings, parentHeading: "Notes" };

		const result = findInsertionPoint(editor, headings, settings);

		expect(result).toEqual({
			insertionPoint: { line: 2, ch: 0 },
			parentLevel: 2,
			needsParentCreation: false,
		});
	});

	it("is case-insensitive for parent heading matching", () => {
		const editor = createMockEditor(["## NOTES", "Content"]);
		const headings = [createMockHeading("NOTES", 2, 0)];
		const settings = { ...defaultSettings, parentHeading: "notes" };

		const result = findInsertionPoint(editor, headings, settings);

		expect(result?.parentLevel).toBe(2);
	});

	it("returns top when parent not found and behavior is 'top'", () => {
		const editor = createMockEditor(["# Title", "Content"]);
		const settings = {
			...defaultSettings,
			parentHeading: "Notes",
			missingParentBehavior: "top" as const,
		};

		const result = findInsertionPoint(editor, [], settings);

		expect(result).toEqual({
			insertionPoint: { line: 0, ch: 0 },
			parentLevel: null,
			needsParentCreation: false,
		});
	});

	it("returns top with needsParentCreation when behavior is 'create'", () => {
		const editor = createMockEditor(["# Title", "Content"]);
		const settings = {
			...defaultSettings,
			parentHeading: "Notes",
			missingParentBehavior: "create" as const,
		};

		const result = findInsertionPoint(editor, [], settings);

		expect(result).toEqual({
			insertionPoint: { line: 0, ch: 0 },
			parentLevel: null,
			needsParentCreation: true,
		});
	});

	it("returns null when parent not found and behavior is 'none'", () => {
		const editor = createMockEditor(["# Title", "Content"]);
		const settings = {
			...defaultSettings,
			parentHeading: "Notes",
			missingParentBehavior: "none" as const,
		};

		const result = findInsertionPoint(editor, [], settings);

		expect(result).toBeNull();
	});
});

describe("buildHeadingText", () => {
	it("builds simple heading with trailing newlines", () => {
		const result = buildHeadingText("My Heading", 3, null, 2, false, "");

		expect(result.text).toBe("### My Heading\n\n");
		expect(result.linesAdded).toBe(2);
	});

	it("adds leading newline when previous line has content", () => {
		const result = buildHeadingText("My Heading", 2, null, 2, false, "Some content");

		expect(result.text).toBe("\n## My Heading\n\n");
		expect(result.linesAdded).toBe(3);
	});

	it("does not add leading newline after frontmatter closing", () => {
		const result = buildHeadingText("My Heading", 2, null, 2, false, "---");

		expect(result.text).toBe("## My Heading\n\n");
		expect(result.linesAdded).toBe(2);
	});

	it("includes parent heading when needsParentCreation is true", () => {
		const result = buildHeadingText("Child", 3, "Parent", 2, true, "");

		expect(result.text).toBe("## Parent\n\n### Child\n\n");
		expect(result.linesAdded).toBe(4);
	});

	it("handles all heading levels", () => {
		for (let level = 1; level <= 6; level++) {
			const result = buildHeadingText("Test", level, null, 2, false, "");
			const expectedMarks = "#".repeat(level);
			expect(result.text).toBe(`${expectedMarks} Test\n\n`);
		}
	});
});

describe("parseLinkWithHeading", () => {
	const mockResolve = (linkPath: string) => 
		linkPath ? `${linkPath}.md` : null;

	it("returns null for links without heading", () => {
		expect(parseLinkWithHeading("note", "", mockResolve)).toBeNull();
		expect(parseLinkWithHeading("folder/note", "", mockResolve)).toBeNull();
	});

	it("parses link with file and heading", () => {
		const result = parseLinkWithHeading("note#heading", "source.md", mockResolve);

		expect(result).toEqual({
			file: "note.md",
			heading: "heading",
		});
	});

	it("parses link with only heading (same file)", () => {
		const result = parseLinkWithHeading("#heading", "source.md", () => null);

		expect(result).toEqual({
			file: "",
			heading: "heading",
		});
	});

	it("decodes URL-encoded headings", () => {
		const result = parseLinkWithHeading("note#My%20Heading", "", mockResolve);

		expect(result?.heading).toBe("My Heading");
	});

	it("handles special characters in headings", () => {
		const result = parseLinkWithHeading("note#Hello%20%26%20World", "", mockResolve);

		expect(result?.heading).toBe("Hello & World");
	});

	it("returns null when heading part is empty", () => {
		expect(parseLinkWithHeading("note#", "", mockResolve)).toBeNull();
	});
});
