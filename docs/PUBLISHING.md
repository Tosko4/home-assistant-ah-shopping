# Publication checklist

This repository is usable through HACS **custom repositories**. Inclusion in the default catalogue is a separate review; do not describe it as accepted before that review is complete.

## Repository readiness

- [x] Public repository with issues enabled.
- [x] MIT license and bundled third-party license notices.
- [x] Current README, installation, settings, troubleshooting and changelog.
- [x] One integration beneath custom_components, with all runtime assets inside it.
- [x] Local brand/icon assets and NL country restriction.
- [x] Versioned GitHub releases.
- [ ] Set GitHub **About → Description** to:

  > Albert Heijn shopping list, camera barcode scanner and scheduled-order overview for Home Assistant.

- [ ] Add GitHub topics: `home-assistant`, `hacs`, `albert-heijn`, `barcode-scanner`, `shopping-list`, `custom-integration`.
- [ ] Run **Publication checks** in Actions after saving the metadata. All strict checks must pass.

GitHub metadata cannot be set by committing files. Custom-repository validation currently ignores only description/topics; strict publication validation does not ignore them.

## Default HACS catalogue

Use the current [HACS inclusion instructions](https://github.com/hacs/documentation/blob/main/source/docs/publish/include.md). Requirements may change; check them before submission.

1. Pass Validate, including Hassfest.
2. Pass strict Publication checks with no ignores.
3. Publish a full release after successful checks, not just a tag.
4. Submit the repository in the alphabetically appropriate integration entry in `hacs/default`, following its PR template.
5. Do not claim catalogue inclusion until the PR is accepted.

No HACS submission or community post is made automatically by this repository.

## Release procedure

1. Review the changes and tests; do not mix unrelated behaviour changes into a documentation release.
2. Update manifest version, frontend resource version when needed, and CHANGELOG.md.
3. Push to main and wait for Validate.
4. A successful Validate run triggers the release workflow for that exact commit.
5. Confirm the release and tell users whether a Home Assistant restart/browser reload is needed.

Existing released versions are retained for rollback. The historical MVP test report is preserved under [docs/archive](archive/test-report-0.1.8.md); it is not evidence for the current release.

## Community introduction

Use the prepared [community post](COMMUNITY_POST.md). Keep the unofficial/private-API warning, read-only order limitation and custom-repository installation note. Use anonymised screenshots only; obtain permission before publishing user images.
