const { Plugin, Notice, PluginSettingTab, Setting, Modal } = require("obsidian")

const APP_DIR = "obsidian-vault-sanitizer"
const STATE_PATH = `${APP_DIR}/state.json`
const MAP_ENC_PATH = `${APP_DIR}/sanitizer-map.md.enc`
const LEGACY_MAP_PATH = `${APP_DIR}/sanitizer-map.md`
const SUMMARY_PATH = `${APP_DIR}/sanitizer-summary.md`

const MAGIC_V2_BYTES = new Uint8Array([79, 67, 69, 78, 74, 50])
const VERSION_V2 = 2
const FORMAT_ID = "openclaw-vault-encryptor"
const PBKDF2_ITERATIONS = 210000

const DEFAULT_SETTINGS = {
  skipPrefixes: [`${APP_DIR}/`, "reports/", "_backup_", "_quarantine_", ".obsidian/plugins/"],
}

function resolveLocale(app) {
  try {
    const configured = app?.vault?.getConfig?.("locale")
    if (typeof configured === "string" && configured.trim().length > 0) {
      return configured.toLowerCase().startsWith("zh") ? "zh" : "en"
    }
  } catch (_error) {
    // no-op
  }
  const navLang = (globalThis.navigator && globalThis.navigator.language) || "en"
  return String(navLang).toLowerCase().startsWith("zh") ? "zh" : "en"
}

const I18N = {
  en: {
    commandIncremental: "Incremental update",
    commandRestore: "Restore from sanitizer map",
    modalTitle: "Vault Sanitizer",
    modalStarting: "Starting...",
    stagePreparing: "Preparing",
    stageLoadingState: "Loading state",
    stageDiffingIncremental: "Diffing incremental files",
    stageSanitizing: "Sanitizing files",
    stageUpdatingMap: "Updating encrypted map",
    stageLoadingMap: "Loading sanitizer map",
    stageRestoring: "Restoring files",
    stageUpdatingState: "Updating state",
    stageWritingSummary: "Writing summary",
    reviewTitle: "Review redaction",
    reviewPrompt: "Redact this match and add it to the sanitizer map?",
    reviewRedact: "Redact",
    reviewSkip: "Skip",
    reviewRedactAll: "Redact all",
    reviewSkipAll: "Skip all",
    reviewFile: "File",
    reviewKind: "Type",
    reviewCount: "Match {current}/{total}",
    passphraseTitle: "Enter sanitizer map passphrase",
    passphraseNewTitle: "Set sanitizer map passphrase",
    passphraseConfirmTitle: "Confirm sanitizer map passphrase",
    passphraseExistingTitle: "Existing sanitizer map detected, enter passphrase",
    passphraseOk: "OK",
    passphraseCancel: "Cancel",
    noticeDone: "Vault Sanitizer done: mode={mode}, processed={processed}, map_added={mapAdded}",
    noticeRestoreDone: "Vault restore done: files={files}, tokens={tokens}",
    noticeFailed: "Vault Sanitizer failed: {reason}",
    noticeMapPassphraseRetry: "Passphrase does not match existing map. Please re-enter.",
    noticeMapPassphraseMismatch: "Passphrases do not match. Please try again.",
    settingOutputName: "Output directory",
    settingOutputDesc: "All outputs are written under {dir}/",
    settingRunButton: "Run",
    settingFullName: "Run full rebuild",
    settingFullDesc: "Force full anonymization run.",
    settingFullButton: "Run Full Rebuild",
    settingFullConfirm: "Run full rebuild now? This may take a while.",
    settingRestoreName: "Restore from map",
    settingRestoreDesc: "Recover redacted content from sanitizer map.",
    settingRestoreButton: "Run Restore",
    settingRestoreConfirm: "Run restore now? This will overwrite redacted placeholders.",
    errorPassphraseRequired: "Passphrase is required",
    errorMapNotFound: "Sanitizer map not found",
  },
  zh: {
    commandIncremental: "Incremental update",
    commandRestore: "Restore from sanitizer map",
    modalTitle: "Vault Sanitizer",
    modalStarting: "开始执行...",
    stagePreparing: "准备中",
    stageLoadingState: "加载状态文件",
    stageDiffingIncremental: "比对增量文件",
    stageSanitizing: "匿名化处理中",
    stageUpdatingMap: "更新加密映射表",
    stageLoadingMap: "加载映射表",
    stageRestoring: "恢复文件内容",
    stageUpdatingState: "更新状态文件",
    stageWritingSummary: "写入汇总",
    reviewTitle: "确认脱敏项",
    reviewPrompt: "是否脱敏该内容并写入映射表？",
    reviewRedact: "脱敏",
    reviewSkip: "跳过",
    reviewRedactAll: "全部脱敏",
    reviewSkipAll: "全部跳过",
    reviewFile: "文件",
    reviewKind: "类型",
    reviewCount: "第 {current}/{total} 条",
    passphraseTitle: "输入映射表密码",
    passphraseNewTitle: "设置映射表密码",
    passphraseConfirmTitle: "确认映射表密码",
    passphraseExistingTitle: "检测到已有映射表，请输入密码",
    passphraseOk: "确认",
    passphraseCancel: "取消",
    noticeDone: "Vault Sanitizer 完成：模式={mode}，处理={processed}，新增映射={mapAdded}",
    noticeRestoreDone: "原文恢复完成：文件={files}，替换={tokens}",
    noticeFailed: "Vault Sanitizer 失败：{reason}",
    noticeMapPassphraseRetry: "密码与已有映射表不一致，请重新输入。",
    noticeMapPassphraseMismatch: "两次输入的密码不一致，请重试。",
    settingOutputName: "输出目录",
    settingOutputDesc: "所有输出写入 {dir}/",
    settingRunButton: "运行",
    settingFullName: "运行全量重建",
    settingFullDesc: "强制执行全量匿名化。",
    settingFullButton: "全量重建",
    settingFullConfirm: "现在执行全量重建？这可能需要较长时间。",
    settingRestoreName: "从映射表恢复",
    settingRestoreDesc: "基于映射表还原已脱敏内容。",
    settingRestoreButton: "执行恢复",
    settingRestoreConfirm: "现在执行恢复？这会覆盖脱敏占位符。",
    errorPassphraseRequired: "必须输入密码",
    errorMapNotFound: "未找到映射表",
  },
}

