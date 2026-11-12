# The early Devpost entry: what to paste, field by field

For Joshua (his 5:15 PM message, §3: "the early Devpost entry (draft me the text and the form's minimum now)"). Drafted by
Claude, Thu Nov 5 2026. You do every login and every click on Devpost; nothing here was typed into Devpost by Claude.

**Every word you paste comes from `docs/devpost.md`**, whose numbers and quoted lines each have a row in `docs/claims.md`
that `pnpm check` re-reads. This page only says which part goes in which field, so there's one text to keep true, not two.
If you change a line, change it in `docs/devpost.md` and copy it again.

## What I could read live, and what I couldn't (Thu Nov 5, about 5:30 PM PST, GET only, not signed in)

- **Read live** on https://paypalaihackathon.devpost.com: the deadline (**Nov 12, 2026 @ 12:00pm PST**), "What to submit"
  on the overview, and the Rules (§1 dates, §4 submission requirements, §5 submission modifications, §8 prizes).
- **Read live** on a published Devpost project page (devpost.com/software): the page's sections, which come from the form.
  They are Inspiration, What it does, How we built it, Challenges we ran into, Accomplishments that we're proud of, What we
  learned, What's next for <name>, Built With, and Try it out.
- **Not seen:** the "Enter a Submission" form itself. It needs a signed-in, registered account
  (`/manage/submissions` shows "Register for this hackathon." when signed out). This hackathon's own questions (sponsor
  opt-ins, links, anything else) are on that form only. When you open it, check it against the list below and tell our
  lead agent what differs, and it gets folded in here.
- The project gallery isn't published yet, so no other entry from this hackathon could be checked.

## Why tonight, and why the text matters most

- The organizers' newest update ("Submission checklist: it's go time!", read live Thu Nov 5): "Submit today to still get
  an early eligibility check." The update before it: "Submit by Thursday, Nov 5 and our review team will check your
  project for eligibility early and flag anything to fix. You can keep editing until the deadline." The early check
  will likely flag the repo, which isn't public yet (Stage One checks "a public repo with an open source license"); that
  is expected, and it goes public about Nov 11.
- The Rules, Testing section, read live: "Judges are not required to test the Project and may choose to judge based solely on the text description, images, and video provided in the Submission."
  So the text in `docs/devpost.md` is what most judges score. Its headings are the Rules' five criteria, word for word.
- The gallery isn't published ("The hackathon managers haven't published this gallery yet"), so an early entry isn't
  shown to other entrants yet.

## When each field can change

