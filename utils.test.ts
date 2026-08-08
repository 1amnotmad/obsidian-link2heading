jest.mock("obsidian", () => ({
	AbstractInputSuggest: class {},
	PluginSettingTab: class {},
	Setting: class {},
	TFolder: class {},
	prepareFuzzySearch: jest.fn(),
	setIcon: jest.fn(),
}), { virtual: true });

import {
	getLineAfterFrontmatter,
	calculateHeadingLevel,
	findInsertionPoint,
	buildHeadingText,
	isHeadingTargetFile,
	parseLinkWithHeading,
	parseHeadingValue,
	resolveHeadingSettings,
	EditorLike,
} from "./utils";
import { parseSettingsData } from "./settings";
import type { HeadingCache } from "obsidian";
import type {
	FileRule,
	FolderRule,
	FrontmatterRule,
	HeadingRule,
	HeadingRuleEntry,
	HeadingRuleBehavior,
	RuleFallback,
} from "./settings";

const noFallback: RuleFallback = { mode: "none" };

function behavior(parentHeading: string): HeadingRuleBehavior {
	return {
		parentHeading,
		headingLevel: "h2",
		missingParentBehavior: "top",
	};
}

function fileRule(path: string, parentHeading: string): FileRule {
	return { ...behavior(parentHeading), matchType: "file", path };
}

function folderRule(folder: string, parentHeading: string): FolderRule {
	return { ...behavior(parentHeading), matchType: "folder", folder };
}

function headingRule(heading: string, parentHeading: string): HeadingRule {
	return { ...behavior(parentHeading), matchType: "heading", heading };
}

function frontmatterRule(
	property: string,
	value: string,
	parentHeading: string,
	anyValue = false
): FrontmatterRule {
	return {
		...behavior(parentHeading),
		matchType: "frontmatter",
		property,
		value,
		anyValue,
	};
}

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

describe("parseSettingsData", () => {
	it("uses fresh defaults for missing and legacy settings", () => {
		expect(parseSettingsData(null)).toEqual({ rules: [], fallback: { mode: "none" } });
		expect(parseSettingsData({
			parentHeading: "## Notes",
			headingLevel: "h2",
			missingParentBehavior: "create",
		})).toEqual({ rules: [], fallback: { mode: "none" } });
	});

	it("keeps valid rules, migrates path rules, discards malformed rules, and normalizes behavior values", () => {
		const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
		const settings = parseSettingsData({
			rules: [
				{
					matchType: "path",
					path: "Projects/Meeting",
					parentHeading: "## Notes",
					headingLevel: "h9",
					missingParentBehavior: "invalid",
				},
				{ matchType: "folder", folder: 42 },
			],
			fallback: {
				mode: "global",
				rule: {
					matchType: "global",
					parentHeading: "Fallback",
					headingLevel: "h1",
					missingParentBehavior: "none",
				},
			},
		});

		expect(settings).toEqual({
			rules: [{
				matchType: "file",
				path: "Projects/Meeting",
				parentHeading: "## Notes",
				headingLevel: "auto",
				missingParentBehavior: "top",
			}],
			fallback: {
				mode: "global",
				rule: {
					matchType: "global",
					parentHeading: "Fallback",
					headingLevel: "h1",
					missingParentBehavior: "none",
				},
			},
		});
		expect(warn).toHaveBeenCalledTimes(1);
		warn.mockRestore();
	});

	it("loads heading rules only when the heading field exists", () => {
		const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
		const settings = parseSettingsData({
			rules: [
				{
					matchType: "heading",
					heading: "### Events by date",
					parentHeading: "## 2024 Events",
					headingLevel: "auto",
					missingParentBehavior: "create",
				},
				{
					matchType: "heading",
					parentHeading: "",
					headingLevel: "auto",
					missingParentBehavior: "top",
				},
			],
			fallback: { mode: "none" },
		});

		expect(settings.rules).toEqual([{
			matchType: "heading",
			heading: "### Events by date",
			parentHeading: "## 2024 Events",
			headingLevel: "auto",
			missingParentBehavior: "create",
		}]);
		expect(warn).toHaveBeenCalledTimes(1);
		warn.mockRestore();
	});

	it("resets a malformed Global fallback to Do Nothing", () => {
		const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
		expect(parseSettingsData({
			rules: "not-an-array",
			fallback: { mode: "global", rule: { matchType: "global" } },
		})).toEqual({ rules: [], fallback: { mode: "none" } });
		expect(warn).toHaveBeenCalledTimes(1);
		warn.mockRestore();
	});
});

