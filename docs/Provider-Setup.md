# Provider Setup

**Audience:** you have SCP installed and running, and you need to connect
one or more social providers so you can actually publish something.

**Time per provider:** 15–30 minutes for LinkedIn and X, 30–60 for Meta
(because of App Review), 10 for Reddit (no review needed), 5 for Discord
bot delivery.

This guide covers the OAuth app creation dance each provider wants you to
do on their developer portal before SCP can connect. SCP's side is
straightforward — it's the providers that make this annoying.

---

## General shape for every provider

Every provider connection looks roughly the same:

1. **Create an OAuth app** at the provider's developer portal.
2. **Set the redirect URI** to the callback URL SCP shows in its
   Connections tab (usually `http://localhost:3000/integrations/<provider>/callback`
   for local dev, or your production web URL in production).
3. **Grant the specific scopes** SCP needs (listed per-provider below).
4. **Copy the Client ID / Secret** into SCP's Settings → Integrations tab.
5. **Click Connect on the Connections page** to complete OAuth.

Where each provider differs: what the portal calls things, what scopes
they demand, whether you need App Review, and how tokens expire.

---

## LinkedIn

**Difficulty:** easy.
**Time:** 15 min.
**Gatekeeping:** personal-scope `w_member_social` works without review.

### Create the app