Rules §5, read live: "Prior to the end of the Submission Period, you may save draft versions of your submission on
Devpost... Once the Submission Period has ended, you may not make any changes or alterations to your Submission."
So **every field below can change until Thu Nov 12, 2026, 12:00 PM PST**, and **none can after**. After that, only
material Devpost and PayPal ask you to remove (a third party's mark, personal information) may change.
That's why the early entry can carry placeholders for the video and the repo today.

The organizers' checklist adds two things that bind after the deadline: "Keep your demo, test credentials, and any
trials or credits active until winners are announced on Dec 21." and "After the deadline, submissions are locked.
Don't edit your repo, video, or linked materials until after the winner announcement." So **the repo and the live site
freeze from Nov 12 to Dec 21** too, and the AG Studio key and the API credits must last until Dec 21.

## The minimum to get the entry in today

1. **Join hackathon** on the overview page (registers your Devpost account for this hackathon).
2. **Enter a submission**: this starts a project.
3. Fill **Project name** and **Elevator pitch** (below), then save. That's a draft in your portfolio.
4. Add Lucas: in the project's team section, send the team invite link. He opens it signed in to his own Devpost account,
   having joined the hackathon too (FAQ, read live).
5. Paste the rest when you're ready, field by field, and submit before Nov 12, 12:00 PM PST. Keep editing until then.

## Field by field

| Form field (Devpost's usual name) | Paste this | Can change until the deadline? |
|---|---|---|
| Project name | `Gilded Goose` | Yes |
| Elevator pitch (one line) | The **Elevator pitch** line at the top of `docs/devpost.md` (it says what Goose is; R's text-only judge marked the old one, the three promises alone, as never saying it) | Yes |
| Thumbnail | The site's share card, `web/public/og/share.png` (our own art, made by `scripts/brand-render.ts`; no third-party image) | Yes |
| About the project | `docs/devpost.md` from **Judge Goose in 60 seconds** to the end of **Built with** (the line "About the project: paste from here" marks the start; "Not pasted" marks the end) | Yes |
| Built with (tags) | Each item in **Built with** in `docs/devpost.md` as its own tag | Yes |
| Try it out (links) | The live site, `https://gilded-goose.onrender.com`; the public repo once it's public (Nov 11) | Yes |
| Video demo link | Placeholder until the YouTube link exists (Wed Nov 11). The video must be public on YouTube and under 3 minutes | Yes |
| Image gallery | The four stills in **Open before submit** in `docs/devpost.md` | Yes |
| Team members | Lucas, by the team invite link | Yes |
| This hackathon's own questions | Seen only after you sign in. Likely: the repo URL, the demo URL or run instructions, the tools used, and the sponsor prizes you opt into. The answers are in `docs/devpost.md` (**Try it**, **Code**, **How we built it**, **AI tools used (required by the rules)**) | Yes |
| Agree to the Official Rules | Your own click | Yes, until you submit |

## Testing instructions, if the form asks for them

Paste the **Try this first** paragraph and steps 1 to 3 from **Judge Goose in 60 seconds**, then the line "No key is
needed to judge Goose" (row `c-judging-free`). Joshua said yes (6:40 PM): he makes one dedicated PayPal sandbox buyer
(never his own login), and **you type its email and password yourself, only into the testing-instructions field**, never
in the public text, the repo, the site or chat. Step 2 tells judges the testing instructions say how to get the login: the login itself if the field is
private, how to ask for it if not.

Not seen yet: that field's exact name, its step on the form, and whether Devpost shows it to judges and managers only.
The form needs your signed-in view. The Rules (Testing) say only "If Entrant's website is private, Entrant must include
login credentials in its testing instructions." When you open the form, check the field's label for words like
"judges only" or "private". If it doesn't say so, don't paste the login there: tell the Lead, who asks the organizers
first.

## The gallery image

Devpost's gallery is seven 3:2 images (2400x1600), all of the white site, shot by one script,
`node scripts/gallery-shots.ts <baseUrl> <outdir>`, into `docs/launch/gallery/`. Their list and captions are in
`docs/devpost.md` ("Open before submit"). Frames 1, 2 and 4 were re-shot from the live site (PayPal's sandbox) on Nov 11;
3, 5 and 6 are from a local build with PayPal faked (PAYMENT=fake). A shop run is a `POST /api/runs` and a trick round
posts too, so against live the script skips the two run frames unless `GALLERY_LIVE_RUNS=1`, skips the set-aside frame
unless `GALLERY_LIVE_TRICK=1`, and always skips the receipt (it needs a tap through to the receipt). The set-aside frame
is `docs/launch/gallery/3-set-aside.png` (row `c-gallery-aside`). The receipt frame waits for Joshua's recorded sandbox
payment.

## What the Rules require before the deadline (read live, §4)

- A text description of the features and functionality: **About the project**.
- A functional demo judges can run: the hosted URL above, or the README's run steps.
- The tools used, and how: **AI tools used (required by the rules)** in `docs/devpost.md`.
- A public code repository on GitHub, GitLab or Bitbucket, open source, with its license visible at the top of the repo
  page (About). Joshua makes the repo public about Nov 11.
- A demo video under three minutes, public on YouTube, showing it working on the device it was built for, with no
  third-party trademarks or music without permission.
- Everything in English.

## Prizes you can opt into (§8, read live)

One project wins at most one Grand Prize (1st, 2nd or 3rd) or one Honorable Mention, plus one Sponsor Prize. The
organizers' checklist: "Sponsor tools selected on the form if you're going for a sponsor prize". Opt into each sponsor
prize whose tool truly runs on the live site. AG Grid (AG Studio, AG Grid, AG Charts), Channel3 and Render do today.
Don't tick any other sponsor tonight; one more is being checked, and the Lead will say if it qualifies.

## What the organizers said in the two forum threads (read live, Thu Nov 5, GET only)

- **"API Key for Judges"**, answered by Janet Fang (MANAGER): "Judges won't have their own Anthropic key, so please make
  sure they can test your project without one. The easiest option is a hosted demo URL, which keeps your key on your own
  server." She also wrote: "Please don't commit a live key to your public repository." and "Your project should stay
  available for testing, free of charge, until the Judging Period ends on December 15, 2026." Goose already works this
  way: the hosted site holds the keys, and the README's run steps need none of ours.
- **"Are PayPal's own checkout and AI assistant names OK on screen in the demo video?"** No answer yet: 0 comments. A
  newer thread, "Product name display concerns", asks a close question and has no answer either. Until an organizer
  answers, the video shows PayPal's own checkout page as it is (PayPal is the host), and names no other brand.