describe("parseHeadingValue", () => {
	it.each([
		["# Notes", { level: 1, text: "Notes" }],
		["## Notes", { level: 2, text: "Notes" }],
		["### Events by date", { level: 3, text: "Events by date" }],
		["#### Case Sensitive ", { level: 4, text: "Case Sensitive " }],
	])("parses %p", (value, expected) => {
		expect(parseHeadingValue(value)).toEqual(expected);
	});

	it.each(["", "Notes", "#", "##", "# ", "### ", "##Notes", " ## Notes"])(
		"rejects malformed value %p",
		(value) => {
			expect(parseHeadingValue(value)).toBeNull();
		}
	);
});

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
	const defaultSettings: HeadingRuleBehavior = {
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
		const settings = { ...defaultSettings, parentHeading: "## Notes" };

		const result = findInsertionPoint(editor, headings, settings);

		expect(result).toEqual({
			insertionPoint: { line: 2, ch: 0 },
			parentLevel: 2,
			needsParentCreation: false,
		});
	});

	it("matches parent headings case-sensitively", () => {
		const editor = createMockEditor(["## NOTES", "Content"]);
		const headings = [createMockHeading("NOTES", 2, 0)];
		const settings = { ...defaultSettings, parentHeading: "## NOTES" };

		const result = findInsertionPoint(editor, headings, settings);

		expect(result?.parentLevel).toBe(2);
	});

	it("does not match a parent with different case or level", () => {
		const editor = createMockEditor(["## Notes", "Content"]);
		const headings = [createMockHeading("Notes", 2, 0)];

		expect(findInsertionPoint(editor, headings, {
			...defaultSettings,
			parentHeading: "## notes",
		})?.parentLevel).toBeNull();
		expect(findInsertionPoint(editor, headings, {
			...defaultSettings,
			parentHeading: "### Notes",
		})?.parentLevel).toBeNull();
	});

	it("returns top when parent not found and behavior is 'top'", () => {
		const editor = createMockEditor(["# Title", "Content"]);
		const settings = {
			...defaultSettings,
			parentHeading: "## Notes",
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
			parentHeading: "## Notes",
			missingParentBehavior: "create" as const,
		};

		const result = findInsertionPoint(editor, [], settings);

		expect(result).toEqual({
			insertionPoint: { line: 0, ch: 0 },
			parentLevel: 2,
			needsParentCreation: true,
		});
	});

	it("does not create a malformed parent heading", () => {
		const editor = createMockEditor(["# Title", "Content"]);
		const settings = {
			...defaultSettings,
			parentHeading: "Notes",
			missingParentBehavior: "create" as const,
		};

		expect(findInsertionPoint(editor, [], settings)).toEqual({
			insertionPoint: { line: 0, ch: 0 },
			parentLevel: null,
			needsParentCreation: false,
		});
	});

	it("returns null when parent not found and behavior is 'none'", () => {
		const editor = createMockEditor(["# Title", "Content"]);
		const settings = {
			...defaultSettings,
			parentHeading: "## Notes",
			missingParentBehavior: "none" as const,
		};

		const result = findInsertionPoint(editor, [], settings);

		expect(result).toBeNull();
	});
});

