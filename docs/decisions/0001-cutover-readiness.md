# 0001: Cutover readiness for newheightseducation.org

- **Status:** Recorded 2026-10-02. **Not ready.** The cutover stays gated on [#68: cutover](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/68).
- **Decision:** Do not cut over yet. Two things must happen first, in this order:
  1. Move DNS off Bluehost before its hosting lapses (around 2026-10-05). That protects mail and gives the three subdomains somewhere to redirect from.
  2. Cut over once conditions C1 to C7 below are met.

  The repo can serve the apex today. The site it would serve is missing the `school.` and `publications.` sections, and the full export does not fit on GitHub Pages yet.

## How this was decided

1. **Evidence.** Every measured claim carries the query that proves it, in the [appendix](#appendix-deciding-queries). Dates and plans that are not measurable from outside (the hosting bill, the workflows) link the issue that records them.
2. **First adversarial round.** Each finding was re-run to try to disprove it:
   - DNS answers were taken again from both authoritative Bluehost nameservers, not only a public resolver.
   - The HSTS and redirect checks were repeated on all five hosts.
3. **Second adversarial round.** Each "fine" verdict was attacked for a missed blocker. That round added two findings:
   - SPF, because two SPF records is a hard failure, not a warning.
   - The subdomain redirects, because GitHub Pages cannot redirect a host it does not serve.
4. **Adjudication.** Each contested item was settled by its deciding query.

## Verdict by area

| Area                   | Verdict                                        | Deciding evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Site completeness      | **Blocker**                                    | `main` has 436 routes and no `/school/` or `/publications/` section. The full 791-route conversion, adding 355 school and publications routes, is [#40](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/pull/40), still a draft (C1)                                                                                                                                                                                                                                          |
| Export size            | **Blocker**                                    | `main` builds to 848 MB. #40 builds to 1.3 GB, over the 1 GB Pages limit ([#43](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/43), C1)                                                                                                                                                                                                                                                                                                                               |
| DNS host               | **Blocker, time-bound**                        | The zone is on `ns1/ns2.bluehost.com`, Bluehost's DNS for the hosting account. The hosting bill lands around 2026-10-05 (recorded on [#41](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/41) and [#1342](https://github.com/FreeForCharity/FFC-Cloudflare-Automation/issues/1342)). The zone carries the Google Workspace MX records, so it has to move before it can be lost (C2, [#1342](https://github.com/FreeForCharity/FFC-Cloudflare-Automation/issues/1342)) |
| Domain registration    | Fine                                           | Bluehost is the registrar. The registration expires 2027-01-09, separately from hosting. `clientTransferProhibited` is the normal lock                                                                                                                                                                                                                                                                                                                                                         |
| Email                  | Unaffected by the flip, at risk from the lapse | MX is Google Workspace (`aspmx.l.google.com` and alternates), not the apex A record. A cutover that only changes A and `www` leaves mail alone                                                                                                                                                                                                                                                                                                                                                 |
| SPF, DKIM, DMARC       | Broken today, fix during the move              | There are two `v=spf1` TXT records, which is a permanent error under RFC 7208 §4.5, and neither includes `_spf.google.com`. `google._domainkey` has no record, and there is no `_dmarc` record. This predates the migration, but the DNS move is the time to fix it (C3)                                                                                                                                                                                                                       |
| Apex IPv6              | Fine                                           | No AAAA at the apex on either nameserver, so there is no TEP-style blocker                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Subdomains             | **Blocker**                                    | `school.`, `publications.` and `radio.` each serve WordPress at `50.87.236.5`. One Pages site serves one custom domain, so their redirects to `/school/`, `/publications/` and `/radio/` need a proxy, such as Cloudflare redirect rules. That requires the zone in Cloudflare (C2, C4, [#59](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/59))                                                                                                                     |
| `radio.`               | Undecided                                      | Not captured. 675 fragments on `main` link to it ([#46](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/46)). Its pages and media are archived under [#41](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/41)                                                                                                                                                                                                                                 |
| TTL                    | Must lower first                               | The apex A record and `www` are at 14400 (4 hours), and NS at 21600. Lower A and `www` to 300 at least 4 hours before the window (C5)                                                                                                                                                                                                                                                                                                                                                          |
| HTTPS and HSTS         | Fine, better than TEP                          | No host sends `Strict-Transport-Security`. A visitor who hits the certificate gap during the window can click through, and a rollback cannot strand anyone behind cached HSTS                                                                                                                                                                                                                                                                                                                  |
| Pages custom domain    | Not staged                                     | Pages uses the workflow build with no `cname`. There is no `public/CNAME`, `siteConfig.url` is the github.io URL, and both `security.txt` Canonical lines point at github.io. That is [#65](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/65), held for authorization (C6)                                                                                                                                                                                           |
| Binding access         | Needs Clarke                                   | `clarkemoyer` is the only admin, and `phoganuci` has write. Binding a custom domain needs admin or the "manage GitHub Pages settings" permission (C6)                                                                                                                                                                                                                                                                                                                                          |
| `www`                  | Fine after a change                            | `www` is a CNAME to the apex. Pointing it at `freeforcharity.github.io.` is what GitHub's DNS check expects, so the certificate covers both names                                                                                                                                                                                                                                                                                                                                              |
| Bluehost-only names    | Retire                                         | `mail.` and `autodiscover.` resolve to Bluehost, and Bluehost's certificate also names `webmail.`, `cpanel.`, `webdisk.`, `cpcalendars.` and `cpcontacts.`. Mail is on Google, so they serve nothing the charity needs once WordPress is gone                                                                                                                                                                                                                                                  |
| Live-site preservation | In progress                                    | Forms, products, dFlip sources, the media library with hashes, screenshots and `radio.` are archived under [#41](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/41)                                                                                                                                                                                                                                                                                                   |

## Conditions before the window

- **C1. The full site is on `main` and fits on Pages.** Merge [#40](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/pull/40) after [#43](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/43) brings the export under 1 GB. Pass [#62](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/62) and [#63](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/63) on the result.
- **C2. The zone is in Cloudflare before Bluehost hosting lapses** ([#1342](https://github.com/FreeForCharity/FFC-Cloudflare-Automation/issues/1342)).
  - Copy every record first: MX, TXT, A for the apex and the three subdomains, the `www` CNAME, and `mail`/`autodiscover`.
  - Then change the nameservers at the registrar.
  - Before changing delegation, compare the whole zone: query every name in the appendix (apex A and TXT, MX, `www`, `school`, `publications`, `radio`, `mail`, `autodiscover`, `_dmarc`, `google._domainkey`) against both new Cloudflare nameservers and against `ns1.bluehost.com`, and diff the answers.
  - After delegation, repeat the same comparison through `1.1.1.1` and `8.8.8.8` until every answer matches, and send a test message to the charity's Workspace inbox.
  - This is independent of the site cutover and is the only time-critical item.
- **C3. Fix mail authentication during the move.**
  - Publish one SPF record. The likely value is `v=spf1 include:_spf.google.com ~all`; add the Bluehost entries only if the charity still sends from Bluehost.
  - Turn on Google Workspace DKIM and publish its key.
  - Start DMARC at `p=none` with a reporting address.
  - The charity's Workspace admin confirms the sending sources.
- **C4. Redirects for the old hosts.** Cloudflare rules send `school.` to `/school/`, `publications.` to `/publications/`, and `radio.` to `/radio/` or the ruling from [#42](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/42). Each rule keeps the path. Cloudflare only runs Redirect Rules on proxied hostnames, so the `school`, `publications` and `radio` records must be proxied (orange cloud) before the rules are enabled. A DNS-only record keeps sending visitors to Bluehost. They are drafted under [#59](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/59) and applied only with DNS authorization.
- **C5. TTL at 300** on the apex A and `www`, at least 4 hours ahead. Create the new records at 300 too.
- **C6. Staging and binding.**
  - [#65](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/65) is staged with `public/CNAME`, `siteConfig.url` and both `security.txt` lines.
  - Workflow 121 reports READY.
  - Clarke is available to bind the domain, or grants a role that can.
- **C7. Authorization and mechanism recorded on [#68](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/68).** With the zone in Cloudflare, workflow 120 can do the flip. Without it, the flip is a manual change in Bluehost's DNS editor.

## Window outline

TEP's [runbook](https://github.com/FreeForCharity/FFC-EX-theeverythingproject.org/blob/main/docs/decisions/0001-cutover-readiness.md#window-runbook) applies, with these differences:

- the nameservers are Cloudflare's after C2;
- there is no AAAA to remove;
- no host sends HSTS;
- the three subdomain redirect rules are enabled in the same window.

## Rollback

- **DNS:** revert the apex A to `50.87.236.5` and `www` to a CNAME to the apex. At TTL 300, most visitors are back within about 5 minutes. With no HSTS, nobody is stuck on a certificate error.
- **Precondition:** rollback only works while Bluehost hosting is still paid. Once hosting ends there is nothing to roll back to, so the stable-period decision is also the decision to let Bluehost lapse.

## Appendix: deciding queries

Run 2026-10-02 from a residential resolver, then re-run against the authoritative servers.

```console
$ dig +noall +answer NS newheightseducation.org
newheightseducation.org. 21600 IN NS ns1.bluehost.com.
newheightseducation.org. 21600 IN NS ns2.bluehost.com.

$ for ns in ns1 ns2; do dig +noall +answer @$ns.bluehost.com newheightseducation.org A; dig +noall +answer @$ns.bluehost.com newheightseducation.org AAAA; done
newheightseducation.org. 14400 IN A 50.87.236.5
newheightseducation.org. 14400 IN A 50.87.236.5

$ dig +noall +answer MX newheightseducation.org
newheightseducation.org. 3600 IN MX 1 aspmx.l.google.com.
newheightseducation.org. 3600 IN MX 5 alt1.aspmx.l.google.com.
newheightseducation.org. 3600 IN MX 5 alt2.aspmx.l.google.com.
newheightseducation.org. 3600 IN MX 10 alt3.aspmx.l.google.com.
newheightseducation.org. 3600 IN MX 10 alt4.aspmx.l.google.com.

$ dig +noall +answer @ns1.bluehost.com newheightseducation.org TXT | grep spf
newheightseducation.org. 14400 IN TXT "v=spf1 +a +mx +ip4:50.87.236.5 +ip4:74.220.219.149 +include:bluehost.com ~all"
newheightseducation.org. 14400 IN TXT "v=spf1 +a +mx +ip4:50.87.236.5 +include:bluehost.com ~all"

$ dig +noall +answer TXT _dmarc.newheightseducation.org; dig +noall +answer TXT google._domainkey.newheightseducation.org
(no answer to either)

$ for s in www school publications radio; do dig +noall +answer @ns1.bluehost.com $s.newheightseducation.org; done
www.newheightseducation.org. 14400 IN CNAME newheightseducation.org.
school.newheightseducation.org. 14400 IN A 50.87.236.5
publications.newheightseducation.org. 14400 IN A 50.87.236.5
radio.newheightseducation.org. 14400 IN A 50.87.236.5

$ whois newheightseducation.org | grep -iE 'registrar:|expiry|status|dnssec'
Registry Expiry Date: 2027-01-09T22:57:56Z
Registrar: Bluehost Inc.
Domain Status: clientTransferProhibited
DNSSEC: unsigned

$ for h in newheightseducation.org www.newheightseducation.org school.newheightseducation.org publications.newheightseducation.org radio.newheightseducation.org; do curl -sSI https://$h/ | grep -iE '^HTTP|strict-transport|^location'; done
HTTP/2 200
HTTP/2 301
location: https://newheightseducation.org/
HTTP/2 200
HTTP/2 200
HTTP/2 200
(no Strict-Transport-Security on any host)

$ echo | openssl s_client -connect newheightseducation.org:443 -servername newheightseducation.org 2>/dev/null | openssl x509 -noout -issuer -enddate
issuer= /C=US/O=Let's Encrypt/CN=YR1
notAfter=Nov  7 21:21:08 2026 GMT

$ gh api repos/FreeForCharity/FFC-EX-newheightseducation.org/pages -q '{build_type, cname, https_enforced}'
{"build_type":"workflow","cname":null,"https_enforced":true}

$ gh api repos/FreeForCharity/FFC-EX-newheightseducation.org/collaborators -q '.[] | "\(.login) \(.role_name)"'
phoganuci write
clarkemoyer admin

$ echo | openssl s_client -connect newheightseducation.org:443 -servername newheightseducation.org 2>/dev/null | openssl x509 -noout -text | grep -o 'DNS:[^,]*'
DNS:autodiscover.newheightseducation.org DNS:bci.oha.mybluehost.me DNS:cpanel.newheightseducation.org
DNS:cpcalendars.newheightseducation.org DNS:cpcontacts.newheightseducation.org DNS:mail.bci.oha.mybluehost.me
DNS:mail.newheightseducation.org DNS:newheightseducation.org DNS:webdisk.newheightseducation.org
DNS:webmail.newheightseducation.org DNS:website-263517e5.newheightseducation.org DNS:www.bci.oha.mybluehost.me
DNS:www.newheightseducation.org DNS:www.website-263517e5.newheightseducation.org

$ for s in mail autodiscover; do dig +noall +answer $s.newheightseducation.org; done
mail.newheightseducation.org. 14400 IN CNAME newheightseducation.org.
newheightseducation.org. 14400 IN A 50.87.236.5
autodiscover.newheightseducation.org. 14400 IN A 50.87.236.5

$ grep -rl 'radio\.newheightseducation\.org' src/clone-content | wc -l
675

$ git fetch origin pull/40/head:pr40
$ git ls-tree -r --name-only pr40 -- src/app | grep -c 'page.tsx$'
791
$ git ls-tree -r --name-only pr40 -- src/app | grep -E '^src/app/(school|publications)/' | grep -c page.tsx
355

$ find src/app -name page.tsx | wc -l; ls src/app | grep -cE '^(school|publications)$'; du -sh out
436
0
848M    out
```

The 1.3 GB size of the #40 build, and its breakdown, is measured on [#43](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/43). Workflows 120 and 121 are described in TEP's record and on [#65](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/65).
