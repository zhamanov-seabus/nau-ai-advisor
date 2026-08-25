# Security Policy

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
pull requests, or discussions.**

Instead, report them privately so we can investigate and release a fix before the
issue is publicly disclosed. Use one of the following channels:

- GitHub's private vulnerability reporting ("Report a vulnerability" under the
  repository's **Security** tab), if enabled; or
- email the maintainers at **security@ (set by maintainer)**.

> Note: the security contact address above is a placeholder. The repository
> maintainer should replace it with a monitored address before public release.

Please include, to the extent you can:

- a description of the vulnerability and its impact;
- steps to reproduce (proof-of-concept if possible);
- affected versions, components, or endpoints; and
- any suggested remediation.

### What to expect

- We aim to acknowledge a report within a few business days.
- We will investigate, keep you informed of progress, and work on a fix.
- We ask that you give us a reasonable opportunity to remediate before any public
  disclosure (coordinated disclosure).
- With your permission, we are happy to credit you when the fix is published.

## Supported versions

This project is under active development and has not yet reached a stable 1.0
release. Security fixes are applied to the latest state of the default branch.
Until a formal release and support policy is published, users should track the
default branch for security updates.

| Version | Supported |
|---|---|
| Default branch (latest) | Yes |
| Older commits / forks | No |

## Handling of student data (FERPA)

Deployments of this software process student education records, which in the
United States are protected under the Family Educational Rights and Privacy Act
(FERPA). Security reports are therefore treated with high priority.

The project includes safeguards intended to reduce exposure of personally
identifying information — inbound PII redaction (`apps/api/src/common/ferpa-sanitizer.ts`),
field-level AES-256-GCM encryption (`apps/api/src/common/encryption.service.ts`),
role-based access control, and retrieval-grounded answering. These are
engineering controls, not a compliance guarantee.

Operators of a deployment are responsible for:

- setting strong, unique secrets (`JWT_SECRET`, `ENCRYPTION_KEY`, database
  credentials) and never committing them;
- securing network access to the API, database, Redis, and the embedding server
  (the embedding server binds to `127.0.0.1` by default);
- configuring transport security (TLS) in front of the application;
- managing data retention, backups, and access review; and
- performing their own FERPA compliance assessment.

If you believe a vulnerability could expose student PII, please say so
explicitly in your report so we can prioritize accordingly.
