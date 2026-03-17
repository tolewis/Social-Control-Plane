# Auth Strategy — Social Control Plane

Status: Draft
Updated: 2026-03-16

## Goal
Use Postiz as inspiration for provider authentication patterns without inheriting its product fragility.

## Postiz patterns worth reusing
From the live Postiz codebase:
- provider-specific auth adapters
- provider-specific redirect URIs
- platform-specific scope definitions
- Meta family sharing one Facebook app for Facebook + Instagram flows
- LinkedIn page flow using standard OAuth2 auth URL + access token exchange + page discovery
- X flow using its own auth mechanics rather than pretending every provider is the same

## Postiz patterns to avoid copying blindly
- weak/no reconciliation around ambiguous failures
- provider auth logic mixed too tightly with broader app behavior
- insufficient visibility into credential health / reconnect needs
- brittle mutation semantics downstream of auth

## Recommended auth architecture
Create a provider adapter contract like:
- `getAuthorizationUrl()`
- `exchangeAuthorizationCode()`
- `refreshConnection()`
- `listTargets()`
- `getConnectionIdentity()`
- `publish()`
- `deleteOrCancel()`

## Connection model
Separate these clearly:
1. **provider app credentials**
2. **connection tokens**
3. **publish target mappings**
4. **operator-facing connection health status**

## Security stance
- encrypt access/refresh tokens at rest
- store token metadata separately from ciphertext where useful
- record scope set and expiry timestamps
- persist reconnect-needed state
- never expose provider raw secrets/tokens to agent clients

## Provider notes
### LinkedIn
Use Postiz as reference for:
- OAuth2 authorization code flow
- access token exchange
- user info fetch
- organization/page discovery for page publishing

### Facebook + Instagram
Use Postiz as reference for:
- Facebook dialog OAuth flow
- long-lived token exchange
- granted-scope verification
- page/account discovery
- shared app strategy across Facebook + Instagram business flows

### X
Use Postiz as reference that X auth is its own thing and should live behind a dedicated adapter. Do not force-fit it into the same assumptions as LinkedIn/Meta.

## UX requirements
The UI must make these states obvious:
- connected
- expiring soon
- reconnect required
- scope mismatch
- publish target missing
- app credential misconfiguration

## First implementation recommendation
Build the auth abstraction first, but ship the first end-to-end slice on **LinkedIn**.
Then use the same abstractions for Meta and X.
