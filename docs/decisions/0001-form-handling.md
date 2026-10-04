# 0001: How the site's forms work after the move off WordPress

- **Status:** Proposed, 2026-10-04. Awaiting the site owners' decision, recorded below. Tracked on [#53: forms per the NHEG ruling](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/53).
- **Proposal:** Before launch, replace each form with a Google Form owned by NHEG's own Google Workspace account, linked or embedded in place. The current "This form has moved to email" block is an interim measure only, and is not the launch state.
- **Why it needs the owners:** Several forms collect children's names, birthdays and home addresses, and the volunteer form asks for a driver's license number and takes photo and résumé uploads. Where that information lands, and who can read it, is NHEG's decision.

## Background

The live site runs Caldera Forms on WordPress. Where each form's submissions go (stored entries, email recipients) is configured in the WordPress admin and is not visible from the public site; the live archive records that gap ([`README.md`](../live-archive/2026-10-02/README.md)), and the site owners should confirm it before Bluehost lapses. GitHub Pages serves static files only, so nothing on the new site can receive a submission. The conversion in [#86](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/pull/86) therefore replaced every form with this block on 352 places across 224 pages:

> This form has moved to email. We read every message. info@newheightseducation.org

The block drops each form's questions, so a visitor no longer knows what NHEG needs. The generic subject line also makes the emails hard to sort. A form that collects a child's details by plain email is a step down from what the live site offers.

## Inventory