1. Go to <https://www.linkedin.com/developers/apps>.
2. Click **Create app**. Give it a name like "Social Control Plane — yourname",
   associate it with any LinkedIn Page you own (required by LinkedIn, but
   the Page doesn't have to be where you post).
3. Agree to the API Terms.

### Configure Auth

1. Open the app → **Auth** tab.
2. Under **OAuth 2.0 settings**, add an **Authorized redirect URL**:
   - Dev: `http://localhost:3000/integrations/linkedin/callback`
   - Prod: `https://your-scp-domain/integrations/linkedin/callback`
3. **OAuth 2.0 scopes**: you want these three listed under "Default scopes":
   - `openid`
   - `profile`
   - `w_member_social`

### Add the required products

LinkedIn gates scopes behind "products" you have to request:

1. Open the app → **Products** tab.
2. Request **Share on LinkedIn**. Usually auto-approved.
3. Request **Sign In with LinkedIn using OpenID Connect**. Usually auto-approved.

Both show up under Products after a minute or two. If one is stuck in
"Under review" for >24h, LinkedIn support is hit-or-miss — re-creating
the app sometimes helps.

### Plug into SCP

1. Copy **Client ID** and **Client Secret** from the app's Auth tab.
2. Either paste them into SCP Settings → Integrations → LinkedIn, or
   set the env fallback in `.env`:
   ```
   LINKEDIN_CLIENT_ID=...
   LINKEDIN_CLIENT_SECRET=...
   LINKEDIN_REDIRECT_URI=http://localhost:3000/integrations/linkedin/callback
   ```
   Env values are a fallback for bootstrap; the DB-stored copy takes
   precedence once you connect via the UI.
3. Go to **Connections** → **Add Connection** → **LinkedIn** → complete
   OAuth. You'll be redirected to LinkedIn, approve, and bounced back.

### Token lifetime

LinkedIn tokens expire after **60 days**. SCP's proactive refresh will
try to refresh them before expiry. If refresh fails, the Connections
page will show a yellow health indicator for that connection — click
**Refresh** to re-authorize, or re-run the full OAuth flow.

---

## X (Twitter)

**Difficulty:** medium.
**Time:** 20 min.
**Gatekeeping:** Free tier is fine for basic publishing; the app just
needs the right scopes.

### Create the app

1. Go to <https://developer.x.com/en/portal/dashboard>.
2. Create a new **Project** (if you don't already have one).
3. Inside the project, create an **App**.

### Configure OAuth 2.0

1. App → **Settings** → **User authentication settings** → **Set up**.
2. **Type of App**: "Web App, Automated App or Bot".
3. **App permissions**: Read **and Write** (not Read+Write+DM unless you
   need DMs).
4. **Callback URI**: `http://localhost:3000/integrations/x/callback` (dev)
   or your production equivalent.
5. **Website URL**: whatever — your homepage or SCP domain.

### Scopes (CRITICAL — don't skip `media.write`)

Under **OAuth 2.0 Scopes**, enable all of these:

- `tweet.read`
- `tweet.write`
- `users.read`
- `offline.access` (so tokens can refresh)
- **`media.write`** ⚠️ **REQUIRED FOR IMAGE UPLOADS**

Without `media.write`, text-only posts will work but any post with images
will fail with a permission error **that doesn't always mention media.write
by name**. It's the single most common X integration bug — if you see
weird 400s on multi-image posts, check this first.

### Plug into SCP

1. Copy the **Client ID** and **Client Secret** from the app's Keys and
   tokens tab. (Note: the newer "OAuth 2.0 Client ID" is what you want,
   NOT the old consumer key.)
2. SCP Settings → Integrations → X, paste them. Or `.env`:
   ```
   X_API_KEY=...
   X_API_SECRET=...
   X_REDIRECT_URI=http://localhost:3000/integrations/x/callback
   ```
3. Connections → Add → X → OAuth.

### X media upload gotcha (for future video support)

X migrated `/2/media/upload` in 2025. Images use one-shot multipart
(SCP does this correctly). Video and GIF use dedicated chunked endpoints
`/2/media/upload/initialize`, `/{media_id}/append`, `/{media_id}/finalize`.
**SCP's `uploadLegacyMedia()` for video is not yet migrated** to the
new endpoints — it will fail. See the warning comment in
`packages/providers/src/index.ts` if you need video publishing.

### Token lifetime

X OAuth 2.0 access tokens expire after **2 hours**. The refresh token
is rotating — SCP handles refresh automatically via `offline.access`
scope. If you see auth errors, ensure `offline.access` is in your
OAuth 2.0 scopes list.

---

## Facebook + Instagram (Meta)

**Difficulty:** hard.
**Time:** 30–60 min for personal pages; days or weeks for App Review
on new brands.
**Gatekeeping:** **App Review is required** for `pages_manage_posts`
on any Page you didn't create or aren't admin of.

Facebook and Instagram share one app because Meta owns both.

### Create the Meta app

1. Go to <https://developers.facebook.com/apps>.
2. Create a new app. Type: **Business**.
3. Name it. Associate with a Business Manager if you have one.

### Add products

Inside the app:

1. Add **Facebook Login for Business** (the current recommended product;
   the old "Facebook Login" still works but is legacy).
2. Add **Instagram Graph API**.
3. Add **Pages API** (may be bundled under Facebook Login).

### Configure OAuth redirect

Facebook Login → Settings → **Valid OAuth Redirect URIs**:
- `http://localhost:3000/integrations/facebook/callback`
- `http://localhost:3000/integrations/instagram/callback`
- (plus your production URLs)

### Required permissions (the review-gated ones)

SCP needs these permissions on the Page it's posting to:

- **`pages_show_list`** — list Pages the user manages. Usually doesn't
  need review.
- **`pages_manage_posts`** — create posts on a Page. **Needs App
  Review** for any Page the developer isn't the admin of.
- **`pages_read_engagement`** — read Page metadata. **Needs App Review**.
- **`instagram_basic`** — list Instagram Business accounts. Needs review.
- **`instagram_content_publish`** — publish to Instagram Business.
  Needs review.

For **development mode** (before review), you can test against Pages
the app developer is an admin of. That's enough for local dev and
for publishing to your own Page.

For **production** (publishing to client Pages as a service), you need
to submit for App Review with:
- A test user credential
- A screen recording showing each permission being used
- A privacy policy URL
- A business verification

This process can take 1–4 weeks. If you're just publishing to your own
pages, skip the review and stay in dev mode forever.

### Direct-token flow (shortcut)

SCP supports a **direct token paste** flow on the Connections page for
Facebook/Instagram, which is faster than the OAuth dance for initial
testing. Steps:

1. Go to <https://developers.facebook.com/tools/explorer>.
2. Select your app.
3. Generate an access token with the permissions above.
4. Extend it to a long-lived token via the Debugger tool.
5. Paste it into SCP Connections → Add → Facebook → Direct Token.
6. Enter the Page ID if the token has access to multiple Pages.

For production, replace this with the full OAuth flow so SCP can
refresh tokens automatically.

### Plug into SCP

```
FACEBOOK_APP_ID=...
FACEBOOK_APP_SECRET=...
FACEBOOK_REDIRECT_URI=http://localhost:3000/integrations/facebook/callback
INSTAGRAM_REDIRECT_URI=http://localhost:3000/integrations/instagram/callback
```

### Token lifetime

Page access tokens **don't expire** as long as the user token they were
derived from is still valid. User tokens last 60 days (long-lived) or
1 hour (short-lived). SCP tries to refresh. If a Page token stops
working, the underlying user token has probably expired.

---

## Reddit

**Difficulty:** easy.
**Time:** 10 min.
**Gatekeeping:** none — Reddit's script app type works without review.

### Create the app

1. Go to <https://www.reddit.com/prefs/apps>.
2. Scroll to the bottom → **create another app**.
3. Type: **script** (not web app — script is for bots owned by a
   single Reddit account).
4. Name, description, about URL — whatever.
5. **Redirect URI**: `http://localhost:3000/integrations/reddit/callback`
   (required field even for script type).
6. Create.

You'll get a **Client ID** (the random string under the app name) and
a **Client Secret** (labeled "secret").

### Plug into SCP

Reddit on SCP is driven by the scripts in `scripts/engage-reddit-scraper.py`
and `scripts/reddit-join-subs.py`, not the OAuth Connections flow. Set
these env vars:

```
REDDIT_CLIENT_ID=<the string under your app name>
REDDIT_CLIENT_SECRET=<the secret string>
REDDIT_USERNAME=<your reddit username, no u/ prefix>
REDDIT_PASSWORD=<your reddit account password>
REDDIT_USER_AGENT=scp-engage/1.0 (yourname@example.com)
```

**IMPORTANT: Reddit bans generic user agents.** The UA must be
identifiable per [Reddit API rules](https://github.com/reddit-archive/reddit/wiki/API):
format it as `<app-name>/<version> (<contact>)`. SCP will still
function if you leave it as the placeholder, but Reddit may rate-limit
you to 1 request per second or ban the app entirely.

### Optional: target subs list

The `reddit-join-subs.py` script joins a default list of fishing-related
subreddits. Override it via env:

```
REDDIT_TARGET_SUBS=Fishing,saltwaterfishing,kayakfishing
```

### Token lifetime

Reddit script app credentials don't expire — username/password auth is
persistent. Rotate the password if compromised.

---

## Discord (bot delivery)

**Difficulty:** easy.
**Time:** 5 min.
**Gatekeeping:** none.

SCP uses Discord as a **delivery channel** for digests and alerts, not
as a publishing target. You create a Discord bot, add it to your server,
and SCP posts messages to channels you specify.

### Create the bot

1. Go to <https://discord.com/developers/applications>.
2. Click **New Application**. Name it (e.g. "SCP Ops").
3. Left sidebar → **Bot** → **Add Bot**.
4. Under **Privileged Gateway Intents**, you probably don't need
   anything — SCP only posts, doesn't read.
5. **Copy Token** (shown as a long string). Stash it safely — you can
   only view it once per generation.

### Invite the bot to your server

1. Sidebar → **OAuth2** → **URL Generator**.
2. Scopes: **bot** and **applications.commands**.
3. Bot permissions: **Send Messages**, **Embed Links**, **Attach Files**,
   **Read Message History**.
4. Copy the generated URL, open it in your browser, pick a server, Authorize.

### Plug into SCP

```
DISCORD_BOT_TOKEN=<the bot token from step 5>
```

If you're running multi-agent with per-agent delivery, you can have
multiple bots and pick one per delivery context:

```
DISCORD_BOT_TOKEN=<shared/default bot>
DISCORD_BOT_TOKEN_MYAGENT=<agent-specific bot>
```

The FB engage runner expects `DISCORD_BOT_TOKEN_<AGENT>` for its specific
agent — rename that env var if your agent has a different id. Safe to
leave blank in single-bot setups (it'll fall through to the shared token).

### Find the channel ID for digest delivery

Right-click the channel you want digests posted to → **Copy Channel ID**
(requires Discord Developer Mode enabled in User Settings → Advanced).

Set it as:

```
META_PAID_THREAD_ID=<channel or thread id>
```

(The name is legacy — it's used for any digest-style delivery target,
not just paid media.)

---

## Validation checklist

After connecting a provider, verify end-to-end:

1. `GET /providers/status` (from Settings → Integrations or via curl)
   should show the connection as `connected`.
2. Compose a test post → Save Draft → Publish Now. Status should flip
   through `queued` → `running` → `succeeded` within 5–15 seconds.
3. Check the provider (the actual LinkedIn feed / X timeline / FB Page)
   for the live post.

If step 2 hangs at `queued`, check `pm2 logs scp-worker --lines 40` for
the actual error. See `docs/Operating-Guide.md` for common failure
diagnoses.

## Next

- `docs/Operating-Guide.md` — daily ops, troubleshooting, logs
- `docs/Agent-Integration.md` — API usage for scripts and bots
