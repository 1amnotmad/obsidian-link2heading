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

async function loadPlugin(
	resolvePath: (linkPath: string) => string | null,
	originalOpenLinkText = jest.fn(async () => undefined)
) {
	const workspace = {
		openLinkText: originalOpenLinkText,
		getActiveViewOfType: jest.fn(),
		getLeavesOfType: jest.fn(() => [] as { view: unknown }[]),
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

	return { plugin, workspace, originalOpenLinkText };
}

describe("heading link navigation", () => {
	it("lets Obsidian handle malformed encoding without throwing", async () => {
		const { workspace, originalOpenLinkText } = await loadPlugin(() => null);

		await expect(workspace.openLinkText("Note#100% done", "Source.md")).resolves.toBeUndefined();
		expect(originalOpenLinkText).toHaveBeenCalledWith("Note#100% done", "Source.md", undefined, undefined);
	});

	it("waits for Obsidian navigation to finish before finding the target view", async () => {
		let finishNavigation: (() => void) | null = null;
		const originalOpenLinkText = jest.fn(() => new Promise<void>((resolve) => {
			finishNavigation = resolve;
		}));
		const { plugin, workspace } = await loadPlugin(
			(linkPath) => `${linkPath}.md`,
			originalOpenLinkText
		);
		const handleHeading = jest.spyOn(
			plugin as unknown as { handleHeadingNavigation: () => Promise<void> },
			"handleHeadingNavigation"
		).mockResolvedValue(undefined);
		const file = { path: "Note.md", basename: "Note" };
		const view = { file };

		const navigation = workspace.openLinkText("Note#Heading", "Source.md");
		workspace.getActiveViewOfType.mockReturnValue(view);
		await Promise.resolve();

		expect(handleHeading).not.toHaveBeenCalled();
		if (!finishNavigation) throw new Error("navigation did not start");
		finishNavigation();
		await navigation;

		expect(handleHeading).toHaveBeenCalledWith(file, "Heading", view);
	});

	it("does not suffix-match Note to AnotherNote", async () => {
		const { plugin, workspace } = await loadPlugin(() => null);
		const handleHeading = jest.spyOn(
			plugin as unknown as { handleHeadingNavigation: () => Promise<void> },
			"handleHeadingNavigation"
		).mockResolvedValue(undefined);
		const file = { path: "AnotherNote.md", basename: "AnotherNote" };
		workspace.getActiveViewOfType.mockReturnValue({ file });

		await workspace.openLinkText("Note#Heading", "Source.md");

		expect(handleHeading).not.toHaveBeenCalled();
	});

	it.each(["#new heading", "Current note#new heading"])(
		"handles a missing same-note heading after navigation: %s",
		async (linktext) => {
			const { plugin, workspace } = await loadPlugin(
				(linkPath) => linkPath ? `${linkPath}.md` : null
			);
			const handleHeading = jest.spyOn(
				plugin as unknown as { handleHeadingNavigation: () => Promise<void> },
				"handleHeadingNavigation"
			).mockResolvedValue(undefined);
			const file = { path: "Current note.md", basename: "Current note" };
			const view = { file };
			workspace.getActiveViewOfType.mockReturnValue(view);

			await workspace.openLinkText(linktext, "Current note.md");

			expect(handleHeading).toHaveBeenCalledTimes(1);
			expect(handleHeading).toHaveBeenCalledWith(file, "new heading", view);
		}
	);

	it("finds a matching background Markdown view", async () => {
		const { plugin, workspace } = await loadPlugin((linkPath) => `${linkPath}.md`);
		const handleHeading = jest.spyOn(
			plugin as unknown as { handleHeadingNavigation: () => Promise<void> },
			"handleHeadingNavigation"
		).mockResolvedValue(undefined);
		const file = { path: "Note.md", basename: "Note" };
		const MarkdownView = jest.requireMock("obsidian").MarkdownView;
		const view = Object.assign(new MarkdownView(), { file });
		workspace.getActiveViewOfType.mockReturnValue(null);
		workspace.getLeavesOfType.mockReturnValue([{ view }]);

		await workspace.openLinkText("Note#Heading", "Source.md");

		expect(handleHeading).toHaveBeenCalledWith(file, "Heading", view);
	});
});
