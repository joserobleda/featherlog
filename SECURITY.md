# Security policy

## Reporting a vulnerability

**Please don't report security issues in public issues, discussions or pull requests.**

Report them privately through GitHub's security advisories: go to the repository's **Security** tab → **Report a vulnerability** (https://github.com/joserobleda/featherlog/security/advisories/new). Only the maintainer receives the report.

Please include:

- what is affected (version or commit, and which component: dashboard, REST API, MCP, widget, public pages, Docker image or deploy scripts)
- steps to reproduce or a proof of concept
- the impact you expect

You'll get an acknowledgement within a few days. We'll keep you updated while we work on a fix and credit you in the advisory unless you'd rather stay anonymous. Please give us reasonable time to release a fix before you disclose anything.

## Supported versions

Security fixes go into the latest release. Self-hosters should keep up with releases (see [upgrades](docs/self-hosting.md#upgrades-and-rollbacks)).

## Scope

In scope: the code in this repository and the official Docker image. Out of scope: problems that need a compromised server or admin account, missing best-practice headers with no demonstrated impact, and vulnerabilities in third-party services you connect, such as your SMTP or S3 provider.