describe("resolveHeadingSettings", () => {
	describe("file rules", () => {
		it("matches exact paths with optional .md and normalized slashes", () => {
			const rules = [fileRule(" /Projects\\Active//Meeting.md ", "File")];

			expect(resolveHeadingSettings(
				{ path: "Projects/Active/Meeting.md" }, null, rules, noFallback
			)).toEqual(behavior("File"));
		});

		it("uses the full path for same-name notes", () => {
			const rules = [fileRule("Archive/Meeting", "Archive")];

			expect(resolveHeadingSettings(
				{ path: "Projects/Meeting.md" }, null, rules, noFallback
			)).toBeNull();
		});

		it("skips empty criteria and uses the first matching rule", () => {
			const rules = [
				fileRule("", "Empty"),
				fileRule("Note", "First"),
				fileRule("Note.md", "Second"),
			];

			expect(resolveHeadingSettings(
				{ path: "Note.md" }, null, rules, noFallback
			)).toEqual(behavior("First"));
		});

		it("beats folder, heading, and frontmatter rules regardless of array order", () => {
			const rules: HeadingRuleEntry[] = [
				frontmatterRule("type", "meeting", "Frontmatter"),
				headingRule("# Title", "Heading"),
				folderRule("Projects", "Folder"),
				fileRule("Projects/Meeting", "File"),
			];

			expect(resolveHeadingSettings(
				{ path: "Projects/Meeting.md" },
				{
					frontmatter: { type: "meeting" },
					headings: [{ heading: "Title", level: 1 }],
				},
				rules,
				noFallback
			)).toEqual(behavior("File"));
		});
	});

	describe("folder rules", () => {
		it.each(["Projects/Note.md", "Projects/Active/Note.md"])(
			"matches direct and nested descendants: %s",
			(path) => {
				expect(resolveHeadingSettings(
					{ path }, null, [folderRule("Projects/", "Folder")], noFallback
				)).toEqual(behavior("Folder"));
			}
		);

		it("checks folder boundaries", () => {
			expect(resolveHeadingSettings(
				{ path: "Projects2/Note.md" }, null,
				[folderRule("Projects/", "Folder")], noFallback
			)).toBeNull();
		});

		it("normalizes leading, trailing, duplicate, and backslash separators", () => {
			expect(resolveHeadingSettings(
				{ path: "Projects/Active/Note.md" }, null,
				[folderRule(" /Projects\\Active// ", "Folder")], noFallback
			)).toEqual(behavior("Folder"));
		});

		it("uses the deepest matching folder regardless of definition order", () => {
			const rules = [
				folderRule("Projects", "Shallow"),
				folderRule("Projects/Active", "Deep"),
			];

			expect(resolveHeadingSettings(
				{ path: "Projects/Active/Note.md" }, null, rules, noFallback
			)).toEqual(behavior("Deep"));
		});

		it("uses the first-defined rule for equal-depth matches", () => {
			const rules = [
				folderRule("Projects/Active", "First"),
				folderRule("Projects/Active/", "Second"),
			];

			expect(resolveHeadingSettings(
				{ path: "Projects/Active/Note.md" }, null, rules, noFallback
			)).toEqual(behavior("First"));
		});

		it("skips empty criteria and beats heading and frontmatter rules", () => {
			const rules: HeadingRuleEntry[] = [
				frontmatterRule("type", "meeting", "Frontmatter"),
				headingRule("# Title", "Heading"),
				folderRule("", "Empty"),
				folderRule("Projects", "Folder"),
			];

			expect(resolveHeadingSettings(
				{ path: "Projects/Note.md" },
				{
					frontmatter: { type: "meeting" },
					headings: [{ heading: "Title", level: 1 }],
				},
				rules,
				noFallback
			)).toEqual(behavior("Folder"));
		});
	});

	describe("heading rules", () => {
		it("matches an exact case-sensitive heading level and text anywhere in the file", () => {
			const metadata = {
				headings: [
					{ heading: "Overview", level: 1 },
					{ heading: "Events by date", level: 3 },
				],
			};

			expect(resolveHeadingSettings(
				{ path: "Events.md" }, metadata,
				[headingRule("### Events by date", "## 2024 Events")], noFallback
			)).toEqual(behavior("## 2024 Events"));
		});

		it("does not match a different level, case, or malformed rule value", () => {
			const metadata = { headings: [{ heading: "Events by date", level: 3 }] };
			const rules = [
				headingRule("## Events by date", "Level"),
				headingRule("### Events By Date", "Case"),
				headingRule("Events by date", "Malformed"),
				headingRule("### ", "No text"),
			];

			expect(resolveHeadingSettings(
				{ path: "Events.md" }, metadata, rules, noFallback
			)).toBeNull();
		});

		it("uses the first-defined matching heading rule", () => {
			const rules = [
				headingRule("# Title", "First"),
				headingRule("# Title", "Second"),
			];

			expect(resolveHeadingSettings(
				{ path: "Note.md" }, { headings: [{ heading: "Title", level: 1 }] },
				rules, noFallback
			)).toEqual(behavior("First"));
		});

		it("beats frontmatter regardless of array order", () => {
			const rules: HeadingRuleEntry[] = [
				frontmatterRule("type", "meeting", "Frontmatter"),
				headingRule("## Notes", "Heading"),
			];

			expect(resolveHeadingSettings(
				{ path: "Note.md" },
				{
					frontmatter: { type: "meeting" },
					headings: [{ heading: "Notes", level: 2 }],
				},
				rules,
				noFallback
			)).toEqual(behavior("Heading"));
		});
	});

	describe("frontmatter rules", () => {
		it("matches property names case-insensitively and scalar values exactly", () => {
			const rules = [frontmatterRule("TYPE", "meeting", "Frontmatter")];

			expect(resolveHeadingSettings(
				{ path: "Note.md" }, { frontmatter: { Type: "meeting" } }, rules, noFallback
			)).toEqual(behavior("Frontmatter"));
			expect(resolveHeadingSettings(
				{ path: "Note.md" }, { frontmatter: { type: "Meeting" } }, rules, noFallback
			)).toBeNull();
		});

		it("matches an item in an array value", () => {
			expect(resolveHeadingSettings(
				{ path: "Note.md" },
				{ frontmatter: { tags: ["project", "urgent"] } },
				[frontmatterRule("tags", "urgent", "Array")],
				noFallback
			)).toEqual(behavior("Array"));
		});

		it.each([false, null, 0, ""])("matches any existing value including %p", (value) => {
			expect(resolveHeadingSettings(
				{ path: "Note.md" },
				{ frontmatter: { status: value } },
				[frontmatterRule("status", "stored", "Any", true)],
				noFallback
			)).toEqual(behavior("Any"));
		});

		it("does not match any-value when the property is absent", () => {
			expect(resolveHeadingSettings(
				{ path: "Note.md" }, { frontmatter: {} },
				[frontmatterRule("status", "", "Any", true)], noFallback
			)).toBeNull();
		});

		it("does not coerce number or boolean values to strings", () => {
			const rules = [
				frontmatterRule("count", "1", "Number"),
				frontmatterRule("active", "true", "Boolean"),
			];

			expect(resolveHeadingSettings(
				{ path: "Note.md" },
				{ frontmatter: { count: 1, active: true } },
				rules,
				noFallback
			)).toBeNull();
		});

		it("skips empty properties and values unless any-value is enabled", () => {
			const rules = [
				frontmatterRule("", "meeting", "Empty property"),
				frontmatterRule("type", "", "Empty value"),
			];

			expect(resolveHeadingSettings(
				{ path: "Note.md" }, { frontmatter: { type: "" } }, rules, noFallback
			)).toBeNull();
		});

		it("uses the first-defined matching rule", () => {
			const rules = [
				frontmatterRule("type", "meeting", "First"),
				frontmatterRule("type", "meeting", "Second"),
			];

			expect(resolveHeadingSettings(
				{ path: "Note.md" }, { frontmatter: { type: "meeting" } }, rules, noFallback
			)).toEqual(behavior("First"));
		});
	});

	describe("fallback and precedence", () => {
		const globalFallback: RuleFallback = {
			mode: "global",
			rule: { ...behavior("Global"), matchType: "global" },
		};

		it("uses frontmatter before Global", () => {
			expect(resolveHeadingSettings(
				{ path: "Note.md" },
				{ frontmatter: { type: "meeting" } },
				[frontmatterRule("type", "meeting", "Frontmatter")],
				globalFallback
			)).toEqual(behavior("Frontmatter"));
		});

		it("returns Global when no rule matches and null for Do Nothing", () => {
			expect(resolveHeadingSettings(
				{ path: "Note.md" }, null, [], globalFallback
			)).toEqual(behavior("Global"));
			expect(resolveHeadingSettings(
				{ path: "Note.md" }, null, [], noFallback
			)).toBeNull();
		});

		it("matches file and folder rules without metadata", () => {
			expect(resolveHeadingSettings(
				{ path: "Projects/Note.md" }, null,
				[fileRule("Projects/Note", "File")], noFallback
			)).toEqual(behavior("File"));
			expect(resolveHeadingSettings(
				{ path: "Projects/Note.md" }, null,
				[folderRule("Projects", "Folder")], noFallback
			)).toEqual(behavior("Folder"));
		});

		it("returns behavior fields only", () => {
			const result = resolveHeadingSettings(
				{ path: "Note.md" }, null, [fileRule("Note", "File")], noFallback
			);

			expect(result).toEqual(behavior("File"));
			expect(result).not.toHaveProperty("matchType");
			expect(result).not.toHaveProperty("path");
		});
	});
});