const RISK_PATTERNS = {
  EMAIL: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  PHONE_CN: /(?<!\d)1[3-9]\d{9}(?!\d)/g,
  PHONE_US: /(?<!\d)(?:\(\d{3}\)\s*\d{3}[-\s]\d{4}|\d{3}[-\s]\d{3}[-\s]\d{4})(?!\d)/g,
  CN_ID: /(?<!\d)(\d{17}[\dXx]|\d{15})(?!\d)/g,
  BANK_CARD: /(?<!\d)\d{16,19}(?!\d)/g,
}

const LABEL_PATTERNS_WITH_SEPARATOR = [
  "password",
  "passwd",
  "pwd",
  "token",
  "api[_\\s-]?key",
  "secret",
  "key",
  "账号",
  "账户",
  "用户名称",
  "用户名",
  "orgid",
  "account\\s*name",
  "account\\s*number",
  "swift(?:\\s*code)?",
  "local\\s*bank\\s*code",
  "work\\s*phone(?:\\s*\\[\\])?",
  "证书序列号",
  "紧急备份代码",
  "绑定手机号码",
  "香港有效卡",
  "香港卡",
  "美国卡",
  "收款行名",
  "收款账户号码",
  "收款人名字",
  "收款人地址",
  "银行地址",
  "密钥(?:\\s*[Vv]\\s*\\d+)?",
  "操作密码",
  "用户密码",
  "user\\s*password",
  "登录密码",
  "登入密码",
  "交易密码",
  "邮箱密码",
  "店铺密码",
  "您的手机号码",
  "手机号码",
  "your\\s*phone\\s*number",
  "your\\s*username",
  "shop\\s*code",
  "香港手机卡",
  "密码",
]

const LABEL_PATTERNS_NO_SEPARATOR = [
  "登录密码",
  "登入密码",
  "交易密码",
  "邮箱密码",
  "店铺密码",
  "操作密码",
  "香港手机卡",
  "密码",
  "password",
  "passwd",
  "pwd",
]

const SENSITIVE_LABEL_VALUE_WITH_SEPARATOR = new RegExp(
  `(^|[\\s,;，；])(${LABEL_PATTERNS_WITH_SEPARATOR.join("|")})(\\s*[:：=]\\s*)([^\\s,;，；]+)`,
  "gim"
)

const SENSITIVE_LABEL_VALUE_NO_SEPARATOR = new RegExp(
  `(^|[\\s,;，；])(${LABEL_PATTERNS_NO_SEPARATOR.join("|")})(\\s+)([A-Za-z0-9+][A-Za-z0-9+._@#\\/-]*(?:\\s+[A-Za-z0-9+._@#\\/-]+){0,2})`,
  "gim"
)

function nowTs() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function shouldSkip(path, prefixes) {
  return prefixes.some((p) => path.startsWith(p))
}

function sha256Hex(input) {
  const crypto = require("crypto")
  return crypto.createHash("sha256").update(input, "utf8").digest("hex")
}

function lineAndColAt(text, pos) {
  let line = 1
  let lastBreak = -1
  for (let i = 0; i < pos; i++) {
    if (text.charCodeAt(i) === 10) {
      line += 1
      lastBreak = i
    }
  }
  return { line, col: pos - lastBreak }
}

function tokenAround(text, start, end) {
  let left = start
  while (left > 0 && !/\s/.test(text[left - 1])) left -= 1
  let right = end
  while (right < text.length && !/\s/.test(text[right])) right += 1
  return text.slice(left, right)
}

