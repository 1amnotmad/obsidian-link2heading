import { Plugin, MarkdownView, TFile, resolveSubpath, Editor, HeadingCache } from "obsidian";
import { Link2HeadingSettings, Link2HeadingSettingTab, parseSettingsData } from "./settings";
import type { HeadingRuleBehavior } from "./settings";
import {
	calculateHeadingLevel,
	findInsertionPoint,
	buildHeadingText,
	isPendingHeadingForFile,
	parseLinkWithHeading,
	resolveHeadingSettings,
} from "./utils";

interface PendingHeadingNavigation {
	file: string;
	heading: string;
	createdAt: number;
}

/**
 * Link2Heading Plugin
 * Automatically creates headings when following links to non-existent headings.
 */
export default class Link2HeadingPlugin extends Plugin {
	settings: Link2HeadingSettings;
	private pendingHeading: PendingHeadingNavigation | null = null;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new Link2HeadingSettingTab(this.app, this));

		// Intercept link navigation to capture heading targets
		const originalOpenLinkText = this.app.workspace.openLinkText.bind(this.app.workspace);
		this.app.workspace.openLinkText = async (linktext: string, sourcePath: string, newLeaf?: boolean, openViewState?: unknown) => {
			const parsed = parseLinkWithHeading(linktext, sourcePath, (linkPath, srcPath) => {
				return this.app.metadataCache.getFirstLinkpathDest(linkPath, srcPath)?.path || null;
			});
			const pendingHeading = parsed ? { ...parsed, createdAt: Date.now() } : null;
			this.pendingHeading = pendingHeading;
			const currentFile = pendingHeading
				? this.app.workspace.getActiveViewOfType(MarkdownView)?.file
				: null;
			const isSameFileNavigation = currentFile && pendingHeading
				? isPendingHeadingForFile(currentFile.path, pendingHeading)
				: false;

			try {
				const result = await originalOpenLinkText(linktext, sourcePath, newLeaf, openViewState);
				if (isSameFileNavigation && currentFile && pendingHeading) {
					await this.processPendingHeading(currentFile, pendingHeading);
				}
				return result;
			} catch (error) {
				if (this.pendingHeading === pendingHeading) this.pendingHeading = null;
				throw error;
			}
		};
		this.register(() => { this.app.workspace.openLinkText = originalOpenLinkText; });

		// Process heading creation after file opens
		this.registerEvent(
			this.app.workspace.on("file-open", async (file) => {
				const pendingHeading = this.pendingHeading;
				if (!file || !pendingHeading) return;
				await this.processPendingHeading(file, pendingHeading);
			})
		);
	}

	onunload() {}

	async loadSettings() {
		this.settings = parseSettingsData(await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private async processPendingHeading(file: TFile, pendingHeading: PendingHeadingNavigation) {
		await new Promise((resolve) => setTimeout(resolve, 50));
		if (this.pendingHeading !== pendingHeading) return;
		this.pendingHeading = null;

		if (!isPendingHeadingForFile(file.path, pendingHeading)) return;

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view?.file === file) {
			await this.handleHeadingNavigation(file, pendingHeading.heading, view);
		}
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
