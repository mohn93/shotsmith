# Releasing Shotsmith

A version tag on `main` runs `.github/workflows/release.yml`. That workflow:
1. checks the release (`scripts/check-release.mjs`);
2. runs lint and the tests on Ubuntu;
3. packs the skill (`npm run pack-skill`);
4. publishes to npm with provenance;
5. creates a GitHub release with `store-screenshots-<version>.zip` and the changelog section.

## One-time setup

1. The repository is public. npm provenance needs a public source repository.
2. On npmjs.com, open package `shotsmith`, then Settings, then Trusted Publisher, and add GitHub Actions:
   - owner `mohn93`;
   - repository `shotsmith`;
   - workflow `release.yml`;
   - no environment.

   No npm token is stored in GitHub.
3. Before making the repository public, fetch pull request refs (`git fetch origin '+refs/pull/*/head:refs/remotes/origin/pull/*'`) and run `node scripts/audit-history.mjs`; GitHub keeps those refs fetchable.

## Each release

1. **Skill quality, before each minor release.** Rerun the three-app agent trial with the skill and CLI being released. Record it in the trial record below.
2. **Bump the version.**
   - Set the new version in `package.json` (`npm version <x.y.z> --no-git-tag-version`), `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`.
   - Set the same version in every `shotsmith@<version>` in `skills/store-screenshots/` and README.md; the skill-content test checks this.
   - Add a `## <x.y.z>` section to `CHANGELOG.md`.
3. **Check it.** Run `npm test` and `node scripts/check-release.mjs`, which prints `Ready to release <x.y.z> (dry run)`. Merge into `dev` through a pull request with CI green.
4. **Dry-run the release workflow.** Actions, then Release, then Run workflow on `dev` with dry-run on. A manual run never publishes: it runs the verify job only. It must pass.
5. **Merge `dev` into `main`.** CI must be green on `main`.
6. **Tag and push.**
   - Run `git tag -a v<x.y.z> origin/main -m "Shotsmith <x.y.z>"`, then `git push origin v<x.y.z>`.
   - Watch the release workflow until it finishes.
7. **Verify.**
   - Check npm and its provenance: `npm view shotsmith@<x.y.z> version dist.attestations`.
   - Check the GitHub release: `gh release view v<x.y.z>`, which should list the zip.
   - In an empty folder, run `npx shotsmith@<x.y.z> init demo --app Demo`, then `npx shotsmith build` in it.

### If npm publish succeeded but the GitHub release failed

Re-running the workflow fails because the version is already on npm. Instead, on the tagged commit run `node scripts/check-release.mjs` and `npm run pack-skill` locally, then:

```
gh release create v<x.y.z> release/store-screenshots-<x.y.z>.zip --title "Shotsmith <x.y.z>" --notes-file release/notes.md --verify-tag
```

## Trial record

| Version | Date | Apps | Corrections | Traps caught | Time | Tokens | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0.1.0 | 2026-10-02 | not run | - | - | - | - | First release; the examples were ported from the trial run before the CLI existed. Run the trial before 0.2.0. |