function shouldSkipNumericMatch(text, start, match, key) {
  if (key !== "CN_ID" && key !== "BANK_CARD") return false
  const token = tokenAround(text, start, start + String(match).length).toLowerCase()
  if (token.includes("http://") || token.includes("https://") || token.includes("www.")) return true
  if (token.includes("%2f") || token.includes("%3a%2f%2f")) return true
  if (token.includes("?") || token.includes("&") || token.includes("=")) return true
  return false
}

function makeRid(runSalt, filePath, line, col, kind, original, ordinal) {
  const seed = [runSalt, filePath, String(line), String(col), kind, String(ordinal), original].join("|")
  return `R${sha256Hex(seed).slice(0, 12)}`
}

function escapeMdCell(v) {
  return String(v ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ")
}

function extractExistingRids(mdText) {
  const out = new Set()
  const re = /\|\s*(R[0-9a-fA-F]{12})\s*\|/g
  let m
  while ((m = re.exec(mdText)) !== null) out.add(m[1])
  return out
}

function initMapText() {
  return "# Sanitizer Map\n\n| RID | Original |\n|---|---|\n"
}

function appendMapRows(existingMapText, rows) {
  const existing = extractExistingRids(existingMapText)
  const lines = []
  for (const r of rows) {
    if (!r.rid || existing.has(r.rid)) continue
    existing.add(r.rid)
    lines.push(`| ${r.rid} | ${escapeMdCell(r.original)} |`)
  }
  if (lines.length === 0) return { text: existingMapText, added: 0 }
  const sep = existingMapText.endsWith("\n") ? "" : "\n"
  return { text: `${existingMapText}${sep}${lines.join("\n")}\n`, added: lines.length }
}

function unescapeMdCell(v) {
  return String(v ?? "").replace(/\\\|/g, "|")
}

function parseMapRidLookup(mapText) {
  const ridToOriginal = new Map()
  const re = /^\|\s*(R[0-9a-fA-F]{12})\s*\|\s*((?:\\\||[^|])*)\s*\|\s*$/gm
  let m
  while ((m = re.exec(mapText)) !== null) {
    ridToOriginal.set(m[1], unescapeMdCell(m[2]))
  }
  return ridToOriginal
}

function restoreContent(text, ridToOriginal) {
  let replaced = 0
  const out = text.replace(/\[REDACTED:[A-Z_]+:(R[0-9a-fA-F]{12})\]/g, (match, rid) => {
    if (!ridToOriginal.has(rid)) return match
    replaced += 1
    return ridToOriginal.get(rid)
  })
  return { text: out, replaced }
}

function overlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd
}

function linePreviewWithHighlight(text, start, end) {
  const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1
  const lineEndRaw = text.indexOf("\n", end)
  const lineEnd = lineEndRaw === -1 ? text.length : lineEndRaw
  const line = text.slice(lineStart, lineEnd)
  const relStart = Math.max(0, start - lineStart)
  const relEnd = Math.max(relStart, end - lineStart)

  const MAX_LEN = 180
  if (line.length <= MAX_LEN) {
    return {
      before: line.slice(0, relStart),
      target: line.slice(relStart, relEnd),
      after: line.slice(relEnd),
    }
  }

  const half = Math.floor((MAX_LEN - (relEnd - relStart)) / 2)
  const snippetStart = Math.max(0, relStart - half)
  const snippetEnd = Math.min(line.length, relEnd + half)
  const prefix = snippetStart > 0 ? "..." : ""
  const suffix = snippetEnd < line.length ? "..." : ""
  const snippet = line.slice(snippetStart, snippetEnd)
  const targetStartInSnippet = relStart - snippetStart
  const targetEndInSnippet = relEnd - snippetStart

  return {
    before: `${prefix}${snippet.slice(0, targetStartInSnippet)}`,
    target: snippet.slice(targetStartInSnippet, targetEndInSnippet),
    after: `${snippet.slice(targetEndInSnippet)}${suffix}`,
  }
}

