# Obsidian Vault Sanitizer

[English](#english) | [中文](#中文)

## English

Incremental anonymization plugin for Obsidian vaults.

### Features

- Command palette:
  - `Obsidian Vault Sanitizer: Incremental Update`
  - `Obsidian Vault Sanitizer: Restore from sanitizer map`
- Settings page actions:
  - Run full rebuild
  - Restore from map
- Progress modal while running (blocking UI)
- Redaction format with unique IDs:
  - `[REDACTED:TYPE:Rxxxxxxxxxxxx]`
- Incremental outputs under `obsidian-vault-sanitizer/`:
  - `sanitizer-summary.md`
  - `sanitizer-map.md.enc` (encrypted with Encryptor-compatible V2 header)
  - `state.json`

### Notes

- This plugin only does anonymization redaction, no frontmatter/template changes.
- `state.json` is used to detect changed files for incremental runs.
- `sanitizer-map.md.enc` appends only new RID mappings after decrypt-merge-encrypt.
- `sanitizer-summary.md` appends one run summary block per execution.

## 中文

Obsidian 的增量匿名化插件。

### 功能

- 命令面板：
  - `Obsidian Vault Sanitizer: Incremental Update`
  - `Obsidian Vault Sanitizer: Restore from sanitizer map`
- 设置页操作：
  - 运行全量重建
  - 从映射表恢复原文
- 运行中显示阻塞式进度弹窗
- 脱敏格式带唯一 ID：
  - `[REDACTED:TYPE:Rxxxxxxxxxxxx]`
- 输出统一到 `obsidian-vault-sanitizer/`：
  - `sanitizer-summary.md`
  - `sanitizer-map.md.enc`（与 Encryptor V2 文件头兼容）
  - `state.json`

### 说明

- 插件仅做匿名化，不做 frontmatter/模板等结构改写。
- `state.json` 用于增量判断（只处理新增/修改文件）。
- `sanitizer-map.md.enc` 通过“解密-合并-加密”方式仅追加新的 RID 映射。
- `sanitizer-summary.md` 每次运行追加一段摘要记录。
