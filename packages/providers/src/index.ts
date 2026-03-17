import type { ProviderAuthAdapter } from '../../shared/src/index.js';

const required = (value: string | undefined, name: string) => {
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
};

export class LinkedInAdapter implements ProviderAuthAdapter {
  provider = 'linkedin' as const;
  async getAuthorizationUrl() {
    const clientId = required(process.env.LINKEDIN_CLIENT_ID, 'LINKEDIN_CLIENT_ID');
    const redirect = required(process.env.LINKEDIN_REDIRECT_URI, 'LINKEDIN_REDIRECT_URI');
    const state = crypto.randomUUID();
    const scope = encodeURIComponent('openid profile email w_member_social r_organization_social rw_organization_admin');
    return `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}&state=${state}&scope=${scope}`;
  }
}

export class FacebookAdapter implements ProviderAuthAdapter {
  provider = 'facebook' as const;
  async getAuthorizationUrl() {
    const clientId = required(process.env.FACEBOOK_APP_ID, 'FACEBOOK_APP_ID');
    const redirect = required(process.env.FACEBOOK_REDIRECT_URI, 'FACEBOOK_REDIRECT_URI');
    const state = crypto.randomUUID();
    const scope = encodeURIComponent('pages_show_list,business_management,pages_manage_posts,pages_manage_engagement,pages_read_engagement,read_insights');
    return `https://www.facebook.com/v20.0/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}&state=${state}&scope=${scope}`;
  }
}

export class InstagramAdapter implements ProviderAuthAdapter {
  provider = 'instagram' as const;
  async getAuthorizationUrl() {
    const clientId = required(process.env.FACEBOOK_APP_ID, 'FACEBOOK_APP_ID');
    const redirect = required(process.env.INSTAGRAM_REDIRECT_URI, 'INSTAGRAM_REDIRECT_URI');
    const state = crypto.randomUUID();
    const scope = encodeURIComponent('instagram_basic,instagram_content_publish,pages_show_list,business_management');
    return `https://www.facebook.com/v20.0/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}&state=${state}&scope=${scope}`;
  }
}

export class XAdapter implements ProviderAuthAdapter {
  provider = 'x' as const;
  async getAuthorizationUrl() {
    return 'x-auth-flow-required';
  }
}