function collectRedactionCandidates(text, ctx) {
  const raw = []
  const push = (item) => {
    if (!item || item.start >= item.end) return
    raw.push(item)
  }

  const labeledPatterns = [
    { re: new RegExp(SENSITIVE_LABEL_VALUE_WITH_SEPARATOR.source, SENSITIVE_LABEL_VALUE_WITH_SEPARATOR.flags), kind: "LABEL" },
    { re: new RegExp(SENSITIVE_LABEL_VALUE_NO_SEPARATOR.source, SENSITIVE_LABEL_VALUE_NO_SEPARATOR.flags), kind: "PASSWORD" },
  ]

  for (const { re, kind } of labeledPatterns) {
    let m
    while ((m = re.exec(text)) !== null) {
      const prefix = String(m[1] ?? "")
      const label = String(m[2] ?? "")
      const sep = String(m[3] ?? "")
      const value = String(m[4] ?? "")
      if (!value || value.startsWith("[REDACTED:")) continue
      const valueStart = m.index + prefix.length + label.length + sep.length
      push({
        kind,
        original: value,
        start: valueStart,
        end: valueStart + value.length,
      })
    }
  }

  for (const key of ["EMAIL", "PHONE_CN", "PHONE_US", "CN_ID", "BANK_CARD"]) {
    const re = new RegExp(RISK_PATTERNS[key].source, RISK_PATTERNS[key].flags)
    let m
    while ((m = re.exec(text)) !== null) {
      const value = String(m[0] ?? "")
      const start = m.index
      if (!value || value.startsWith("[REDACTED:")) continue
      if (shouldSkipNumericMatch(text, start, value, key)) continue
      push({
        kind: key,
        original: value,
        start,
        end: start + value.length,
      })
    }
  }

  raw.sort((a, b) => (a.start - b.start) || (a.end - b.end))
  const accepted = []
  for (const item of raw) {
    if (accepted.some((x) => overlap(x.start, x.end, item.start, item.end))) continue
    accepted.push(item)
  }

  let ordinal = 0
  for (const item of accepted) {
    ordinal += 1
    const lc = lineAndColAt(text, item.start)
    item.rid = makeRid(ctx.runSalt, ctx.path, lc.line, lc.col, item.kind, item.original, ordinal)
    item.replacement = `[REDACTED:${item.kind}:${item.rid}]`
    item.preview = linePreviewWithHighlight(text, item.start, item.end)
  }

  return accepted
}

function applyRedactionDecisions(text, candidates) {
  if (!candidates || candidates.length === 0) return { text, mapRows: [] }
  const selected = candidates.filter((c) => c && c.selected)
  if (selected.length === 0) return { text, mapRows: [] }

  selected.sort((a, b) => a.start - b.start)
  let cursor = 0
  let out = ""
  const mapRows = []

  for (const c of selected) {
    out += text.slice(cursor, c.start)
    out += c.replacement
    cursor = c.end
    mapRows.push({ rid: c.rid, original: c.original })
  }
  out += text.slice(cursor)

  return { text: out, mapRows }
}

async function ensureFolder(adapter, folder) {
  if (!folder || folder === ".") return
  const parts = folder.split("/").filter(Boolean)
  let cur = ""
  for (const p of parts) {
    cur = cur ? `${cur}/${p}` : p
    if (!(await adapter.exists(cur))) await adapter.mkdir(cur)
  }
}

async function getWebCrypto() {
  if (globalThis.crypto && globalThis.crypto.subtle) return globalThis.crypto
  try {
    const nodeCrypto = require("crypto")
    if (nodeCrypto.webcrypto && nodeCrypto.webcrypto.subtle) return nodeCrypto.webcrypto
  } catch (_error) {
    // no-op
  }
  throw new Error("Web Crypto API is not available")
}

function randomBytes(webCrypto, length) {
  const bytes = new Uint8Array(length)
  webCrypto.getRandomValues(bytes)
  return bytes
}

function writeUint32(target, offset, value) {
  target[offset] = (value >>> 24) & 0xff
  target[offset + 1] = (value >>> 16) & 0xff
  target[offset + 2] = (value >>> 8) & 0xff
  target[offset + 3] = value & 0xff
}

function readUint32(source, offset) {
  return source[offset] * 16777216 + (source[offset + 1] << 16) + (source[offset + 2] << 8) + source[offset + 3]
}

function startsWithBytes(source, prefix) {
  if (source.length < prefix.length) return false
  for (let i = 0; i < prefix.length; i += 1) {
    if (source[i] !== prefix[i]) return false
  }
  return true
}

function bytesToBase64(bytes) {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64")
  let binary = ""
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function base64ToBytes(base64) {
  if (!base64) return new Uint8Array(0)
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(base64, "base64"))
  const binary = atob(base64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

function toExactArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

async function deriveAesKey(webCrypto, passphrase, salt, iterations) {
  const keyMaterial = await webCrypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), { name: "PBKDF2" }, false, ["deriveKey"])
  return webCrypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  )
}

function packEncryptedPayloadV2(payload) {
  const header = {
    format: FORMAT_ID,
    version: VERSION_V2,
    cipher: "AES-256-GCM",
    kdf: "PBKDF2-SHA256",
    iterations: payload.iterations,
    salt: bytesToBase64(payload.salt),
    iv: bytesToBase64(payload.iv),
    ciphertextLength: payload.encrypted.length,
    passphraseEncoding: "utf-8",
  }
  const headerBytes = new TextEncoder().encode(JSON.stringify(header))
  const out = new Uint8Array(MAGIC_V2_BYTES.length + 4 + headerBytes.length + payload.encrypted.length)
  let offset = 0
  out.set(MAGIC_V2_BYTES, offset)
  offset += MAGIC_V2_BYTES.length
  writeUint32(out, offset, headerBytes.length)
  offset += 4
  out.set(headerBytes, offset)
  offset += headerBytes.length
  out.set(payload.encrypted, offset)
  return out
}