describe("buildHeadingText", () => {
	it("builds simple heading with trailing newlines", () => {
		const result = buildHeadingText("My Heading", 3, null, false, "");

		expect(result.text).toBe("### My Heading\n\n");
		expect(result.linesAdded).toBe(2);
	});

	it("adds leading newline when previous line has content", () => {
		const result = buildHeadingText("My Heading", 2, null, false, "Some content");

		expect(result.text).toBe("\n## My Heading\n\n");
		expect(result.linesAdded).toBe(3);
	});

	it("does not add leading newline after frontmatter closing", () => {
		const result = buildHeadingText("My Heading", 2, null, false, "---");

		expect(result.text).toBe("## My Heading\n\n");
		expect(result.linesAdded).toBe(2);
	});

	it("includes the configured parent heading and level when creation is needed", () => {
		const result = buildHeadingText("Child", 3, "## Parent", true, "");

		expect(result.text).toBe("## Parent\n\n### Child\n\n");
		expect(result.linesAdded).toBe(4);
	});

	it("handles all heading levels", () => {
		for (let level = 1; level <= 6; level++) {
			const result = buildHeadingText("Test", level, null, false, "");
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
			file: "source.md",
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

	it("preserves hash characters after the heading separator", () => {
		const result = parseLinkWithHeading("note#Issue #123", "", mockResolve);

		expect(result?.heading).toBe("Issue #123");
	});

	it.each([
		"note#First%0A%0Ainjected",
		"note#First%0Dinjected",
		"note#First\ninjected",
	])("rejects multiline headings: %p", (linktext) => {
		expect(parseLinkWithHeading(linktext, "", mockResolve)).toBeNull();
	});

	it("keeps malformed percent encoding as literal text instead of throwing", () => {
		expect(() => parseLinkWithHeading("note#100% done", "", mockResolve)).not.toThrow();
		expect(parseLinkWithHeading("note#100% done", "", mockResolve)?.heading).toBe("100% done");
	});

	it("returns null when heading part is empty", () => {
		expect(parseLinkWithHeading("note#", "", mockResolve)).toBeNull();
	});
});

describe("isHeadingTargetFile", () => {
	it.each([
		["Projects/Note.md", "Projects/Note"],
		["Projects\\Note.md", " /Projects/Note.md "],
		["Projects/Note.md", "Note"],
	])("matches normalized exact paths and unresolved basenames", (filePath, targetPath) => {
		expect(isHeadingTargetFile(filePath, targetPath)).toBe(true);
	});

	it.each([
		["AnotherNote.md", "Note"],
		["Folder/AnotherNote.md", "Note.md"],
		["Archive/Note.md", "Projects/Note"],
	])("does not suffix-match or ignore a resolved folder: %s / %s", (filePath, targetPath) => {
		expect(isHeadingTargetFile(filePath, targetPath)).toBe(false);
	});

	it("rejects an empty target", () => {
		expect(isHeadingTargetFile("Note.md", "")).toBe(false);
	});
});
