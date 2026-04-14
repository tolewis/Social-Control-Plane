'use client';

import { useState } from 'react';
import { IconLinkedIn, IconFacebook, IconInstagram, IconX } from '../_components/icons';

type DocSection = 'linkedin' | 'facebook' | 'instagram' | 'x' | 'compose' | 'manage' | 'agents' | 'api';

const sections: { id: DocSection; label: string; group: string }[] = [
  { id: 'linkedin', label: 'LinkedIn Setup', group: 'Integration Guides' },
  { id: 'facebook', label: 'Facebook Setup', group: 'Integration Guides' },
  { id: 'instagram', label: 'Instagram Setup', group: 'Integration Guides' },
  { id: 'x', label: 'X (Twitter) Setup', group: 'Integration Guides' },
  { id: 'compose', label: 'Composing Posts', group: 'Using Social Plane' },
  { id: 'manage', label: 'Managing Posts', group: 'Using Social Plane' },
  { id: 'agents', label: 'Working with Agents', group: 'Using Social Plane' },
  { id: 'api', label: 'API Reference', group: 'Developer' },
];

function DocContent({ section }: { section: DocSection }) {
  switch (section) {
    case 'linkedin':
      return (
        <div className="helpDoc">
          <h3>Connect LinkedIn</h3>
          <ol>
            <li>Go to <strong>LinkedIn Developer Portal</strong> and create an app (or use an existing one).</li>
            <li>Under <strong>Auth</strong>, add the OAuth 2.0 redirect URL shown on the Integrations tab.</li>
            <li>Request the products: <strong>Share on LinkedIn</strong> and <strong>Sign In with LinkedIn using OpenID Connect</strong>.</li>
            <li>Required scopes: <code className="mono">openid</code>, <code className="mono">profile</code>, <code className="mono">w_member_social</code>.</li>
            <li>Go to <strong>Settings → Integrations</strong>, find the LinkedIn card, and enter your <strong>Client ID</strong> and <strong>Client Secret</strong>.</li>
            <li>Click <strong>Connect LinkedIn</strong> and authorize the app.</li>
          </ol>
          <p className="helpNote">LinkedIn tokens expire after 60 days. Social Plane will attempt an automatic refresh. If refresh fails, you'll see a yellow health indicator — just click Refresh to re-authorize.</p>
          <p className="helpNote">Env fallback: <code className="mono">LINKEDIN_CLIENT_ID</code> / <code className="mono">LINKEDIN_CLIENT_SECRET</code></p>
        </div>
      );

    case 'facebook':
      return (
        <div className="helpDoc">
          <h3>Connect Facebook</h3>
          <ol>
            <li>Facebook publishing in Social Plane targets a <strong>Facebook Page</strong>, not a personal profile.</li>
            <li>Go to <strong>Meta for Developers</strong> and create or open the Meta app that has access to that Page.</li>
            <li>Required permissions: <code className="mono">pages_show_list</code>, <code className="mono">pages_manage_posts</code>, <code className="mono">pages_read_engagement</code>.</li>
            <li>In <strong>Settings → Integrations</strong>, save your <strong>App ID</strong> and <strong>App Secret</strong>.</li>
            <li>Then go to <strong>Connections</strong> and use the Facebook Meta token flow. Paste a token from Graph API Explorer.</li>
            <li>If the token can access more than one Page, enter the exact <strong>Facebook Page ID</strong> so the correct Page token is stored.</li>
          </ol>
          <p className="helpNote">Current product behavior: Facebook uses direct token connect on the Connections page. The older redirect-URI OAuth instructions are not the main path anymore.</p>
          <p className="helpNote">Use case split: personal Facebook profiles are not supported for publishing. Business Pages are.</p>
          <p className="helpNote">Env fallback: <code className="mono">FACEBOOK_APP_ID</code> / <code className="mono">FACEBOOK_APP_SECRET</code></p>
        </div>
      );

    case 'instagram':
      return (
        <div className="helpDoc">
          <h3>Connect Instagram</h3>
          <ol>
            <li>Instagram publishing requires a <strong>Facebook app</strong> with Instagram Graph API enabled.</li>
            <li>Your Instagram account must be a <strong>Business</strong> or <strong>Creator</strong> account linked to a Facebook Page.</li>
            <li>Under your Facebook app, enable the <strong>Instagram Graph API</strong> product.</li>
            <li>Required permissions: <code className="mono">instagram_basic</code>, <code className="mono">instagram_content_publish</code>, <code className="mono">pages_show_list</code>.</li>
            <li>Go to <strong>Settings → Integrations</strong> and save the shared <strong>Facebook App ID</strong> and <strong>App Secret</strong>.</li>
            <li>Then go to <strong>Connections</strong> and use the Instagram Meta token flow.</li>
            <li>If auto-detection finds the wrong linked account, enter the exact <strong>Instagram Business Account ID</strong>.</li>
          </ol>
          <p className="helpNote">Instagram publishing is container-based: Social Plane creates a media container, waits for processing, then publishes. This is handled automatically.</p>
          <p className="helpNote">Use case split: personal Instagram accounts are not supported. Business and Creator accounts linked to a Facebook Page are supported.</p>
          <p className="helpNote">Env fallback: <code className="mono">FACEBOOK_APP_ID</code> / <code className="mono">FACEBOOK_APP_SECRET</code> (shared with Facebook)</p>
        </div>
      );

    case 'x':
      return (
        <div className="helpDoc">
          <h3>Connect X (Twitter)</h3>
          <ol>
            <li>Go to <strong>console.x.com</strong> and create a project + app.</li>
            <li>Under <strong>User authentication settings</strong>, enable OAuth 2.0.</li>
            <li>Select app type: <strong>Web App, Automated App, or Bot</strong> (Confidential Client).</li>
            <li>Set permissions to <strong>Read and write</strong>.</li>
            <li>Add the redirect URI shown on the Integrations tab to your app's callback URLs.</li>
            <li>Required scopes: <code className="mono">tweet.read</code>, <code className="mono">tweet.write</code>, <code className="mono">users.read</code>, <code className="mono">offline.access</code>, <code className="mono">media.write</code>.</li>
            <li>Go to <strong>Settings → Integrations</strong>, find the X card, and enter your <strong>OAuth 2.0 Client ID</strong> and <strong>Client Secret</strong>.</li>
            <li>Click <strong>Connect X</strong> and authorize the app.</li>
          </ol>
          <p className="helpNote">X uses OAuth 2.0 with PKCE. Access tokens expire after 2 hours, refresh tokens last 6 months. Social Plane refreshes automatically. Reconnect X after scope changes so the new token includes <code className="mono">media.write</code>.</p>
          <p className="helpNote">Env fallback: <code className="mono">X_API_KEY</code> / <code className="mono">X_API_SECRET</code></p>
        </div>
      );

    case 'compose':
      return (
        <div className="helpDoc">
          <h3>Composing Posts</h3>
          <ol>
            <li>Navigate to <strong>Compose</strong> from the sidebar.</li>
            <li>Select a <strong>connection</strong> (the account to post from).</li>
            <li>Choose a <strong>publish mode</strong>:
              <ul>
                <li><strong>Draft (Human)</strong> — saved as draft, requires manual review + publish.</li>
                <li><strong>Draft (Agent)</strong> — agent-created draft, requires human review.</li>
                <li><strong>Direct (Human)</strong> — publishes immediately on submit.</li>
                <li><strong>Direct (Agent)</strong> — agent publishes immediately (use with caution).</li>
              </ul>
            </li>
            <li>Write your content. Character limits are shown for each platform.</li>
            <li>Optionally attach media (images) using the media toolbar.</li>
            <li>Optionally set a <strong>scheduled time</strong> — the post will be queued and published at that time.</li>
            <li>Click <strong>Save Draft</strong> or <strong>Publish</strong>.</li>
          </ol>
        </div>
      );

    case 'manage':
      return (
        <div className="helpDoc">
          <h3>Managing Posts</h3>
          <h4>Queue</h4>
          <p>The <strong>Queue</strong> shows all scheduled and pending posts. You can:</p>
          <ul>
            <li>View scheduled publish times</li>
            <li>Reschedule posts by changing the date/time</li>
            <li>Cancel scheduled posts (reverts to draft)</li>
          </ul>

          <h4>Review</h4>
          <p>The <strong>Review</strong> console shows drafts awaiting approval. This is where human-in-the-loop review happens:</p>
          <ul>
            <li>Read agent-composed drafts</li>
            <li>Edit content before publishing</li>
            <li>Approve and publish, or reject back to draft</li>
          </ul>

          <h4>Calendar</h4>
          <p>The <strong>Calendar</strong> view shows your publishing schedule at a glance — past published posts and upcoming scheduled ones.</p>
        </div>
      );

    case 'agents':
      return (
        <div className="helpDoc">
          <h3>Working with Agents</h3>
          <p>Social Plane is built agent-first. Agents interact via the REST API using API keys.</p>

          <h4>Setting Up an Agent</h4>
          <ol>
            <li>Go to <strong>Settings → Users</strong> and create an operator with role <strong>Agent</strong>.</li>
            <li>Go to <strong>Settings → API Keys</strong> and create a key for that operator.</li>
            <li>Copy the key (shown once) and configure your agent to use it as a Bearer token.</li>
          </ol>

          <h4>Agent Workflow</h4>
          <ol>
            <li>Agent creates a draft via <code className="mono">POST /drafts</code> with <code className="mono">publishMode: "draft-agent"</code>.</li>
            <li>Draft appears in the Review console for human approval.</li>
            <li>Human reviews, optionally edits, then publishes.</li>
            <li>Alternatively, trusted agents can use <code className="mono">publishMode: "direct-agent"</code> to publish without review.</li>
          </ol>

          <h4>Authentication</h4>
          <p>Include the API key as a Bearer token in the Authorization header:</p>
          <code className="helpCode">Authorization: Bearer scp_your_key_here</code>

          <h4>Audit Trail</h4>
          <p>All actions (drafts, publishes, edits) are logged with the operator identity, so you can always see whether a human or agent took each action.</p>
        </div>
      );

    case 'api':
      return (
        <div className="helpDoc">
          <h3>API Reference</h3>
          <p>Base URL: <code className="mono">{typeof window !== 'undefined' ? window.location.origin : ''}/backend</code></p>
          <p>Authentication: Bearer token (login token or API key with <code className="mono">scp_</code> prefix).</p>

          <h4>Connections</h4>
          <table className="table" style={{ fontSize: '0.88rem' }}>
            <thead><tr><th>Method</th><th>Path</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td className="mono">GET</td><td className="mono">/connections</td><td>List all connections</td></tr>
              <tr><td className="mono">POST</td><td className="mono">/connections</td><td>Create connection (manual)</td></tr>
              <tr><td className="mono">DELETE</td><td className="mono">/connections/:id</td><td>Delete connection</td></tr>
              <tr><td className="mono">POST</td><td className="mono">/connections/:id/refresh</td><td>Refresh token</td></tr>
            </tbody>
          </table>

          <h4>Drafts</h4>
          <table className="table" style={{ fontSize: '0.88rem' }}>
            <thead><tr><th>Method</th><th>Path</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td className="mono">GET</td><td className="mono">/drafts</td><td>List all drafts</td></tr>
              <tr><td className="mono">POST</td><td className="mono">/drafts</td><td>Create draft</td></tr>
              <tr><td className="mono">PUT</td><td className="mono">/drafts/:id</td><td>Update draft</td></tr>
              <tr><td className="mono">DELETE</td><td className="mono">/drafts/:id</td><td>Delete draft</td></tr>
              <tr><td className="mono">POST</td><td className="mono">/drafts/:id/reschedule</td><td>Reschedule</td></tr>
              <tr><td className="mono">POST</td><td className="mono">/drafts/:id/back-to-draft</td><td>Revert to draft</td></tr>
            </tbody>
          </table>

          <h4>Publishing</h4>
          <table className="table" style={{ fontSize: '0.88rem' }}>
            <thead><tr><th>Method</th><th>Path</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td className="mono">POST</td><td className="mono">/publish/:draftId</td><td>Queue draft for publish</td></tr>
              <tr><td className="mono">GET</td><td className="mono">/jobs</td><td>List publish jobs</td></tr>
            </tbody>
          </table>

          <h4>Media</h4>
          <table className="table" style={{ fontSize: '0.88rem' }}>
            <thead><tr><th>Method</th><th>Path</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td className="mono">POST</td><td className="mono">/media/upload</td><td>Upload file (multipart)</td></tr>
              <tr><td className="mono">GET</td><td className="mono">/media</td><td>List media</td></tr>
              <tr><td className="mono">DELETE</td><td className="mono">/media/:id</td><td>Delete media</td></tr>
            </tbody>
          </table>

          <h4>Provider Configuration</h4>
          <table className="table" style={{ fontSize: '0.88rem' }}>
            <thead><tr><th>Method</th><th>Path</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td className="mono">GET</td><td className="mono">/providers/status</td><td>Per-provider config + connection state</td></tr>
              <tr><td className="mono">PUT</td><td className="mono">/providers/:provider/config</td><td>Save encrypted credentials</td></tr>
              <tr><td className="mono">DELETE</td><td className="mono">/providers/:provider/config</td><td>Remove DB credentials</td></tr>
            </tbody>
          </table>

          <h4>Operators & Keys</h4>
          <table className="table" style={{ fontSize: '0.88rem' }}>
            <thead><tr><th>Method</th><th>Path</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td className="mono">GET</td><td className="mono">/operators</td><td>List operators</td></tr>
              <tr><td className="mono">POST</td><td className="mono">/operators</td><td>Create operator</td></tr>
              <tr><td className="mono">DELETE</td><td className="mono">/operators/:id</td><td>Delete operator</td></tr>
              <tr><td className="mono">GET</td><td className="mono">/api-keys</td><td>List API keys</td></tr>
              <tr><td className="mono">POST</td><td className="mono">/api-keys</td><td>Create API key</td></tr>
              <tr><td className="mono">DELETE</td><td className="mono">/api-keys/:id</td><td>Revoke API key</td></tr>
            </tbody>
          </table>
        </div>
      );
  }
}

export function HelpTab() {
  const [active, setActive] = useState<DocSection>('linkedin');

  const groups = [...new Set(sections.map((s) => s.group))];

  return (
    <div className="helpLayout">
      <nav className="helpSidebar">
        {groups.map((group) => (
          <div key={group}>
            <div className="sectionTitle" style={{ marginBottom: 6, marginTop: 12 }}>{group}</div>
            {sections
              .filter((s) => s.group === group)
              .map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`helpNavItem${active === s.id ? ' active' : ''}`}
                  onClick={() => setActive(s.id)}
                >
                  {s.label}
                </button>
              ))}
          </div>
        ))}
      </nav>
      <div className="helpContent">
        <DocContent section={active} />
      </div>
    </div>
  );
}