function unpackEncryptedPayloadV2(data) {
  if (!startsWithBytes(data, MAGIC_V2_BYTES)) throw new Error("Invalid encrypted file header")
  let offset = MAGIC_V2_BYTES.length
  const headerLen = readUint32(data, offset)
  offset += 4
  if (headerLen <= 0 || offset + headerLen > data.length) throw new Error("Encrypted header length is invalid")
  const headerText = new TextDecoder().decode(data.slice(offset, offset + headerLen))
  const header = JSON.parse(headerText)
  offset += headerLen
  if (header.version !== VERSION_V2 || header.format !== FORMAT_ID) throw new Error("Unsupported encrypted format metadata")
  const encrypted = data.slice(offset)
  const expectedLen = Number.parseInt(String(header.ciphertextLength), 10)
  if (Number.isFinite(expectedLen) && expectedLen > 0 && expectedLen !== encrypted.length) {
    throw new Error("Encrypted payload length mismatch")
  }
  return {
    iterations: Number.parseInt(String(header.iterations), 10),
    salt: base64ToBytes(header.salt),
    iv: base64ToBytes(header.iv),
    encrypted,
  }
}

async function encryptBytesV2(webCrypto, passphrase, plainText) {
  const plainBytes = new TextEncoder().encode(plainText)
  const salt = randomBytes(webCrypto, 16)
  const iv = randomBytes(webCrypto, 12)
  const key = await deriveAesKey(webCrypto, passphrase, salt, PBKDF2_ITERATIONS)
  const encrypted = new Uint8Array(await webCrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plainBytes))
  return packEncryptedPayloadV2({ salt, iv, iterations: PBKDF2_ITERATIONS, encrypted })
}

async function decryptBytesV2(webCrypto, passphrase, payloadBytes) {
  const payload = unpackEncryptedPayloadV2(payloadBytes)
  if (!Number.isFinite(payload.iterations) || payload.iterations <= 0) throw new Error("Invalid PBKDF2 iterations")
  const key = await deriveAesKey(webCrypto, passphrase, payload.salt, payload.iterations)
  const plain = new Uint8Array(await webCrypto.subtle.decrypt({ name: "AES-GCM", iv: payload.iv }, key, payload.encrypted))
  return new TextDecoder().decode(plain)
}

class ProgressModal extends Modal {
  constructor(app, t) {
    super(app)
    this.t = t
  }

  onOpen() {
    const { contentEl } = this
    contentEl.empty()
    contentEl.createEl("h3", { text: this.t("modalTitle") })
    this.stageEl = contentEl.createEl("p", { text: this.t("modalStarting") })
    this.detailEl = contentEl.createEl("p", { text: "" })
    const bar = contentEl.createDiv({ cls: "vault-sanitizer-progress-bar" })
    bar.style.width = "100%"
    bar.style.height = "12px"
    bar.style.background = "var(--background-modifier-border)"
    bar.style.borderRadius = "6px"
    this.barInner = bar.createDiv({ cls: "vault-sanitizer-progress-fill" })
    this.barInner.style.height = "100%"
    this.barInner.style.width = "0%"
    this.barInner.style.borderRadius = "6px"
    this.barInner.style.background = "var(--interactive-accent)"
    this.scope.register([], "Escape", () => true)
  }

  setProgress(stage, current, total, detail = "") {
    if (this.stageEl) this.stageEl.setText(stage)
    if (this.detailEl) this.detailEl.setText(detail || `${current}/${total}`)
    const pct = total > 0 ? Math.max(0, Math.min(100, Math.floor((current / total) * 100))) : 0
    if (this.barInner) this.barInner.style.width = `${pct}%`
  }
}

class PassphraseModal extends Modal {
  constructor(app, t, options = {}) {
    super(app)
    this.t = t
    this.options = options
    this.value = ""
    this.resolver = null
  }

  onOpen() {
    const { contentEl } = this
    contentEl.empty()
    const titleKey = this.options.titleKey || "passphraseTitle"
    contentEl.createEl("h3", { text: this.t(titleKey) })
    const input = contentEl.createEl("input", { type: "password" })
    input.style.width = "100%"
    let confirmInput = null
    if (this.options.confirm) {
      contentEl.createEl("p", { text: this.t("passphraseConfirmTitle") })
      confirmInput = contentEl.createEl("input", { type: "password" })
      confirmInput.style.width = "100%"
    }
    input.focus()
    const row = contentEl.createDiv()
    row.style.marginTop = "12px"
    const ok = row.createEl("button", { text: this.t("passphraseOk") })
    ok.style.marginRight = "8px"
    const cancel = row.createEl("button", { text: this.t("passphraseCancel") })

    const resolveAndClose = (val) => {
      if (this.resolver) this.resolver(val)
      this.close()
    }
    ok.onclick = () => {
      if (confirmInput && input.value !== confirmInput.value) {
        new Notice(this.t("noticeMapPassphraseMismatch"))
        return
      }
      resolveAndClose(input.value)
    }
    cancel.onclick = () => resolveAndClose(null)
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") ok.click()
    })
    if (confirmInput) {
      confirmInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") ok.click()
      })
    }
  }

  wait() {
    return new Promise((resolve) => {
      this.resolver = resolve
      this.open()
    })
  }
}

