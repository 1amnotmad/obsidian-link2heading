import { App, PluginSettingTab, Setting } from "obsidian";
import type Link2HeadingPlugin from "./main";

export interface Link2HeadingSettings {
	parentHeading: string;
	headingLevel: string;
	missingParentBehavior: "create" | "top" | "none";
}

export const DEFAULT_SETTINGS: Link2HeadingSettings = {
	parentHeading: "",
	headingLevel: "auto",
	missingParentBehavior: "top",
};

export class Link2HeadingSettingTab extends PluginSettingTab {
	plugin: Link2HeadingPlugin;

	constructor(app: App, plugin: Link2HeadingPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Parent heading")
			.setDesc("New headings will be inserted under this heading. Leave empty to insert at top of file.")
			.addText((text) => text
				.setPlaceholder("e.g., Notes, Ideas, etc.")
				.setValue(this.plugin.settings.parentHeading)
				.onChange(async (value) => {
					this.plugin.settings.parentHeading = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Heading level")
			.setDesc("The heading level for newly created headings.")
			.addDropdown((dropdown) => dropdown
				.addOption("auto", "One level below parent")
				.addOption("h1", "H1").addOption("h2", "H2").addOption("h3", "H3")
				.addOption("h4", "H4").addOption("h5", "H5").addOption("h6", "H6")
				.setValue(this.plugin.settings.headingLevel)
				.onChange(async (value) => {
					this.plugin.settings.headingLevel = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("If parent heading doesn't exist")
			.setDesc("What to do with the new heading when the configured parent heading is not found.")
			.addDropdown((dropdown) => dropdown
				.addOption("top", "Insert at top of file")
				.addOption("create", "Create parent heading")
				.addOption("none", "Do nothing")
				.setValue(this.plugin.settings.missingParentBehavior)
				.onChange(async (value) => {
					this.plugin.settings.missingParentBehavior = value as "create" | "top" | "none";
					await this.plugin.saveSettings();
				})
			);
	}
}
