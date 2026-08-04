import { Plugin, MarkdownView, TFile, resolveSubpath, Editor, HeadingCache } from "obsidian";
import { Link2HeadingSettings, DEFAULT_SETTINGS, Link2HeadingSettingTab } from "./settings";
import { calculateHeadingLevel, findInsertionPoint, buildHeadingText, parseLinkWithHeading } from "./utils";

/**
 * Link2Heading Plugin
 * Automatically creates headings when following links to non-existent headings.
 */
export default class Link2HeadingPlugin extends Plugin {
	settings: Link2HeadingSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new Link2HeadingSettingTab(this.app, this));

		// Intercept link navigation to capture heading targets
		const originalOpenLinkText = this.app.workspace.openLinkText.bind(this.app.workspace);
		this.app.workspace.openLinkText = async (linktext: string, sourcePath: string, newLeaf?: boolean, openViewState?: unknown) => {
			const parsed = parseLinkWithHeading(linktext, sourcePath, (linkPath, srcPath) => {
				return this.app.metadataCache.getFirstLinkpathDest(linkPath, srcPath)?.path || null;
			});
			await originalOpenLinkText(linktext, sourcePath, newLeaf, openViewState);

			if (!parsed) return;
			const view = this.findMarkdownView(parsed.file);
			if (view?.file) {
				await this.handleHeadingNavigation(view.file, parsed.heading, view);
			}
		};
		this.register(() => { this.app.workspace.openLinkText = originalOpenLinkText; });
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private findMarkdownView(filePath: string): MarkdownView | null {
		const isExpectedFile = (file: TFile) => filePath === file.path ||
			file.path.endsWith(filePath + ".md") || filePath === file.basename;
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView?.file && isExpectedFile(activeView.file)) return activeView;

		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			if (leaf.view instanceof MarkdownView && leaf.view.file && isExpectedFile(leaf.view.file)) {
				return leaf.view;
			}
		}
		return null;
	}

	private async handleHeadingNavigation(file: TFile, headingText: string, view: MarkdownView) {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache || resolveSubpath(cache, "#" + headingText)) return;

		const editor = view.editor;
		if (editor) await this.createHeading(headingText, editor, cache.headings);
	}

	private async createHeading(headingText: string, editor: Editor, existingHeadings: HeadingCache[] | undefined) {
		const insertionResult = findInsertionPoint(editor, existingHeadings, this.settings);
		if (!insertionResult) return;

		const { insertionPoint, parentLevel, needsParentCreation } = insertionResult;
		const level = calculateHeadingLevel(this.settings.headingLevel, parentLevel);
		const parentLevelNum = this.settings.headingLevel === "auto" ? 2 : Math.max(1, level - 1);
		const prevLineContent = insertionPoint.line > 0 ? editor.getLine(insertionPoint.line - 1) : "";

		const { text, linesAdded } = buildHeadingText(
			headingText, level, this.settings.parentHeading || null,
			parentLevelNum, needsParentCreation, prevLineContent
		);

		editor.replaceRange(text, insertionPoint);
		editor.setCursor({ line: insertionPoint.line + linesAdded - 1, ch: 0 });
	}
}