class RedactionReviewModal extends Modal {
  constructor(app, t, payload) {
    super(app)
    this.t = t
    this.payload = payload
    this.resolver = null
  }

  onOpen() {
    const { contentEl } = this
    contentEl.empty()
    contentEl.createEl("h3", { text: this.t("reviewTitle") })
    contentEl.createEl("p", { text: this.t("reviewPrompt") })
    contentEl.createEl("p", { text: this.t("reviewCount", { current: this.payload.current, total: this.payload.total }) })
    contentEl.createEl("p", { text: `${this.t("reviewFile")}: ${this.payload.path}` })
    contentEl.createEl("p", { text: `${this.t("reviewKind")}: ${this.payload.kind}` })

    const line = contentEl.createDiv({ cls: "vault-sanitizer-review-line" })
    line.appendText(this.payload.preview.before || "")
    line.createEl("mark", { cls: "vault-sanitizer-review-mark", text: this.payload.preview.target || "" })
    line.appendText(this.payload.preview.after || "")

    const row = contentEl.createDiv({ cls: "vault-sanitizer-review-actions" })
    const btnRedact = row.createEl("button", { text: this.t("reviewRedact") })
    const btnSkip = row.createEl("button", { text: this.t("reviewSkip") })
    const btnRedactAll = row.createEl("button", { text: this.t("reviewRedactAll") })
    const btnSkipAll = row.createEl("button", { text: this.t("reviewSkipAll") })

    const done = (val) => {
      if (this.resolver) this.resolver(val)
      this.close()
    }

    btnRedact.onclick = () => done("redact")
    btnSkip.onclick = () => done("skip")
    btnRedactAll.onclick = () => done("redact-all")
    btnSkipAll.onclick = () => done("skip-all")

    this.scope.register([], "Enter", () => {
      done("redact")
      return false
    })
    this.scope.register([], "Escape", () => {
      done("skip")
      return false
    })
  }

  wait() {
    return new Promise((resolve) => {
      this.resolver = resolve
      this.open()
    })
  }
}

class VaultSanitizerPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
    this.locale = resolveLocale(this.app)
    this.webCrypto = await getWebCrypto()

    this.addCommand({
      id: "vault-sanitizer-incremental",
      name: this.t("commandIncremental"),
      callback: async () => this.runProcess({ mode: "incremental", dryRun: false }),
    })

    this.addCommand({
      id: "vault-sanitizer-restore",
      name: this.t("commandRestore"),
      callback: async () => this.runRestoreProcess(),
    })

    this.addSettingTab(new VaultSanitizerSettingTab(this.app, this))
  }

  async saveSettings() {
    await this.saveData(this.settings)
  }

  t(key, vars = {}) {
    const dict = I18N[this.locale] || I18N.en
    const template = dict[key] || I18N.en[key] || key
    return template.replace(/\{(\w+)\}/g, (_m, name) => String(vars[name] ?? ""))
  }

  async reviewAndRedactContent(text, ctx, reviewState) {
    const candidates = collectRedactionCandidates(text, ctx)
    if (candidates.length === 0) return { text, mapRows: [] }

    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i]

      if (reviewState.mode === "redact-all") {
        candidate.selected = true
        continue
      }
      if (reviewState.mode === "skip-all") {
        candidate.selected = false
        continue
      }

      const modal = new RedactionReviewModal(this.app, this.t.bind(this), {
        current: i + 1,
        total: candidates.length,
        path: ctx.path,
        kind: candidate.kind,
        preview: candidate.preview,
      })
      const decision = await modal.wait()

      if (decision === "redact-all") {
        reviewState.mode = "redact-all"
        candidate.selected = true
      } else if (decision === "skip-all") {
        reviewState.mode = "skip-all"
        candidate.selected = false
      } else if (decision === "redact") {
        candidate.selected = true
      } else {
        candidate.selected = false
      }
    }

    return applyRedactionDecisions(text, candidates)
  }

  async prepareMapContext(adapter) {
    let passphrase = null
    let existingMapText = initMapText()
    const hasEncryptedMap = await adapter.exists(MAP_ENC_PATH)
    const hasLegacyMap = await adapter.exists(LEGACY_MAP_PATH)

    if (hasEncryptedMap) {
      const bin = new Uint8Array(await adapter.readBinary(MAP_ENC_PATH))
      while (true) {
        const modal = new PassphraseModal(this.app, this.t.bind(this), { titleKey: "passphraseExistingTitle" })
        passphrase = await modal.wait()
        if (!passphrase) throw new Error(this.t("errorPassphraseRequired"))
        try {
          existingMapText = await decryptBytesV2(this.webCrypto, passphrase, bin)
          break
        } catch (_err) {
          new Notice(this.t("noticeMapPassphraseRetry"))
        }
      }
    } else if (hasLegacyMap) {
      const modal = new PassphraseModal(this.app, this.t.bind(this), { titleKey: "passphraseNewTitle", confirm: true })
      passphrase = await modal.wait()
      if (!passphrase) throw new Error(this.t("errorPassphraseRequired"))
      existingMapText = await adapter.read(LEGACY_MAP_PATH)
    } else {
      const modal = new PassphraseModal(this.app, this.t.bind(this), { titleKey: "passphraseNewTitle", confirm: true })
      passphrase = await modal.wait()
      if (!passphrase) throw new Error(this.t("errorPassphraseRequired"))
    }

    return { passphrase, existingMapText, hasEncryptedMap, hasLegacyMap }
  }

  async loadMapTextForRestore(adapter) {
    if (await adapter.exists(MAP_ENC_PATH)) {
      const bin = new Uint8Array(await adapter.readBinary(MAP_ENC_PATH))
      while (true) {
        const modal = new PassphraseModal(this.app, this.t.bind(this), { titleKey: "passphraseExistingTitle" })
        const passphrase = await modal.wait()
        if (!passphrase) throw new Error(this.t("errorPassphraseRequired"))
        try {
          return await decryptBytesV2(this.webCrypto, passphrase, bin)
        } catch (_err) {
          new Notice(this.t("noticeMapPassphraseRetry"))
        }
      }
    }

    if (await adapter.exists(LEGACY_MAP_PATH)) {
      return adapter.read(LEGACY_MAP_PATH)
    }

    throw new Error(this.t("errorMapNotFound"))
  }

  async runRestoreProcess() {
    const progress = new ProgressModal(this.app, this.t.bind(this))
    progress.open()

    try {
      const adapter = this.app.vault.adapter
      const all = this.app.vault.getMarkdownFiles().filter((f) => !shouldSkip(f.path, this.settings.skipPrefixes || []))

      progress.setProgress(this.t("stageLoadingMap"), 0, 1)
      const mapText = await this.loadMapTextForRestore(adapter)
      const ridToOriginal = parseMapRidLookup(mapText)

      let restoredFiles = 0
      let restoredTokens = 0
      for (let i = 0; i < all.length; i++) {
        const f = all[i]
        progress.setProgress(this.t("stageRestoring"), i + 1, all.length, f.path)
        const text = await this.app.vault.read(f)
        const restored = restoreContent(text, ridToOriginal)
        if (restored.replaced > 0) {
          restoredFiles += 1
          restoredTokens += restored.replaced
          await this.app.vault.modify(f, restored.text)
        }
      }

      new Notice(this.t("noticeRestoreDone", { files: restoredFiles, tokens: restoredTokens }))
    } catch (error) {
      new Notice(this.t("noticeFailed", { reason: error instanceof Error ? error.message : String(error) }))
      throw error
    } finally {
      progress.close()
    }
  }

  async runProcess({ mode, dryRun }) {
    const progress = new ProgressModal(this.app, this.t.bind(this))
    progress.open()
    const adapter = this.app.vault.adapter
    const ts = nowTs()
    const runSalt = `${ts}-${require("crypto").randomBytes(8).toString("hex")}`

    try {
      progress.setProgress(this.t("stagePreparing"), 0, 1)
      await ensureFolder(adapter, APP_DIR)

      let mapContext = null

      progress.setProgress(this.t("stageLoadingState"), 0, 1)
      let state = { files: {} }
      if (await adapter.exists(STATE_PATH)) {
        try {
          const parsed = JSON.parse(await adapter.read(STATE_PATH))
          if (parsed && parsed.files && typeof parsed.files === "object") state = parsed
        } catch (_e) {
          state = { files: {} }
        }
      }

      const all = this.app.vault.getMarkdownFiles().filter((f) => !shouldSkip(f.path, this.settings.skipPrefixes || []))
      const stateExists = Object.keys(state.files || {}).length > 0
      const bootstrapFull = mode === "incremental" && !stateExists

      if (!dryRun) {
        progress.setProgress(this.t("stageUpdatingMap"), 0, 1)
        mapContext = await this.prepareMapContext(adapter)
      }

      const toProcess = new Set()
      const stableStateRows = {}
      if (mode === "full" || bootstrapFull) {
        for (const f of all) toProcess.add(f.path)
      } else {
        for (let i = 0; i < all.length; i++) {
          const f = all[i]
          progress.setProgress(this.t("stageDiffingIncremental"), i + 1, all.length, f.path)
          const prev = state.files[f.path]
          if (!prev) {
            toProcess.add(f.path)
            continue
          }
          const sameMeta = Number(prev.mtime) === f.stat.mtime && Number(prev.size) === f.stat.size
          if (sameMeta) {
            stableStateRows[f.path] = { mtime: f.stat.mtime, size: f.stat.size, sha256: String(prev.sha256 || "") }
            continue
          }
          const text = await this.app.vault.read(f)
          const currentHash = sha256Hex(text)
          if (String(prev.sha256 || "") === currentHash) {
            stableStateRows[f.path] = { mtime: f.stat.mtime, size: f.stat.size, sha256: currentHash }
          } else {
            toProcess.add(f.path)
          }
        }
      }

      const processedFiles = all.filter((f) => toProcess.has(f.path))
      const mapRows = []
      let changedFiles = 0
      const reviewState = { mode: mode === "incremental" ? "ask" : "redact-all" }

      for (let i = 0; i < processedFiles.length; i++) {
        const f = processedFiles[i]
        progress.setProgress(this.t("stageSanitizing"), i + 1, processedFiles.length, f.path)
        const text = await this.app.vault.read(f)
        const red = await this.reviewAndRedactContent(text, { runSalt, path: f.path }, reviewState)
        mapRows.push(...red.mapRows)
        if (red.text !== text) {
          changedFiles += 1
          if (!dryRun) await this.app.vault.modify(f, red.text)
        }
      }

      progress.setProgress(this.t("stageUpdatingMap"), 0, 1)
      let mapRowsAdded = 0
      if (!dryRun) {
        const merged = appendMapRows(mapContext.existingMapText, mapRows)
        mapRowsAdded = merged.added
        if (mapRowsAdded > 0 || !mapContext.hasEncryptedMap || mapContext.hasLegacyMap) {
          const enc = await encryptBytesV2(this.webCrypto, mapContext.passphrase, merged.text)
          await adapter.writeBinary(MAP_ENC_PATH, toExactArrayBuffer(enc))
        }
        if (mapContext.hasLegacyMap && (await adapter.exists(LEGACY_MAP_PATH))) await adapter.remove(LEGACY_MAP_PATH)
      }

      progress.setProgress(this.t("stageUpdatingState"), 0, 1)
      const finalStateFiles = {}
      for (let i = 0; i < all.length; i++) {
        const f = all[i]
        if (stableStateRows[f.path]) {
          finalStateFiles[f.path] = stableStateRows[f.path]
          continue
        }
        const t = await this.app.vault.read(f)
        const s = (toProcess.has(f.path) && !dryRun) ? await adapter.stat(f.path) : f.stat
        finalStateFiles[f.path] = { mtime: s?.mtime ?? f.stat.mtime, size: s?.size ?? f.stat.size, sha256: sha256Hex(t) }
      }
      if (!dryRun) {
        await adapter.write(STATE_PATH, `${JSON.stringify({ version: 1, last_run: ts, files: finalStateFiles }, null, 2)}\n`)
      }

      progress.setProgress(this.t("stageWritingSummary"), 1, 1)
      let summaryText = ""
      if (await adapter.exists(SUMMARY_PATH)) summaryText = await adapter.read(SUMMARY_PATH)
      else summaryText = "# Sanitizer Summary\n\n"

      const summary = {
        timestamp: ts,
        mode,
        bootstrap_full: bootstrapFull,
        dry_run: dryRun,
        markdown_files: all.length,
        processed_markdown_files: processedFiles.length,
        changed_files: changedFiles,
        redaction_map_rows_added: mapRowsAdded,
        state_file: STATE_PATH,
        sanitizer_map_file: MAP_ENC_PATH,
      }
      let block = `## ${ts}\n\n`
      for (const [k, v] of Object.entries(summary)) block += `- **${k}**: \`${String(v)}\`\n`
      block += "\n"
      const sep = summaryText.endsWith("\n") ? "" : "\n"
      await adapter.write(SUMMARY_PATH, `${summaryText}${sep}${block}`)

      new Notice(this.t("noticeDone", { mode, processed: processedFiles.length, mapAdded: mapRowsAdded }))
    } catch (error) {
      new Notice(this.t("noticeFailed", { reason: error instanceof Error ? error.message : String(error) }))
      throw error
    } finally {
      progress.close()
    }
  }
}

class VaultSanitizerSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display() {
    const { containerEl } = this
    containerEl.empty()

    new Setting(containerEl)
      .setName(this.plugin.t("settingOutputName"))
      .setDesc(this.plugin.t("settingOutputDesc", { dir: APP_DIR }))

    new Setting(containerEl)
      .setName(this.plugin.t("settingFullName"))
      .setDesc(this.plugin.t("settingFullDesc"))
      .addButton((b) =>
        b.setWarning().setButtonText(this.plugin.t("settingFullButton")).onClick(async () => {
          const ok = window.confirm(this.plugin.t("settingFullConfirm"))
          if (!ok) return
          await this.plugin.runProcess({ mode: "full", dryRun: false })
        })
      )

    new Setting(containerEl)
      .setName(this.plugin.t("settingRestoreName"))
      .setDesc(this.plugin.t("settingRestoreDesc"))
      .addButton((b) =>
        b.setWarning().setButtonText(this.plugin.t("settingRestoreButton")).onClick(async () => {
          const ok = window.confirm(this.plugin.t("settingRestoreConfirm"))
          if (!ok) return
          await this.plugin.runRestoreProcess()
        })
      )
  }
}

module.exports = VaultSanitizerPlugin
