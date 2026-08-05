import {
	AbstractInputSuggest,
	App,
	PluginSettingTab,
	prepareFuzzySearch,
	Setting,
	setIcon,
} from "obsidian";
import type Link2HeadingPlugin from "./main";

export type HeadingLevel = "auto" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
export type MissingParentBehavior = "create" | "top" | "none";

export interface HeadingRuleBehavior {
	parentHeading: string;
	headingLevel: HeadingLevel;
	missingParentBehavior: MissingParentBehavior;
}

export interface PathRule extends HeadingRuleBehavior {
	matchType: "path";
	path: string;
}

export interface FolderRule extends HeadingRuleBehavior {
	matchType: "folder";
	folder: string;
}

export interface FrontmatterRule extends HeadingRuleBehavior {
	matchType: "frontmatter";
	property: string;
	value: string;
	anyValue: boolean;
}

export type HeadingRule = PathRule | FolderRule | FrontmatterRule;

export interface GlobalRule extends HeadingRuleBehavior {
	matchType: "global";
}

export type RuleFallback =
	| { mode: "none" }
	| { mode: "global"; rule: GlobalRule };

export interface Link2HeadingSettings {
	rules: HeadingRule[];
	fallback: RuleFallback;
}

const DEFAULT_BEHAVIOR: HeadingRuleBehavior = {
	parentHeading: "",
	headingLevel: "auto",
	missingParentBehavior: "top",
};

export function createPathRule(): PathRule {
	return { ...DEFAULT_BEHAVIOR, matchType: "path", path: "" };
}

export function createFolderRule(): FolderRule {
	return { ...DEFAULT_BEHAVIOR, matchType: "folder", folder: "" };
}

export function createFrontmatterRule(): FrontmatterRule {
	return {
		...DEFAULT_BEHAVIOR,
		matchType: "frontmatter",
		property: "",
		value: "",
		anyValue: false,
	};
}

export function createGlobalRule(): GlobalRule {
	return { ...DEFAULT_BEHAVIOR, matchType: "global" };
}

export function createDefaultSettings(): Link2HeadingSettings {
	return { rules: [], fallback: { mode: "none" } };
}

export const DEFAULT_SETTINGS: Link2HeadingSettings = createDefaultSettings();

type BehaviorRecord = Record<string, unknown> & {
	parentHeading: string;
	headingLevel: string;
	missingParentBehavior: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBehaviorRecord(value: Record<string, unknown>): value is BehaviorRecord {
	return typeof value.parentHeading === "string" &&
		typeof value.headingLevel === "string" &&
		typeof value.missingParentBehavior === "string";
}

function isHeadingLevel(value: string): value is HeadingLevel {
	return value === "auto" || value === "h1" || value === "h2" ||
		value === "h3" || value === "h4" || value === "h5" || value === "h6";
}

function normalizeHeadingLevel(value: string): HeadingLevel {
	return isHeadingLevel(value) ? value : "auto";
}

function isMissingParentBehavior(value: string): value is MissingParentBehavior {
	return value === "create" || value === "top" || value === "none";
}

function normalizeMissingParentBehavior(value: string): MissingParentBehavior {
	return isMissingParentBehavior(value) ? value : "top";
}

function normalizeBehavior(value: BehaviorRecord): HeadingRuleBehavior {
	return {
		parentHeading: value.parentHeading,
		headingLevel: normalizeHeadingLevel(value.headingLevel),
		missingParentBehavior: normalizeMissingParentBehavior(value.missingParentBehavior),
	};
}

function parseRule(value: unknown): HeadingRule | null {
	if (!isRecord(value) || !isBehaviorRecord(value)) return null;

	const behavior = normalizeBehavior(value);
	switch (value.matchType) {
		case "path":
			return typeof value.path === "string"
				? { ...behavior, matchType: "path", path: value.path }
				: null;
		case "folder":
			return typeof value.folder === "string"
				? { ...behavior, matchType: "folder", folder: value.folder }
				: null;
		case "frontmatter":
			return typeof value.property === "string" &&
				typeof value.value === "string" &&
				typeof value.anyValue === "boolean"
				? {
					...behavior,
					matchType: "frontmatter",
					property: value.property,
					value: value.value,
					anyValue: value.anyValue,
				}
				: null;
		default:
			return null;
	}
}

function parseFallback(value: unknown): RuleFallback {
	if (!isRecord(value)) return { mode: "none" };
	if (value.mode === "none") return { mode: "none" };

	if (value.mode === "global" && isRecord(value.rule) &&
		value.rule.matchType === "global" && isBehaviorRecord(value.rule)) {
		return {
			mode: "global",
			rule: { ...normalizeBehavior(value.rule), matchType: "global" },
		};
	}

	console.warn("Link2Heading: ignoring invalid fallback settings.");
	return { mode: "none" };
}

/** Reconstructs settings from persisted data without accepting legacy flat fields. */
export function parseSettingsData(data: unknown): Link2HeadingSettings {
	if (!isRecord(data)) return createDefaultSettings();

	const rules: HeadingRule[] = [];
	if (Array.isArray(data.rules)) {
		data.rules.forEach((value, index) => {
			const rule = parseRule(value);
			if (rule) {
				rules.push(rule);
			} else {
				console.warn(`Link2Heading: ignoring invalid heading rule at index ${index}.`);
			}
		});
	}

	return {
		rules,
		fallback: parseFallback(data.fallback),
	};
}

class PathInputSuggest extends AbstractInputSuggest<string> {
	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);
		this.limit = 50;
	}

	protected getSuggestions(query: string): string[] {
		const paths = this.app.vault.getMarkdownFiles().map(
			(file) => file.path.replace(/\.md$/, "")
		);
		if (!query.trim()) return paths.slice(0, this.limit);

		const search = prepareFuzzySearch(query);
		return paths
			.map((path) => ({ path, match: search(path) }))
			.filter((result) => result.match !== null)
			.sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0))
			.slice(0, this.limit)
			.map((result) => result.path);
	}

	renderSuggestion(path: string, el: HTMLElement): void {
		el.setText(path);
	}
}

