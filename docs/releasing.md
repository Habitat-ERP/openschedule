# Releasing

OpenSchedule publishes npm packages from GitHub Actions using Changesets.

## One-time npm setup

For each published package, configure npm Trusted Publishing:

- Publisher: GitHub Actions
- Repository: `Habitat-ERP/openschedule`
- Workflow filename: `release.yml`
- Allowed action: `npm publish`

Do this for:

- `@openschedule/core`
- `@openschedule/za-sars`
- `@openschedule/za-customs`
- `@openschedule/cli`
- `@openschedule/mcp`

## Normal release flow

1. Open a PR.
2. The `Changeset` workflow adds a patch changeset automatically when none exists.
3. For minor or major releases, edit or replace the generated changeset before merge.
4. Merge the feature PR to `main`.
5. The release workflow opens or updates the `Version Packages` PR.
6. Review and merge that PR.
7. The release workflow runs tests, checks package contents, and publishes changed packages to npm.

You can still create a changeset manually with `npm run changeset`.

## Direct pushes

If someone pushes straight to `main`, the `Changeset` workflow adds the missing changeset in a follow-up commit. Prefer branch protection so normal work still goes through PR review.

Do not publish SARS PDFs, fetched caches, generated `za-customs.json`, or SARS-derived datasets.

## Main branch protection

Keep this simple: require the CI workflow before merging to `main`, and disable direct pushes to `main`.

The CI workflow requires `npm run changeset:check` on pull requests, except the automated `Version Packages` PR where changesets have already been consumed into version bumps.
