# Link2Heading

Link2Heading is an [Obsidian](https://obsidian.md) plugin that creates a missing heading when you follow a link to it.

Follow `[[Project Notes#Next steps]]`, for example, and Link2Heading can create the missing `Next steps` heading in `Project Notes`. Rules let different notes choose different parent headings, heading levels, and missing-parent behavior.

## Features

- Creates missing headings when heading links are followed.
- Applies different insertion behavior by file, folder, existing heading, or frontmatter property.
- Uses fixed, predictable rule precedence.
- Inserts beneath an exact parent heading or at the top of the note after YAML frontmatter.
- Chooses a heading level automatically or uses an explicit H1–H6 level.
- Can create a missing parent heading, insert at the top, or do nothing.
- Suggests existing notes and folders while rules are configured.
- Supports a Global fallback for notes that do not match another rule.

## Requirements

- Obsidian 1.4.10 or newer

## Installation

### Community plugins

Link2Heading is not yet available in Obsidian's Community Plugins directory.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/1amnotmad/obsidian-link2heading/releases).
2. Create `<vault>/.obsidian/plugins/link2heading/` if it does not already exist.
3. Copy the three downloaded files into that folder.
4. Reload Obsidian.
5. Open **Settings → Community plugins** and enable **Link2Heading**.

## Quick start

1. Open **Settings → Link2Heading**.
2. Set **Fallback when no rule matches** to **Use Global**.
3. Leave **Parent heading** empty and **Heading level** set to **One level below parent**.
4. Follow a link such as `[[Project Notes#Next steps]]`.

If `Next steps` does not exist, Link2Heading creates `### Next steps` at the top of the target note, after YAML frontmatter if present. If the heading already exists, the plugin leaves the note unchanged.

## How rules work

Rules match the **target note**—the note opened by the link. A matching rule supplies the behavior used to create the missing heading.

Rules are checked by type in this fixed priority order:

1. **File**
2. **Folder**
3. **Heading**
4. **Frontmatter Property**
5. **Global**

The first matching rule at the highest applicable priority wins. The order in which rules appear in the settings matters for File, Heading, and Frontmatter Property rules. For Folder rules, the deepest matching folder wins; equally deep matches use the first rule.

### File

Matches one exact vault-relative note path. Both `Projects/Meeting` and `Projects/Meeting.md` match `Projects/Meeting.md`.

Use this for one-off behavior that should override every broader rule.

### Folder

Matches every note inside a vault folder, including nested folders. Folder suggestions end in `/`, for example `Projects/Active/`.

If more than one Folder rule matches, the most specific folder wins. A rule for `Projects/Active/` therefore takes priority over a rule for `Projects/`.

### Heading

Matches when an exact heading already exists anywhere in the target note. Enter the Markdown heading prefix, a space, and the heading text:

```text
### Events by date
```

Both the heading level and text must match, and matching is case-sensitive. `### Events by date` does not match `## Events by date` or `### Events By Date`.

The heading used to match the rule is independent of the **Parent heading** used for insertion. A rule can match `### Events by date` and insert a new heading beneath `## 2024 Events`.

### Frontmatter Property

Matches a YAML property in the target note's frontmatter.

```yaml
---
category: meeting
---
```

For this example, configure **Property** as `category` and **Value** as `meeting`.

- Property names are matched case-insensitively.
- Property values are matched exactly and are case-sensitive.
- If a property contains a YAML list, the rule matches when the configured value is one of its items.
- Enable **Any value** to match whenever the property exists, regardless of its value.

### Global fallback

Global is not added as a normal rule. Choose it from **Fallback when no rule matches**:

- **Do Nothing**: do not create a heading when no rule matches.
- **Use Global**: apply one shared behavior to every otherwise unmatched note.

## Rule behavior

Every rule, including Global, configures the same three behavior fields.

### Parent heading

The parent must include its Markdown level prefix:

```text
## Notes
```

Parent matching checks both level and text and is case-sensitive. `## Notes` does not match `### Notes` or `## notes`.

When the parent exists, the new heading is inserted immediately below it. Leave **Parent heading** empty to insert at the top of the note after YAML frontmatter.

### Heading level

- **One level below parent**: create the new heading one level below the matched or newly created parent, capped at H6.
- **H1–H6**: always use the selected level.

When no parent is configured and **One level below parent** is selected, Link2Heading creates an H3 heading.

### If parent missing

This setting applies when a non-empty Parent heading is configured but cannot be found:

- **Insert at top**: create only the linked heading at the top of the note.
- **Create parent**: create the configured parent at the top, then create the linked heading beneath it.
- **Do nothing**: leave the note unchanged.

An empty Parent heading intentionally means “insert at top” and does not invoke the missing-parent behavior.

## Heading field format

Heading-rule values and non-empty Parent heading values must start with one or more `#` characters, followed by a space and heading text.

Valid:

```text
# Notes
## Project notes
### Events by date
```

Invalid:

- `Notes` (no level prefix)
- `##Notes` (no space)
- `###` (no heading text)
- `### ` (a space but no heading text)

Invalid values are highlighted in the settings UI but are still saved. They will not match a heading.

## Examples

### Different behavior for one note

Create a **File** rule:

| Field | Value |
| --- | --- |
| File | `Projects/Roadmap` |
| Parent heading | `## Updates` |
| Heading level | `One level below parent` |
| If parent missing | `Create parent` |

Following `[[Projects/Roadmap#August]]` creates `### August` beneath `## Updates`. If `## Updates` is absent, both headings are created.

### Shared behavior for a project folder

Create a **Folder** rule for `Projects/Active/`, set Parent heading to `## Notes`, and choose **Insert at top** when the parent is missing. Every note in that folder and its descendants uses the same behavior unless a higher-priority File rule matches.

### Match one section and insert beneath another

Create a **Heading** rule that matches `### Events by date`, then set Parent heading to `## 2024 Events`. The target note only needs the matching heading to activate the rule; the new linked heading is inserted beneath the separately configured parent.

### Match a frontmatter property

Create a **Frontmatter Property** rule with Property `category` and Value `meeting`. Notes containing `category: meeting` use that rule unless they match a File, Folder, or Heading rule first.

## Notes and limitations

- Link2Heading acts only when a followed heading link points to a heading that does not already exist.
- Match criteria left empty do not match. An empty Heading-rule value therefore never matches.
- File and Folder rules use vault-relative paths.
- New headings inserted at the top are placed after YAML frontmatter.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, testing, and contribution instructions.

## Support

Report bugs or request features through [GitHub Issues](https://github.com/1amnotmad/obsidian-link2heading/issues).

## License

Link2Heading is available under the [MIT License](LICENSE).
