---
type: guide
tags: [infra, terraform, aws, agents]
owner: Mike
updated: 2026-05-05
status: current
---
# Infra - Agent Work Guide

This guide is for Terraform and AWS infrastructure work in `heylo-infra/`.

The infra checkout may not be present in every vault workspace. If `heylo-infra/` is absent, treat this as routing guidance only and ask for the repo or relevant files before editing.

---

## What infra owns

- AWS platform infrastructure.
- IoT Core, Kinesis, relational DB, and reusable Terraform modules.
- Environment-level changes that can affect live systems.

---

## High-signal files to read first

- `heylo-infra/README.md` - repo-specific setup and workflow, if present.
- `heylo-infra/platform/` - core AWS platform resources.
- `heylo-infra/iot/` - IoT Core and stream resources.
- `heylo-infra/relational_db/` - RDS/MySQL infrastructure.
- `heylo-infra/modules/` - reusable Terraform modules.
- Any plan/spec attached by the user. Do not infer infrastructure intent from code alone.

---

## Fast change recipes

### Change Terraform resources

1. Confirm the target environment/account/workspace with the user.
2. Read the relevant module and caller together.
3. Keep variable names, tags, and output conventions consistent with neighboring modules.
4. Run `terraform fmt -recursive` where appropriate.
5. Run `terraform validate` only when providers are initialized.
6. Produce a plan only after confirming the target environment.

### Add a new module

1. Check `heylo-infra/modules/` for an existing pattern.
2. Keep module inputs explicit and typed.
3. Add outputs only for values consumed by callers.
4. Wire the module from the environment that owns it.
5. Document any required state, secret, or IAM assumption.

---

## Guard rails

- Never run `terraform apply` unless the user explicitly asks.
- Never run `terraform destroy` unless the user explicitly asks and confirms the target.
- Never change state, import resources, or modify backend configuration without explicit approval.
- Never commit secrets, generated credentials, state files, or local provider caches.
- Confirm environment before any command that can talk to AWS.
- Prefer plans and reviewable diffs over live changes.

---

## Done checklist

- Target environment/account/workspace was confirmed for any Terraform command beyond formatting.
- `terraform fmt -recursive` was run or formatting was checked.
- `terraform validate` or `terraform plan` result is reported if run.
- New variables and outputs follow existing naming patterns.
- IAM, networking, data retention, and cost impact were considered.
- Any required application config or deployment follow-up is documented.
