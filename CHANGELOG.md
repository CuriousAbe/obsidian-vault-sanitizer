# Changelog

## 1.1.2

- Finalized command palette naming to avoid mixed-language display by using consistent English command labels.
- Added map-based restore command/action that decrypts and parses sanitizer map entries to recover original text from redacted placeholders.
- Removed the settings-page dry-run action and refreshed docs/version metadata for this release.

## 1.1.1

- Added restore workflow to recover `[REDACTED:TYPE:RID]` placeholders back to original text using sanitizer map entries.
- Added restore command and settings action, including passphrase prompt for encrypted map files.
- Removed settings-page dry-run entry.
- Updated Chinese command localization so command labels are no longer mixed-language.

## 1.1.0

- Improved safety of update flow: passphrase is collected before file writes so canceling no longer leaves partially sanitized content.
- Added passphrase confirmation (enter twice) for new map setup to reduce lockout from mistyped passwords.
- Removed creation of unused empty `obsidian-vault-sanitizer/state/` directory; plugin now writes only `state.json`.
- Expanded label-based redaction coverage for common CN/EN sensitive fields (password/account/username/phone/shop code/bank metadata).
- Reduced false positives by tightening separator rules and skipping CN_ID/BANK_CARD redaction when numeric spans appear inside URL/query tokens.

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
