# 0001: Cutover readiness for newheightseducation.org

- **Status:** Proposed, 2026-10-07. The cutover remains gated on [#68: cutover](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/68), which needs explicit authorization.
- **Scope:** what has to be true before the domain moves from Bluehost WordPress to GitHub Pages: DNS, mail, the Pages binding, TTLs, HTTPS, subdomain redirects and rollback.
- **Not a verdict:** this record lists verified facts, blockers and conditions. Whether and when to cut over is the maintainer's decision.

## How this was decided

1. **Gather.** Every claim below comes with the query that shows it, in the appendix. DNS was queried on 2026-10-07 from the maintainer's machine. The agent sandbox can't reach DNS, and it got bogus answers from direct nameserver queries.
2. **First adversarial round.** Each problem was checked for whether it is really a problem, and each "fine" item was checked for whether it could break the cutover.
3. **Second adversarial round.** The first round's conclusions were attacked in turn. Each contested item was settled by re-running its deciding query. Those items are marked **(contested)** below.

## Verdict by area

| Area                                 | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                         | Evidence                                                                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Nameservers and zone                 | The zone is on Bluehost (`ns1/ns2.bluehost.com`, NS TTL 21600). Cancelling Bluehost hosting can take the zone, and with it mail, down. **Blocker for cancelling Bluehost, not for the flip**                                                                                                                                                                                                                                                    | Q1, Q2                                                                                                                           |
| Registrar                            | Bluehost, registered until 2027-01-09. The registrar login is tracked on [FFC-Cloudflare-Automation#1342: NHEG onboarding](https://github.com/FreeForCharity/FFC-Cloudflare-Automation/issues/1342)                                                                                                                                                                                                                                             | Q10                                                                                                                              |
| Apex A                               | `50.87.236.5`, TTL 14400 (4 hours)                                                                                                                                                                                                                                                                                                                                                                                                              | Q3                                                                                                                               |
| Apex AAAA                            | None. **Unlike theeverythingproject.org, there is no IPv6 record to remove,** so GitHub's certificate check sees only the records we set                                                                                                                                                                                                                                                                                                        | Q3                                                                                                                               |
| CAA                                  | None, so Let's Encrypt (GitHub Pages) may issue                                                                                                                                                                                                                                                                                                                                                                                                 | Q3                                                                                                                               |
| `www`                                | CNAME to the apex, TTL 14400. Live answers 301 to the apex                                                                                                                                                                                                                                                                                                                                                                                      | Q4, Q9                                                                                                                           |
| `school.`, `publications.`, `radio.` | Each has its own A record to `50.87.236.5`. They are served by Bluehost WordPress today and stop working once Bluehost is cancelled, unless redirected ([#59](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/59), `docs/cutover/redirects.md`)                                                                                                                                                                         | Q4                                                                                                                               |
| Mail routing                         | MX is Google Workspace (`aspmx.l.google.com` and alternates, TTL 3600). The MX records don't depend on the apex A record, so **the A record flip doesn't touch mail.** Mail is at risk only if the zone itself disappears with Bluehost                                                                                                                                                                                                         | Q5                                                                                                                               |
| SPF **(contested)**                  | Two `v=spf1` TXT records, which is a permanent error under RFC 7208 §4.5. Neither covers Google (`include:_spf.google.com`). Both use `+a +mx`. The first round called this cutover-neutral. The second round noted that after the flip, `+a` authorizes GitHub's IPs to send as the domain. Resolved: GitHub Pages doesn't send mail, so the change has no practical effect, but the SPF must be fixed when the zone moves anyway (C3)         | Q6                                                                                                                               |
| DKIM, DMARC                          | Neither exists (`google._domainkey`, `_dmarc`). Pre-existing, and not a cutover blocker; fixing them is recommended at the zone move (C3)                                                                                                                                                                                                                                                                                                       | Q7                                                                                                                               |
| Other records                        | `mail.` and `ftp.` are CNAMEs to the apex, and `autodiscover.` is an A record to Bluehost. After the flip, `mail.` and `ftp.` would resolve to GitHub. Webmail is Google's, so nothing NHEG uses depends on them; remove them at the zone move                                                                                                                                                                                                  | Q4                                                                                                                               |
| Domain verification                  | One TXT, `_globalsign-domain-verification=…`. Keep it when copying the zone                                                                                                                                                                                                                                                                                                                                                                     | Q6                                                                                                                               |
| HSTS **(contested)**                 | Live sends **no** `Strict-Transport-Security` header on the apex or on `www`. The first round treated that as a lower risk than TEP, where cached HSTS turned any certificate gap into a hard failure. The second round checked whether HSTS could be preloaded or sent on another path: the header is absent on both hosts. Result: during a certificate gap, visitors can click through a warning, so the gap is unpleasant but not a lockout | Q9                                                                                                                               |
| Pages binding                        | `cname: null`, `build_type: workflow`, `https_enforced: true`. With a workflow source, `public/CNAME` doesn't bind the domain, so the binding needs a repo admin (`clarkemoyer`, `Christo6` or `Tyler-Carlotto`). `phoganuci` has write, not admin                                                                                                                                                                                              | Q11, Q12                                                                                                                         |
| Build at the apex                    | No `public/CNAME` today. `siteConfig.url` is `https://freeforcharity.github.io`, and both `security.txt` files' `Canonical` lines point at the github.io subpath. `deploy.yml` builds at the root only when `public/CNAME` exists. All of this is [#65: stage the custom-domain CNAME](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/65) (held)                                                                       | Q13                                                                                                                              |
| Legacy URLs                          | Repo side done: links to old URLs repointed ([#116](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/pull/116)), and 82 stubs for old WordPress URLs ([#118](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/pull/118)). Host redirects for the three subdomains are planned in `docs/cutover/redirects.md` as proxied Cloudflare records with Single Redirect rules. Not applied                              | Q14                                                                                                                              |
| Site parity                          | Open. The 2026-10-07 review reopened sign-off on [#62](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/62) and [#63](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/63) with eight restore items (embeds on home, school and radio, plus layout details)                                                                                                                                       | handoff of 2026-10-07                                                                                                            |
| Workflow 121                         | Not a reliable gate on its own. TEP found it follows the apex redirect and matches WordPress text. Check a `/_next/static/` asset and crawl the routes instead                                                                                                                                                                                                                                                                                  | [TEP 0001](https://github.com/FreeForCharity/FFC-EX-theeverythingproject.org/blob/main/docs/decisions/0001-cutover-readiness.md) |

## Conditions before the window

- **C1. Site parity signed off.** Fix the restore list from the 2026-10-07 review, then get sign-off on #62 and #63.
- **C2. Move the zone off Bluehost before anything else changes.**
  - Export the **complete** zone from Bluehost (cPanel Zone Editor export), not just the names in the appendix, which are a sample. Recreate every record in Cloudflare as DNS-only (grey cloud), at TTL 300, except Bluehost's own NS and SOA. Then reconcile the export against Cloudflare record by record before changing the delegation.
  - Change the nameservers at the registrar.
  - Wait until `dig NS newheightseducation.org` returns Cloudflare from several resolvers.
  - Then wait at least another 4 hours before the window. Resolvers may still hold the web records (apex A, `www`, subdomains) they cached from Bluehost at TTL 14400, and the new TTL 300 only applies once those copies expire.
  - Bluehost's nameserver TTL is 21600 (6 hours), and the `.org` delegation can take up to 48 hours.
  - Tracked on [FFC-Cloudflare-Automation#1342](https://github.com/FreeForCharity/FFC-Cloudflare-Automation/issues/1342).
- **C3. Fix mail authentication during the zone move.**
  - Replace the two SPF records with one, for example `v=spf1 include:_spf.google.com ~all`. NHEG's Workspace admin confirms the senders.
  - Add Workspace DKIM (`google._domainkey`) and DMARC at `p=none`.
  - Leave MX unchanged.
  - Check by sending a test message to and from an `@newheightseducation.org` address.
- **C4. Stage the CNAME with authorization** ([#65](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/65)).
  - `public/CNAME`, `siteConfig.url = 'https://newheightseducation.org'`, and both `security.txt` Canonical lines.
  - CI green; the PR held, not merged.
- **C5. A repo admin is available during the window to bind the domain,** or grants a role that can, confirmed beforehand with a no-op write.
- **C6. Plan the subdomain redirects.** In Cloudflare, proxy `school`, `publications` and `radio` and add the three Single Redirect rules from `docs/cutover/redirects.md`, as 302 until sign-off. These hosts don't point at Pages, so proxying them doesn't affect the apex certificate.
- **C7. Record authorization and the window time on #68.**

## Window runbook

1. Merge the held CNAME PR, and wait for "Deploy to GitHub Pages" to succeed. The github.io URL is degraded from here, and the apex still shows WordPress.
2. In Cloudflare (DNS-only, TTL 300), recording the old values first:
   - apex A records `185.199.108.153`, `185.199.109.153`, `185.199.110.153` and `185.199.111.153`, replacing `50.87.236.5`;
   - `www` as a CNAME to `freeforcharity.github.io.`;
   - `school`, `publications` and `radio` proxied, with their redirect rules (C6);
   - MX and TXT untouched.
3. Check the answers from `1.1.1.1` and `8.8.8.8`:
   - apex A returns only the four GitHub IPs;
   - no AAAA;
   - `www` returns the CNAME.
4. Bind: `gh api -X PUT repos/FreeForCharity/FFC-EX-newheightseducation.org/pages -f cname=newheightseducation.org` (admin).
5. Poll `.https_certificate.state` until it's `approved` and `.https_certificate.domains` lists both names. Then enforce HTTPS.
6. Check:
   - the apex returns 200, and a `/_next/static/` asset returns 200;
   - `http://` redirects to `https://`, and `www` redirects to the apex;
   - the three subdomains redirect with their paths;
   - a crawl of all routes finds no failed requests.
7. Dispatch the post-deploy smoke test.

If the certificate stalls, follow TEP's certificate recovery: re-bind at most twice, and roll back if the certificate isn't approved within 60 minutes. With no HSTS on live, visitors see a warning they can click through rather than a hard failure.

## Rollback

- Point the apex A record back to `50.87.236.5`, and `www` back to the CNAME to the apex.
- Turn off the three subdomain redirect rules, and return `school`, `publications` and `radio` to DNS-only A records at `50.87.236.5`. Check each host and one deep link on each.
- At TTL 300, most visitors are back within about 5 minutes.
- The subdomain rules use **302 (temporary)** during the window, so browsers don't cache them past a rollback. They switch to 301 only after sign-off.
- Leave the Pages binding as it is.
- This works **only while Bluehost hosting is still active,** so don't cancel Bluehost until the new site has been stable for an agreed period.

## Deferred until after launch

- Cancelling Bluehost hosting: only after C2 and C3, a stable period, and confirmation that nothing else is hosted there. Form submissions in the WordPress admin should be exported first (`docs/open-questions.md`, item 3).
- Removing `mail.`, `ftp.` and `autodiscover.`, unless NHEG uses them.
- Search Console for the new origin.
- Updating github.io references in the README and in issue bodies.

## Appendix: verified queries

DNS was captured on 2026-10-07 between 11:00 and 11:15 UTC from the maintainer's machine, with `main` at `64e90cf`.

**Q1, Q2: NS and SOA**

```console
$ dig +noall +answer newheightseducation.org NS
newheightseducation.org. 21600	IN	NS	ns2.bluehost.com.
newheightseducation.org. 21600	IN	NS	ns1.bluehost.com.
$ dig +noall +answer newheightseducation.org SOA
newheightseducation.org. 21600	IN	SOA	ns1.bluehost.com. root.box2420.bluehost.com. 2025011000 86400 7200 3600000 300
```

**Q3: apex A, AAAA and CAA, including direct from Bluehost**

```console
$ dig +noall +answer newheightseducation.org A
newheightseducation.org. 13918	IN	A	50.87.236.5
$ dig +noall +answer @ns1.bluehost.com newheightseducation.org A
newheightseducation.org. 14400	IN	A	50.87.236.5
$ dig +noall +answer newheightseducation.org AAAA
$ dig +noall +answer newheightseducation.org CAA
```

**Q4: hosts**

```console
www.newheightseducation.org. 14400 IN	CNAME	newheightseducation.org.
school.newheightseducation.org.	14012 IN A	50.87.236.5
publications.newheightseducation.org. 14400 IN A 50.87.236.5
radio.newheightseducation.org. 14400 IN	A	50.87.236.5
mail.newheightseducation.org. 14400 IN	CNAME	newheightseducation.org.
ftp.newheightseducation.org. 14400 IN	CNAME	newheightseducation.org.
autodiscover.newheightseducation.org. 14400 IN A 50.87.236.5
```

None of these hosts has an AAAA record.

**Q5: MX**

```console
newheightseducation.org. 3600	IN	MX	1 aspmx.l.google.com.
newheightseducation.org. 3600	IN	MX	5 alt1.aspmx.l.google.com.
newheightseducation.org. 3600	IN	MX	5 alt2.aspmx.l.google.com.
newheightseducation.org. 3600	IN	MX	10 alt3.aspmx.l.google.com.
newheightseducation.org. 3600	IN	MX	10 alt4.aspmx.l.google.com.
```

**Q6: TXT**

```console
newheightseducation.org. 14400	IN	TXT	"v=spf1 +a +mx +ip4:50.87.236.5 +ip4:74.220.219.149 +include:bluehost.com ~all"
newheightseducation.org. 14400	IN	TXT	"_globalsign-domain-verification=FC6t_NoHOpI8mVVvt5otC-lGBup1YkuoCuJlIsDIN5"
newheightseducation.org. 14400	IN	TXT	"v=spf1 +a +mx +ip4:50.87.236.5 +include:bluehost.com ~all"
```

**Q7: DKIM and DMARC.** Both return nothing.

```console
$ dig +noall +answer _dmarc.newheightseducation.org TXT
$ dig +noall +answer google._domainkey.newheightseducation.org TXT
```

**Q9: HTTP and HSTS** (2026-10-07T11:13Z)

```console
$ curl -sI https://newheightseducation.org/ | grep -iE "^HTTP|strict-transport|server"
HTTP/2 200
server: Apache
$ curl -sI http://newheightseducation.org/ | grep -iE "^HTTP|location"
HTTP/1.1 301 Moved Permanently
Location: https://newheightseducation.org/
$ curl -sI https://www.newheightseducation.org/ | grep -iE "^HTTP|location|strict"
HTTP/2 301
location: https://newheightseducation.org/
```

Neither response carries a `Strict-Transport-Security` header.

**Q10: registrar**: Bluehost Inc., with a registry expiry date of 2027-01-09T22:57:56Z (`whois`, 2026-10-06).

**Q11, Q12: Pages and access**

```console
$ gh api repos/FreeForCharity/FFC-EX-newheightseducation.org/pages --jq '{cname,build_type,https_enforced}'
{"build_type":"workflow","cname":null,"https_enforced":true}
$ gh api repos/FreeForCharity/FFC-EX-newheightseducation.org/collaborators --jq '.[]|"\(.login) \(.role_name)"'
phoganuci write
clarkemoyer admin
Christo6 admin
Tyler-Carlotto admin
```

**Q13: repo state**

```console
$ ls public/CNAME
ls: public/CNAME: No such file or directory
$ grep -n "url: '" src/lib/site.config.ts
167:  url: 'https://freeforcharity.github.io',
$ grep -n Canonical public/.well-known/security.txt
18:Canonical: https://freeforcharity.github.io/FFC-EX-newheightseducation.org/.well-known/security.txt
19:Canonical: https://freeforcharity.github.io/FFC-EX-newheightseducation.org/security.txt
```

**Q14: legacy URLs.** See [#116](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/pull/116), [#118](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/pull/118) and `docs/cutover/redirects.md`. All stub targets were checked against the live site's redirects on 2026-10-06.
