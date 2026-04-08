# FB Notes Extended A11Y

FB Notes Extended A11Y is a Chrome extension for composing Facebook notes with a longer text limit, configurable visibility, custom durations, music attachment, and improved accessibility for keyboard and screen reader users.

This repository is a fork of the original project by DuckCIT:
[https://github.com/DuckCIT/FB-Notes-Extended](https://github.com/DuckCIT/FB-Notes-Extended)

Current repository:
[https://github.com/Daoductrung/FB-Notes-Extended](https://github.com/Daoductrung/FB-Notes-Extended)

## What The Extension Does

The extension runs as a Manifest V3 Chrome extension built with Vite, React, and TypeScript. It includes:

- A popup UI for composing notes, choosing audience, setting expiration, selecting music, and reviewing the latest posted note.
- A background service worker that reads Facebook session data from the active tab and sends the internal Facebook GraphQL requests used by the extension.
- A content script that still provides legacy decoding support for previously encoded hidden-note text found on supported Facebook pages.

Because the workflow depends on undocumented Facebook endpoints and metadata, upstream changes on Facebook can break functionality without notice.

## Features

The current codebase supports the following user-facing features:

- Create Facebook notes with text up to the current 600-character limit enforced by the popup flow.
- Choose the note audience: friends, public, contacts, or a custom friend list.
- Set a note duration from presets or from a custom minute value.
- Search Facebook music and preview tracks before selecting one.
- Pick the starting point of the attached music clip with accessible coarse and fine sliders.
- Preview the selected 30-second music clip and toggle playback from the trim controls.
- Review the latest note returned by Facebook, including text, music, audience, and expiration status.
- Delete the latest note directly from the popup when Facebook returns a deletable current note.
- Switch the popup language between English and Vietnamese.
- Decode legacy encoded hidden-note content on supported Facebook pages through the content script.

## Accessibility Focus

This A11Y version adds a stronger accessibility layer to the popup experience:

- Native slider controls replace drag-only music trimming.
- The latest-note panel exposes explicit state, note details, and a visible delete action.
- Dialogs use focus management and keyboard-friendly controls.
- Status and error updates are announced through live regions.
- Labels and control names were revised for clearer screen reader output.

## Project Structure

```text
dist/                  Production build output for Chrome "Load unpacked"
public/                Static assets, icons, and extension manifest
src/background/        Background worker and Facebook request logic
src/content/           Content script for legacy decoding support
src/lib/               Shared helpers such as token extraction
src/popup/             React popup UI, styles, and localization
popup.html             Popup entry document
vite.config.ts         Build configuration
```

## Development

Requirements:

- Node.js 18 or newer
- Google Chrome or another Chromium-based browser

Install dependencies:

```bash
npm install
```

Run a production build:

```bash
npm run build
```

Type-check the project:

```bash
npx tsc --noEmit
```

## Load In Chrome

After running `npm run build`, load the unpacked extension from:

```text
dist
```

Steps:

1. Open `chrome://extensions/`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select the `dist` folder in this repository

## Notes

- The extension only works while the active tab is on `facebook.com` or `messenger.com`.
- Music note publishing currently uses a fixed 30-second clip. The popup only controls the clip start time because that is the field exposed by the Facebook request payload in this codebase.
- The project does not currently include an automated test suite. Practical verification is TypeScript checking, production build validation, and manual testing on Facebook.

## Credits

- Original author: DuckCIT
- Original repository: [https://github.com/DuckCIT/FB-Notes-Extended](https://github.com/DuckCIT/FB-Notes-Extended)
- A11Y version author: Đào Đức Trung

## License

MIT
