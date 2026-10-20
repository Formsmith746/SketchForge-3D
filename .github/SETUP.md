# Repository and release setup

## Repository owner

The desktop updater publishes releases for `Formsmith746/SketchForge-3D`.

Keep these values in `apps/desktop/electron-builder.yml`:

```yaml
publish:
  provider: github
  owner: Formsmith746
  repo: SketchForge-3D
```

The Git remote can use another account or mirror. The `publish.owner` value must match the repository that hosts the release assets.

## GitHub Actions permissions

The `Desktop Release` workflow needs permission to create tags and upload release assets.

Set the repository workflow permission to **Read and write permissions** under:

`Settings` → `Actions` → `General` → `Workflow permissions`

The workflow also declares:

```yaml
permissions:
  contents: write
```

## Create a release

Push a tag such as `v1.0.6`, or run `Desktop Release` with `workflow_dispatch` and enter `1.0.6`.

The workflow builds these packages:

- Windows NSIS installer
- Linux AppImage
- macOS x64 DMG and ZIP
- macOS arm64 DMG and ZIP

The macOS ZIP files and merged `latest-mac.yml` file are required by `electron-updater`.

## macOS signing and notarization

The macOS job reads these repository secrets:

- `CSC_LINK`: base64-encoded Developer ID Application certificate
- `CSC_KEY_PASSWORD`: certificate password
- `APPLE_API_KEY`: App Store Connect API private key contents or base64-encoded contents
- `APPLE_API_KEY_ID`: App Store Connect API key ID
- `APPLE_API_ISSUER`: App Store Connect API issuer ID

When all signing and Apple notarization variables are present, the macOS artifacts use their normal names:

```text
SketchForge-VERSION-x64.dmg
SketchForge-VERSION-x64.zip
SketchForge-VERSION-arm64.dmg
SketchForge-VERSION-arm64.zip
```

When one or more signing or Apple notarization variables are missing, the workflow marks the packages as unsigned:

```text
SketchForge-VERSION-x64-unsigned.dmg
SketchForge-VERSION-x64-unsigned.zip
SketchForge-VERSION-arm64-unsigned.dmg
SketchForge-VERSION-arm64-unsigned.zip
```

Unsigned packages trigger a Gatekeeper warning. Add the signing and notarization secrets before public distribution.

Do not commit certificates, private keys, or passwords.
