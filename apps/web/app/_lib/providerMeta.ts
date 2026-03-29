import type { ProviderId } from './api';

export interface ProviderMeta {
  displayName: string;
  authMode: 'oauth' | 'direct-token';
  devConsoleUrl: string;
  devConsoleLabel: string;
  oauthDocsUrl: string;
  credentialLabels: { clientId: string; clientSecret: string };
  scopes: string[];
  setupSteps: string[];
  notes: string;
}

export const PROVIDER_META: Record<ProviderId, ProviderMeta> = {
  x: {
    displayName: 'X (Twitter)',
    authMode: 'oauth',
    devConsoleUrl: 'https://console.x.com',
    devConsoleLabel: 'X Developer Console',
    oauthDocsUrl: 'https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code',
    credentialLabels: { clientId: 'OAuth 2.0 Client ID', clientSecret: 'Client Secret' },
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
    setupSteps: [
      'Create a project and app at console.x.com',
      'Under User Authentication Settings, enable OAuth 2.0',
      'Select app type: "Web App, Automated App, or Bot" (Confidential)',
      'Set permissions to "Read and write"',
      'Add the redirect URI shown below to your app\'s callback URLs',
      'Copy your OAuth 2.0 Client ID and Client Secret below',
    ],
    notes: 'Access tokens expire after 2 hours. Refresh tokens last 6 months and are renewed automatically.',
  },
  linkedin: {
    displayName: 'LinkedIn',
    authMode: 'oauth',
    devConsoleUrl: 'https://www.linkedin.com/developers/apps',
    devConsoleLabel: 'LinkedIn Developer Portal',
    oauthDocsUrl: 'https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow',
    credentialLabels: { clientId: 'Client ID', clientSecret: 'Client Secret' },
    scopes: ['openid', 'profile', 'w_member_social'],
    setupSteps: [
      'Create an app at linkedin.com/developers',
      'Under Auth, add the redirect URL shown below',
      'Request the products: "Share on LinkedIn" and "Sign In with LinkedIn using OpenID Connect"',
      'Copy your Client ID and Client Secret below',
    ],
    notes: 'Tokens expire after 60 days. Social Plane will attempt automatic refresh.',
  },
  facebook: {
    displayName: 'Facebook',
    authMode: 'direct-token',
    devConsoleUrl: 'https://developers.facebook.com/apps/',
    devConsoleLabel: 'Meta Developer Portal',
    oauthDocsUrl: 'https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow',
    credentialLabels: { clientId: 'App ID', clientSecret: 'App Secret' },
    scopes: ['pages_manage_posts', 'pages_read_engagement'],
    setupSteps: [
      'Create a Facebook app at developers.facebook.com (type: Business)',
      'Add the required permissions under App Review for the Page you want to publish to',
      'Save your App ID and App Secret here',
      'Then go to Connections and use the Meta token flow to connect a Facebook Page',
    ],
    notes: 'Social Plane currently connects Facebook through a Page/User access token from Meta Graph API Explorer. Personal profiles are not supported for publishing; use a Facebook Page.',
  },
  instagram: {
    displayName: 'Instagram',
    authMode: 'direct-token',
    devConsoleUrl: 'https://developers.facebook.com/apps/',
    devConsoleLabel: 'Meta Developer Portal',
    oauthDocsUrl: 'https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/get-started',
    credentialLabels: { clientId: 'Facebook App ID', clientSecret: 'Facebook App Secret' },
    scopes: ['instagram_basic', 'instagram_content_publish', 'pages_show_list'],
    setupSteps: [
      'Instagram publishing requires a Facebook app with Instagram Graph API enabled',
      'Your Instagram account must be a Business or Creator account linked to a Facebook Page',
      'Enable the Instagram Graph API product in your Facebook app',
      'Use the same Facebook App ID and App Secret here',
      'Then go to Connections and use the Meta token flow to connect the Instagram business account',
    ],
    notes: 'Social Plane currently connects Instagram through a Meta access token plus the linked Instagram Business account. Personal Instagram accounts are not supported.',
  },
};

export const PROVIDER_ORDER: ProviderId[] = ['x', 'linkedin', 'facebook', 'instagram'];