From the live capture in [`docs/live-archive/2026-10-02/forms.json`](../live-archive/2026-10-02/forms.json). Search, login, cart and comment forms are handled elsewhere: [#49](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/49), [#56](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/56), [#54](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/54) and [#45](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/45).

| Form                                               | Page                                                                                                                                                                                           | Collects                                                                                                                                                                                              | Sensitive                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Contact                                            | `/contact-us/`, `/school/contact-us/`                                                                                                                                                          | name, email, message                                                                                                                                                                                  | no                                                                 |
| Radio contact and sign-up                          | `/radio/`                                                                                                                                                                                      | name, email, message, and a "Sign Up Now" mailing-list opt-in                                                                                                                                         | no                                                                 |
| Tutoring request                                   | `/nheg-educational-programs/nheg-tutoring-program/nheg-tutoring-request-form/`                                                                                                                 | name, student birthday, phone, email, home address, 17 program checkboxes, grade, school, father's and mother's names, low-income status, disabilities, subjects, interests, willingness to volunteer | **child's birthday, address, school, disabilities, family income** |
| First Book access                                  | `/first-book-access-request/`                                                                                                                                                                  | name, email, student grade, state                                                                                                                                                                     | child's grade                                                      |
| Volunteer application                              | `/volunteer-with-nheg/volunteer-form/`                                                                                                                                                         | name, contact, home address, position, biography, driver's license number (text), photo and résumé (file uploads), 3 references                                                                       | **ID number, uploads, references**                                 |
| Learning Annex enrollment (2 forms)                | `/school/`, `/school/about/`, `/school/about/nheg-educational-department-staff/`                                                                                                               | student name, grade, birthday, schedule conflict, parent name, phone, email, address                                                                                                                  | **child's name, birthday, address**                                |
| Scholarship interest                               | `/school/students/nheg-student-resources/college-and-post-secondary-options/`, `/school/students/scholarship-opportunities/`, `/school/students/scholarship-opportunities/scholarship-search/` | student name, age, birthday, religious background, parents, contact, address                                                                                                                          | **child's details, religion**                                      |
| Yearbook                                           | `/school/students/nheg-yearbook/`                                                                                                                                                              | name, email, phone, address                                                                                                                                                                           | home address                                                       |
| Student Advisory Group, Student Leadership Council | `/school/about/nheg-groups/student-advisory-group/`, `/school/about/nheg-groups/student-leadership-council/`                                                                                   | student's name, phone, email                                                                                                                                                                          | **student's contact details**                                      |
| Recognition Day RSVP                               | `/events/recognition-day/`                                                                                                                                                                     | name, email                                                                                                                                                                                           | no                                                                 |
| EdGuide subscribe                                  | `/who-we-are/nheg-edguide/`                                                                                                                                                                    | name, email                                                                                                                                                                                           | no                                                                 |

That is 14 Caldera forms in total; the three contact forms share one definition, but the radio copy adds the mailing-list opt-in, so it is listed separately. The live site also has two PayPal buttons, which are covered by the giving ruling on [#55](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/55).

## Options

### A. Generic mailto (today)

- **Data:** each message lands in the `info@` inbox (Google Workspace, NHEG-owned). The visitor's own mail provider also keeps a copy.
- **Visitor:** has to remember what to send, and needs a mail app set up. On a shared or school computer, often none is.
- **Spam:** none from the site; the address was already public.
- **Setup and cost:** none.
- **Verdict:** loses every question. Unsuitable for launch.

### B. Mailto per form, with a subject and the questions pre-filled in the body

- **Data:** the same as A.
- **Visitor:** sees the questions, but answers them in free text. Uploads become manual attachments.
- **Setup and cost:** none. It is a script over the fragments, driven by the inventory above.
- **Weaknesses:**
  - Answers are unstructured, with no required fields and no validation.
  - Children's and ID details travel by ordinary email.
  - It still needs a mail app.
- **Verdict:** an acceptable interim measure. A weak launch state for the sensitive forms.

### C. Google Forms in NHEG's own Workspace (recommended)

- **Data:** responses are stored in the form itself, which NHEG owns, in the Workspace that already runs its mail (MX is `aspmx.l.google.com`). A linked Google Sheet is optional, and file uploads go to the form owner's Google Drive. FFC never holds the data. NHEG controls sharing, retention and who is notified of each response.
- **Visitor:** a real form with required fields, which works without a mail app. Google publishes an accessibility conformance report for Forms; check the finished forms with a screen reader before launch.
- **Uploads:** file upload questions require the respondent to sign in to Google. For the volunteer form, either accept that or ask for documents after first contact.
- **Spam:** Google's own filtering. A form can also limit one response per signed-in user.
- **Site changes:** link each form ("Open the enrollment form") or embed it in an iframe. `docs.google.com` is already in the CSP `frame-src`, so no new hosts are needed.
- **Setup and cost:** free. NHEG (or FFC with NHEG's access) builds 14 forms from the inventory, roughly a few hours.
- **Verdict:** the best fit. It keeps children's data inside NHEG's account and restores structured intake.

### D. Microsoft Forms (fleet precedent)

- **Precedent:** FFC sites such as slopestohope.org and mitchellnchistory.org use Microsoft Forms, and `forms.office.com` is already in the CSP.
- **Data:** those forms live in **FFC's** Microsoft 365 tenant, so FFC would hold NHEG's applicants' and children's data. NHEG has no Microsoft 365 account of its own.
- **Verdict:** the precedent is a good one, but for NHEG it puts the data with the wrong owner. Prefer C unless NHEG wants FFC to hold the data.

### E. A paid form service (Formspree, Tally, Jotform)

- **Data:** a third party holds the data. Free tiers limit features such as file uploads or monthly submissions, and paid plans cost money every month. A plain link to the hosted form needs no site change; an embed adds the host to the CSP `frame-src`, and a direct form post adds it to `form-action`.
- **Verdict:** no advantage over C for this site, plus cost and another vendor.

## Recommendation

1. **Now:** keep the interim block. Optionally upgrade it to Option B for the forms that collect no student details (contact, Recognition Day RSVP, EdGuide subscribe) so the questions are not lost. The student group forms stay on the interim block unless the owners confirm applicants are adults and accept email intake.
2. **Before launch:** move to Option C.
   - NHEG creates the Google Forms, or grants an FFC volunteer access to build them in NHEG's Workspace.
   - The site then links or embeds each one, with a test that every page in the inventory shows its replacement.
3. **Volunteer form:** decide whether to collect the driver's license number and résumé at first contact at all. Asking for them after an initial conversation avoids holding ID numbers and documents for people who never proceed.

## Site owner decision

_To be completed by NHEG and FFC. This record proposes; the owners decide._

- [ ] Option chosen (A, B, C, D or E), and by whom:
- [ ] Who owns the form account and its responses:
- [ ] Who receives the notifications:
- [ ] Volunteer form: are ID and résumé collected up front?
- [ ] Date decided:
