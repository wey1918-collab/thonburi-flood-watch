# Security Policy

## Scope

This repository powers the public, read-only Thonburi Flood Watch dashboard. It does not contain user accounts, payment functions, or write APIs.

## Security controls

- Production is HTTPS-only on Vercel.
- Browser security headers and a Content Security Policy are configured in `next.config.ts`.
- GitHub CodeQL scans JavaScript/TypeScript on pushes, pull requests, and weekly.
- Dependency audit runs in CI and Dependabot checks npm and GitHub Actions dependencies weekly.
- Runtime dependencies are pinned to exact top-level versions instead of `latest` ranges.
- npm lifecycle scripts are disabled by default to reduce package-install supply-chain risk.
- GitHub Actions used by security/data workflows are pinned to immutable commit SHAs.
- The data relay validates generated JSON before publishing to the cache branch.

## Reporting a vulnerability

Do not publish exploit details, credentials, tokens, or sensitive logs in a public issue. Use GitHub's private vulnerability reporting / Security Advisory flow when available. If private reporting is unavailable, open a minimal issue asking the maintainer for a private reporting channel without including exploit details.

## Secrets

Never commit API tokens, Vercel tokens, GitHub tokens, passwords, private keys, or production `.env` files. Environment secrets belong in the hosting or CI secret store only.
