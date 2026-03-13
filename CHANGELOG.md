# Changelog

## 1.0.0

- Initial stable release of Obsidian Vault Sanitizer.
- Incremental sanitization command in command palette.
- Full rebuild and dry-run moved to settings page actions.
- Progress modal during processing.
- Sanitizer now does anonymization only (no frontmatter/template mutations).
- Output standardized to `obsidian-vault-sanitizer/`:
  - `sanitizer-summary.md` (incremental append)
  - `sanitizer-map.md.enc` (Encryptor V2 compatible encrypted map)
  - `state.json`
