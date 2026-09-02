<!--
SPDX-FileCopyrightText: 2026 Ernesto Alejo and the ReleaseTwin contributors
SPDX-License-Identifier: Apache-2.0
-->

# ReleaseTwin PR annotations — GitHub Action

Runs your ReleaseTwin case suite on a pull request and renders the result as:

- a **PR comment** (created once, updated in place on every re-run — keyed by a hidden
  marker), showing pass/fail totals, the flag-proof verdict, and a table of the notable cases
- a **check run** named `ReleaseTwin` reporting the same outcome

It uses only the workflow's own `GITHUB_TOKEN` and GitHub's REST API. **No ReleaseTwin
account, API token, or hosted call is involved.** Execution stays entirely in your CI.

This Action is **Apache-2.0** licensed (see `LICENSE`), independently of the ReleaseTwin
engine's copyleft license — fork and adapt it freely.

## Usage

```yaml
name: Release-proof gate
on:
  pull_request:

permissions:
  contents: read
  pull-requests: write   # post/update the comment
  checks: write          # create the check run

jobs:
  release-proof:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ernestoalejowitt22/ReleaseTwin/integrations/github-action@v0.2.0
        with:
          cases-path: cases
          image: ghcr.io/ernestoalejowitt22/releasetwin/cli:0.2.0   # pin a released version
```

**Pinning:** `@v0.2.0` (a full released version) is the recommended form for CI. `@v0` is a
floating tag that is force-updated to the latest verified `0.x` release on every release —
use it if you want patches picked up automatically. (At the 1.0 release the convenience ref
becomes `@v1`.)

The `image` input must reference a **publicly pullable** image. Its default is a pinned,
immutable reference that the release workflow advances to a fresh digest on every release —
the Action never runs `:latest`. If you override `image`, pin your own released version
(`…/cli:0.3.0`) or a digest (`…/cli@sha256:…`); a mutable tag still runs but logs a
`::warning::` — a re-tagged or compromised image would run in your job with access to
whatever you pass it.

The step never fails the job on a case failure by itself — the check run is the gate. Make
the `ReleaseTwin` check a required status check on your protected branch to block the merge.

### Secrets and fork pull requests

Anything you hand the CLI container — the `env-file`, or variables named in `env-vars` — is
readable by the case files it runs. Case files are code. **Do not make ingest tokens or any
other sensitive secret available to this Action on a workflow that runs against pull requests
from forks.** GitHub already withholds repository secrets from fork PRs on the `pull_request`
event; keep it that way — don't move this Action to `pull_request_target`, and don't pass
secrets into a job a fork PR can trigger.

## Inputs

| Input | Default | Notes |
| --- | --- | --- |
| `cases-path` | `cases` | Directory of case files, relative to the repo root. |
| `image` | pinned digest (release-managed) | CLI container image. Override with your own `…/cli:X.Y.Z` or `…/cli@sha256:…`; a mutable tag logs a warning. |
| `env-file` | — | Path to a `KEY=VALUE` file passed to the CLI container for `${ENV_VAR}` interpolation. Write it from CI secrets in a prior step. |
| `env-vars` | — | Newline-separated variable **names** to forward from the job environment into the container. |
| `comment` | `true` | Set `false` to skip the PR comment. |
| `check` | `true` | Set `false` to skip the check run. |
| `github-token` | `${{ github.token }}` | Token for the comment/check APIs. |

## Requirements

- A Linux runner with Docker and Node 20 (`ubuntu-latest` has both).
- `permissions: pull-requests: write` and `checks: write` on the job or workflow.

## Notes

- Re-running on the same commit posts an additional check run (GitHub does not dedupe check
  runs the way the comment is deduped); the latest is the one shown.
- On a non-`pull_request` event the comment is skipped and only the check run is created.
