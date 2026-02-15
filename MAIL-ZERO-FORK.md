# Mail-0 (Zero) Fork - lair404

**Fork of:** https://github.com/mail-0/zero
**License:** MIT
**Branch:** `lair404-clean`
**Deployed at:** TBD (Target: https://mail.lair404.xyz)

---

## Changes from Upstream

### Initial Setup
- Initialized fork from `mail-0/zero` main branch.
- Created `lair404-clean` branch for custom developments.
- Documented forking pattern following `dbgate-fork`.

### Customization Goals
- **Relay Integration:** Configure SMTP/IMAP to work with the `@lair404.xyz` relay.
- **Admin View:** Implement a specialized view to oversee all registered mails across the relay.
- **Branding:** Update UI to align with Lair404 aesthetics.

---

## Sync with Upstream

```bash
git fetch upstream
git merge upstream/main
git push origin lair404-clean
```

---

**Fork date:** 2026-02-15
**Base version:** 0.1.0