export class Link2HeadingSettingTab extends PluginSettingTab {
	plugin: Link2HeadingPlugin;
	private pathSuggests: PathInputSuggest[] = [];

	constructor(app: App, plugin: Link2HeadingPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		this.closePathSuggests();
		containerEl.empty();
		containerEl.addClass("link2heading-settings");

		containerEl.createEl("h2", { text: "Heading Rules" });
		containerEl.createEl("p", {
			text: "Rules are checked in priority order (highest to lowest): Path & Filename, Folder (recursive), Frontmatter Property, then Global.",
			cls: "link2heading-rules-intro",
		});
		containerEl.createEl("p", {
			text: "The first matching rule determines where the new heading is inserted, at what level, and what happens if the parent heading is missing.",
			cls: "link2heading-rules-intro",
		});

		this.renderFallback(containerEl);
		this.renderAddRuleControls(containerEl);

		const rulesContainer = containerEl.createDiv("link2heading-rules");
		this.plugin.settings.rules.forEach((rule, index) => {
			this.renderRuleCard(rulesContainer, rule, index);
		});

		if (this.plugin.settings.fallback.mode === "global") {
			this.renderGlobalRuleCard(rulesContainer, this.plugin.settings.fallback.rule);
		}
	}

	hide(): void {
		this.closePathSuggests();
		super.hide();
	}

	private closePathSuggests(): void {
		this.pathSuggests.forEach((suggest) => suggest.close());
		this.pathSuggests = [];
	}

	private renderFallback(containerEl: HTMLElement): void {
		const card = containerEl.createDiv("link2heading-fallback-card");
		new Setting(card)
			.setName("Fallback when no rule matches")
			.addDropdown((dropdown) => dropdown
				.addOption("none", "Do Nothing")
				.addOption("global", "Use Global")
				.setValue(this.plugin.settings.fallback.mode)
				.onChange(async (value) => {
					this.plugin.settings.fallback = value === "global"
						? { mode: "global", rule: createGlobalRule() }
						: { mode: "none" };
					await this.plugin.saveSettings();
					this.display();
				})
			);
	}

	private renderAddRuleControls(containerEl: HTMLElement): void {
		let matchType: HeadingRule["matchType"] = "path";
		const controls = containerEl.createDiv("link2heading-add-rule");

		new Setting(controls)
			.setName("Add rule")
			.addDropdown((dropdown) => dropdown
				.addOption("path", "Path & Filename")
				.addOption("folder", "Folder (recursive)")
				.addOption("frontmatter", "Frontmatter Property")
				.onChange((value) => {
					if (value === "path" || value === "folder" || value === "frontmatter") {
						matchType = value;
					}
				})
			)
			.addButton((button) => button
				.setButtonText("+ Add Rule")
				.setCta()
				.onClick(async () => {
					this.plugin.settings.rules.push(this.createRule(matchType));
					await this.plugin.saveSettings();
					this.display();
				})
			);
	}

	private createRule(matchType: HeadingRule["matchType"]): HeadingRule {
		switch (matchType) {
			case "path":
				return createPathRule();
			case "folder":
				return createFolderRule();
			case "frontmatter":
				return createFrontmatterRule();
		}
	}

