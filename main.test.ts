jest.mock("obsidian", () => ({
	AbstractInputSuggest: class {},
	MarkdownView: class {},
	Plugin: class {
		app: unknown;

		constructor(app: unknown) {
			this.app = app;
		}

		async loadData() {
			return null;
		}

		addSettingTab() {}
		register() {}
		registerEvent() {}
	},
	PluginSettingTab: class {},
	Setting: class {},
	TFile: class {},
	TFolder: class {},
	prepareFuzzySearch: jest.fn(),
	resolveSubpath: jest.fn(() => null),
	setIcon: jest.fn(),
}), { virtual: true });

import Link2HeadingPlugin from "./main";

type FileLike = { path: string; basename: string };
type FileOpenHandler = (file: FileLike | null) => Promise<void>;

async function loadPlugin(resolvePath: (linkPath: string) => string | null) {
	let fileOpenHandler: FileOpenHandler | null = null;
	const originalOpenLinkText = jest.fn(async () => undefined);
	const workspace = {
		openLinkText: originalOpenLinkText,
		on: jest.fn((_event: string, handler: FileOpenHandler) => {
			fileOpenHandler = handler;
			return {};
		}),
		getActiveViewOfType: jest.fn(),
	};
	const app = {
		workspace,
		metadataCache: {
			getFirstLinkpathDest: jest.fn((linkPath: string) => {
				const path = resolvePath(linkPath);
				return path ? { path } : null;
			}),
		},
	};
	const plugin = new Link2HeadingPlugin(app as never, {} as never);
	await plugin.onload();

	if (!fileOpenHandler) throw new Error("file-open handler was not registered");
	return { plugin, workspace, originalOpenLinkText, fileOpenHandler };
}

describe("pending heading navigation", () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it("lets Obsidian handle malformed encoding without throwing", async () => {
		const { plugin, workspace, originalOpenLinkText } = await loadPlugin(() => null);

		await expect(workspace.openLinkText("Note#100% done", "Source.md")).resolves.toBeUndefined();
		expect(originalOpenLinkText).toHaveBeenCalledWith("Note#100% done", "Source.md", undefined, undefined);
		expect((plugin as unknown as { pendingHeading: { heading: string } }).pendingHeading.heading)
			.toBe("100% done");
	});

	it("clears stale state whenever the next navigation has no heading", async () => {
		const { plugin, workspace } = await loadPlugin(() => null);

		await workspace.openLinkText("Note#Heading", "Source.md");
		expect((plugin as unknown as { pendingHeading: unknown }).pendingHeading).not.toBeNull();

		await workspace.openLinkText("OtherNote", "Source.md");
		expect((plugin as unknown as { pendingHeading: unknown }).pendingHeading).toBeNull();
	});

	it("does not consume a pending Note link when AnotherNote opens", async () => {
		const { plugin, workspace, fileOpenHandler } = await loadPlugin(() => null);
		const handleHeading = jest.spyOn(
			plugin as unknown as { handleHeadingNavigation: () => Promise<void> },
			"handleHeadingNavigation"
		).mockResolvedValue(undefined);
		const file = { path: "AnotherNote.md", basename: "AnotherNote" };
		workspace.getActiveViewOfType.mockReturnValue({ file });

		await workspace.openLinkText("Note#Heading", "Source.md");
		const handling = fileOpenHandler(file);
		await jest.advanceTimersByTimeAsync(50);
		await handling;

		expect(handleHeading).not.toHaveBeenCalled();
		expect((plugin as unknown as { pendingHeading: unknown }).pendingHeading).toBeNull();
	});

	it("consumes a matching pending navigation exactly once", async () => {
		const { plugin, workspace, fileOpenHandler } = await loadPlugin(
			(linkPath) => `${linkPath}.md`
		);
		const handleHeading = jest.spyOn(
			plugin as unknown as { handleHeadingNavigation: () => Promise<void> },
			"handleHeadingNavigation"
		).mockResolvedValue(undefined);
		const file = { path: "Note.md", basename: "Note" };
		const view = { file };
		workspace.getActiveViewOfType.mockReturnValue(view);

		await workspace.openLinkText("Note#Heading", "Source.md");
		const handling = fileOpenHandler(file);
		await jest.advanceTimersByTimeAsync(50);
		await handling;

		expect(handleHeading).toHaveBeenCalledTimes(1);
		expect(handleHeading).toHaveBeenCalledWith(file, "Heading", view);
		expect((plugin as unknown as { pendingHeading: unknown }).pendingHeading).toBeNull();
	});
});
