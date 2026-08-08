import { Plugin, MarkdownView, TFile, resolveSubpath, Editor, HeadingCache } from "obsidian";
import { Link2HeadingSettings, Link2HeadingSettingTab, parseSettingsData } from "./settings";
import type { HeadingRuleBehavior } from "./settings";
import {
	calculateHeadingLevel,
	findInsertionPoint,
	buildHeadingText,
	isHeadingTargetFile,
	parseLinkWithHeading,
	resolveHeadingSettings,
} from "./utils";

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
			const result = await originalOpenLinkText(linktext, sourcePath, newLeaf, openViewState);

			if (!parsed) return result;
			const view = this.findMarkdownView(parsed.file);
			if (view?.file) {
				await this.handleHeadingNavigation(view.file, parsed.heading, view);
			}
			return result;
		};
		this.register(() => { this.app.workspace.openLinkText = originalOpenLinkText; });
	}

	onunload() {}

	async loadSettings() {
		this.settings = parseSettingsData(await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private findMarkdownView(filePath: string): MarkdownView | null {
		const isExpectedFile = (file: TFile) => isHeadingTargetFile(file.path, filePath);
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

		const behavior = resolveHeadingSettings(
			file,
			{ frontmatter: cache.frontmatter, headings: cache.headings },
			this.settings.rules,
			this.settings.fallback
		);
		if (!behavior) return;

		const editor = view.editor;
		if (editor) await this.createHeading(headingText, editor, cache.headings, behavior);
	}

	private async createHeading(
		headingText: string,
		editor: Editor,
		existingHeadings: HeadingCache[] | undefined,
		behavior: HeadingRuleBehavior
	) {
		const insertionResult = findInsertionPoint(editor, existingHeadings, behavior);
		if (!insertionResult) return;

		const { insertionPoint, parentLevel, needsParentCreation } = insertionResult;
		const level = calculateHeadingLevel(behavior.headingLevel, parentLevel);
		const prevLineContent = insertionPoint.line > 0 ? editor.getLine(insertionPoint.line - 1) : "";

		const { text, linesAdded } = buildHeadingText(
			headingText, level, behavior.parentHeading || null,
			needsParentCreation, prevLineContent
		);

		editor.replaceRange(text, insertionPoint);
		editor.setCursor({ line: insertionPoint.line + linesAdded - 1, ch: 0 });
	}
}
