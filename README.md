# Link2Heading

An Obsidian plugin that automatically creates headings when you follow links to non-existent headings.

## Features

When you click or Ctrl+Enter on a link like `[[note#heading]]` and the heading doesn't exist, the plugin automatically creates it.

- **Configurable parent heading** — Insert new headings under a specific section
- **Configurable heading level** — Auto (one level below parent) or explicit h1-h6
- **Missing parent behavior** — Choose what happens when the parent heading isn't found

## Installation

### From Obsidian Community Plugins (Coming Soon)

1. Open Settings → Community Plugins
2. Search for "Link2Heading"
3. Install and enable

### Manual Installation

1. Download `main.js` and `manifest.json` from the [latest release](https://github.com/1amnotmad/obsidian-link2heading/releases)
2. Create folder: `<vault>/.obsidian/plugins/link2heading/`
3. Copy the files into the folder
4. Reload Obsidian and enable the plugin in Settings → Community Plugins

## Usage

1. Create a link with a heading: `[[My Note#New Section]]`
2. Click the link or press Ctrl+Enter (Cmd+Enter on Mac)
3. If "New Section" doesn't exist, the plugin creates it automatically

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **Parent heading** | New headings are inserted under this heading. Leave empty to insert at top of file. | Empty |
| **Heading level** | Level for new headings: "One level below parent" or explicit h1-h6 | Auto |
| **If parent doesn't exist** | What to do when parent heading is missing: insert at top, create parent, or do nothing | Insert at top |

## Examples

### Basic Usage (No Parent)
Link: `[[Note#Ideas]]` → Creates `### Ideas` at top of file (after frontmatter)

### With Parent Heading
Setting: Parent = "Notes"  
Link: `[[Note#New Idea]]` → Creates heading under the "Notes" section

### Auto Heading Level
If parent "Notes" is `## Notes`, the new heading becomes `### New Idea`

## License

MIT
