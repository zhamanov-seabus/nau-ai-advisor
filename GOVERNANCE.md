# Project Governance

This document describes how the NAU AI Academic Advisor project is governed. The
model is intentionally lightweight and follows an **open-core** approach: the
project in this repository is developed in the open under the Apache License 2.0,
and individual universities may build their own institutional deployments on top
of it.

## Guiding principles

- **Open by default.** Technical discussion, decisions, and roadmap happen in the
  open (issues and pull requests) whenever possible.
- **Meritocratic.** Influence follows sustained, high-quality contribution and
  demonstrated good judgment.
- **Institution-friendly.** The project is designed to be self-hosted and owned
  by each deploying university. Governance of the open core is separate from any
  single institution's operational decisions.

## Roles

### Users and deployers

Anyone who runs the software. Deployers own their own instance, data, content,
configuration, and compliance posture (see [SECURITY.md](./SECURITY.md) and the
privacy section of the [README](./README.md)). Deployers are encouraged — but not
required — to contribute fixes and improvements back to the project.

### Contributors

Anyone who submits issues, pull requests, documentation, or other improvements.
Contributions are accepted under the project license and the Developer
Certificate of Origin sign-off described in [CONTRIBUTING.md](./CONTRIBUTING.md).

### Maintainers

Maintainers review and merge contributions, triage issues, cut releases, and
steward the roadmap. Maintainers are expected to act in the interest of the
project as a whole, uphold the [Code of Conduct](./CODE_OF_CONDUCT.md), and
respond to security reports.

### Lead maintainer

The project was created by **Azamat Zhamanov** in collaboration with **North
American University**. The lead maintainer holds a tie-breaking vote (see
Decision-making) and is responsible for the overall direction of the open core.

## Decision-making

- **Routine changes** (bug fixes, documentation, well-scoped improvements) are
  decided through normal pull-request review: at least one maintainer approval,
  passing checks, and no unresolved objections from another maintainer.
- **Significant changes** (architecture, security-relevant behavior, new modules,
  breaking changes, changes to governance or licensing) are proposed and
  discussed in an issue or pull request. The goal is **lazy consensus** — if no
  maintainer objects within a reasonable review window, the change proceeds.
- **When consensus cannot be reached**, maintainers seek to resolve the
  disagreement through discussion. If it remains deadlocked, the lead maintainer
  makes the final decision, with reasoning stated publicly.

## Becoming a maintainer

There is no fixed quota. A contributor may be invited to become a maintainer
after a track record of:

- sustained, high-quality contributions over time;
- sound technical judgment in reviews and discussions;
- reliability in following through on work; and
- consistent adherence to the Code of Conduct.

Any existing maintainer may nominate a contributor. The nomination is approved by
consensus of the current maintainers (with the lead maintainer able to break a
tie). Maintainers who become inactive for an extended period may be moved to
emeritus status; this is an administrative step, not a judgment of past work.

## Roadmap ownership

The advisor module is the first of a planned modular ecosystem (see the
[Roadmap](./README.md#roadmap)). The maintainers own the roadmap collectively.
Proposals for new modules or major direction changes are raised as issues,
discussed openly, and sequenced by the maintainers with the lead maintainer
arbitrating priority when needed. Deployers and contributors are encouraged to
surface real-world needs to inform prioritization.

## Open core and institutional deployments

The code in this repository is the **open core**: it is licensed under Apache 2.0
and free for any institution to run, modify, and self-host. Individual
universities may maintain private forks, institution-specific content, integrations,
and operational configuration outside this repository; those deployments are
governed by the institutions that run them, not by this project. Contributions
intended to benefit all deployers are welcome upstream under the process above.
Nothing in this governance document alters the terms of the [LICENSE](./LICENSE).

## Changes to this document

Changes to governance follow the "significant changes" process above and require
lead-maintainer approval.
