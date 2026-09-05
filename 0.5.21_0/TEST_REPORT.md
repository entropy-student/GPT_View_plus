# GPT View+ v0.5.21 — Edge Store i18n Update

## Changes

1. Added standard extension internationalization folders:
   - `_locales/en/messages.json`
   - `_locales/zh_CN/messages.json`
2. Changed `manifest.json` `name` to `__MSG_extensionName__`.
3. Changed `manifest.json` `description` to `__MSG_extensionDescription__`.
4. Added `default_locale: "en"`.
5. Localized the browser action title with `__MSG_extensionName__`.
6. Updated extension version and popup footer to `0.5.21`.
7. Kept the existing in-popup Chinese/English switching logic unchanged.

## Localized short descriptions

### English
Make ChatGPT better for reading and work with wider layouts, long-chat navigation, search, bookmarks, and PDF/Markdown/TXT export.

### 简体中文
让 ChatGPT 更适合阅读与工作：宽屏布局、长对话导航、搜索书签，并支持 PDF、Markdown 和 TXT 导出。

## Automated checks

- `manifest.json` JSON parse: PASS
- Manifest V3: PASS
- Version `0.5.21`: PASS
- `default_locale = en`: PASS
- `name` / `description` use `__MSG_...__`: PASS
- `_locales/en/messages.json`: PASS
- `_locales/zh_CN/messages.json`: PASS
- All manifest localization keys exist in default locale: PASS
- English manifest description length: 130 chars (within 132-char extension-description limit): PASS
- Simplified Chinese description length: 61 chars: PASS
- `popup.js` syntax: PASS
- `content.js` syntax: PASS
- Popup ID uniqueness / exact bindings: PASS
- Permissions unchanged: `storage`: PASS
- Host permissions unchanged: `https://chatgpt.com/*`: PASS
- Existing popup bilingual UI code left intact: PASS
- Store-ready package has `manifest.json` at ZIP root: PASS
- ZIP integrity: PASS