	private renderRuleCard(containerEl: HTMLElement, rule: HeadingRule, index: number): void {
		const card = containerEl.createDiv("link2heading-rule-card");
		const header = card.createDiv("link2heading-rule-header");
		header.createEl("strong", { text: `Rule ${index + 1}` });

		const removeButton = header.createEl("button", {
			cls: "clickable-icon link2heading-remove-rule",
			attr: { "aria-label": `Remove Rule ${index + 1}` },
		});
		setIcon(removeButton, "trash");
		removeButton.addEventListener("click", async () => {
			this.plugin.settings.rules.splice(index, 1);
			await this.plugin.saveSettings();
			this.display();
		});

		new Setting(card)
			.setName("Match type")
			.addDropdown((dropdown) => dropdown
				.addOption("path", "Path & Filename")
				.addOption("folder", "Folder (recursive)")
				.addOption("frontmatter", "Frontmatter Property")
				.setValue(rule.matchType)
				.onChange(async (value) => {
					if (value !== "path" && value !== "folder" && value !== "frontmatter") return;
					const replacement = this.createRule(value);
					replacement.parentHeading = rule.parentHeading;
					replacement.headingLevel = rule.headingLevel;
					replacement.missingParentBehavior = rule.missingParentBehavior;
					this.plugin.settings.rules[index] = replacement;
					await this.plugin.saveSettings();
					this.display();
				})
			);

		this.renderMatchCriteria(card, rule);
		card.createDiv("link2heading-rule-separator");
		this.renderBehaviorControls(card, rule);
	}

	private renderMatchCriteria(card: HTMLElement, rule: HeadingRule): void {
		switch (rule.matchType) {
			case "path":
				new Setting(card)
					.setName("Path & Filename")
					.addText((text) => {
						text.setPlaceholder("Projects/Active/Meeting")
							.setValue(rule.path)
							.onChange(async (value) => {
								rule.path = value;
								await this.plugin.saveSettings();
							});

						const suggest = new PathInputSuggest(this.app, text.inputEl);
						suggest.onSelect(async (value) => {
							text.setValue(value);
							rule.path = value;
							await this.plugin.saveSettings();
						});
						this.pathSuggests.push(suggest);
					});
				break;
			case "folder":
				new Setting(card)
					.setName("Folder")
					.addText((text) => text
						.setPlaceholder("Projects/Active")
						.setValue(rule.folder)
						.onChange(async (value) => {
							rule.folder = value;
							await this.plugin.saveSettings();
						})
					);
				break;
			case "frontmatter": {
				new Setting(card)
					.setName("Property")
					.addText((text) => text
						.setPlaceholder("type")
						.setValue(rule.property)
						.onChange(async (value) => {
							rule.property = value;
							await this.plugin.saveSettings();
						})
					);

				const valueSetting = new Setting(card)
					.setName("Value")
					.addText((text) => text
						.setPlaceholder("meeting")
						.setValue(rule.value)
						.onChange(async (value) => {
							rule.value = value;
							await this.plugin.saveSettings();
						})
					)
					.setDisabled(rule.anyValue);

				const anyValueSetting = new Setting(card)
					.setName("Any value")
					.setDesc("Match if the property exists, regardless of its value.");
				const checkbox = anyValueSetting.controlEl.createEl("input");
				checkbox.type = "checkbox";
				checkbox.checked = rule.anyValue;
				checkbox.addClass("link2heading-any-value-checkbox");
				checkbox.addEventListener("change", async () => {
					rule.anyValue = checkbox.checked;
					valueSetting.setDisabled(rule.anyValue);
					await this.plugin.saveSettings();
				});
				break;
			}
		}
	}

	private renderGlobalRuleCard(containerEl: HTMLElement, rule: GlobalRule): void {
		const card = containerEl.createDiv("link2heading-rule-card");
		const header = card.createDiv("link2heading-rule-header");
		header.createEl("strong", { text: "Global Rule" });

		const matchType = new Setting(card).setName("Match type");
		matchType.controlEl.createSpan({ text: "Global" });
		card.createDiv("link2heading-rule-separator");
		this.renderBehaviorControls(card, rule);
	}

	private renderBehaviorControls(card: HTMLElement, behavior: HeadingRuleBehavior): void {
		new Setting(card)
			.setName("Parent heading")
			.addText((text) => text
				.setPlaceholder("None - Insert at top")
				.setValue(behavior.parentHeading)
				.onChange(async (value) => {
					behavior.parentHeading = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(card)
			.setName("Heading level")
			.addDropdown((dropdown) => dropdown
				.addOption("auto", "1 level below parent")
				.addOption("h1", "H1")
				.addOption("h2", "H2")
				.addOption("h3", "H3")
				.addOption("h4", "H4")
				.addOption("h5", "H5")
				.addOption("h6", "H6")
				.setValue(behavior.headingLevel)
				.onChange(async (value) => {
					if (!isHeadingLevel(value)) return;
					behavior.headingLevel = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(card)
			.setName("If parent missing")
			.addDropdown((dropdown) => dropdown
				.addOption("top", "Insert at top")
				.addOption("create", "Create parent")
				.addOption("none", "Do nothing")
				.setValue(behavior.missingParentBehavior)
				.onChange(async (value) => {
					if (!isMissingParentBehavior(value)) return;
					behavior.missingParentBehavior = value;
					await this.plugin.saveSettings();
				})
			);
	}
}
