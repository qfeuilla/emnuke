# Deployment

## Creating a release

Tag a version and push. The CI builds Chrome, Firefox, and Edge zips and attaches them to a GitHub Release.

```bash
git tag v0.1.0
git push origin v0.1.0
```

The release workflow produces:
- `emnuke-{version}-chrome.zip`
- `emnuke-{version}-firefox.zip`
- `emnuke-{version}-edge.zip`
- `emnuke-{version}-safari.zip`
- `emnuke-{version}-opera.zip`

## Installing from a release zip

### Chrome / Edge
1. Download the `-chrome.zip` (or `-edge.zip`) from the [Releases page](https://github.com/qfeuilla/emnuke/releases)
2. Unzip it
3. Go to `chrome://extensions` (or `edge://extensions`)
4. Enable **Developer mode**
5. Click **Load unpacked** and select the unzipped folder

### Firefox
1. Download the `-firefox.zip` from the [Releases page](https://github.com/qfeuilla/emnuke/releases)
2. Unzip it
3. Go to `about:debugging#/runtime/this-firefox`
4. Click **Load Temporary Add-on** and select the `manifest.json` inside the unzipped folder

Note: Firefox temporary add-ons are removed when you close Firefox. For permanent installation, the extension needs to be signed via [AMO](https://addons.mozilla.org/developers/).

## Publishing to stores

### Chrome Web Store
1. Create a developer account at https://chrome.google.com/webstore/devconsole ($5 one-time)
2. Upload the `-chrome.zip`
3. Review takes 1-3 days

### Firefox Add-ons (AMO)
1. Create an account at https://addons.mozilla.org/developers/
2. Upload the `-firefox.zip`
3. The `gecko.id` is already set to `extension@emnuke.com`
4. Review takes 1-7 days

### Edge Add-ons
1. Create an account at https://partner.microsoft.com/dashboard/microsoftedge
2. Upload the `-edge.zip` (same MV3 format as Chrome)
3. Review takes 1-3 days

### Safari
1. Requires macOS with Xcode installed
2. Run `xcrun safari-web-extension-converter .output/safari-mv3` to create an Xcode project
3. Build and sign in Xcode
4. Distribute via the Mac App Store or direct download

### Opera Add-ons
1. Create an account at https://addons.opera.com/developer/
2. Upload the `-opera.zip`
3. Review takes 1-3 days

## CI/CD

- **On push/PR to main**: runs type-check (`pnpm compile`) and builds Chrome + Firefox
- **On version tag** (`v*`): builds all 5 platforms (Chrome, Firefox, Edge, Safari, Opera), creates a GitHub Release with zips attached

Future: automate store publishing via [wxt submit](https://wxt.dev/guide/publishing.html).
