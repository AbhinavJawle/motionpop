# Requirements: Personal Library, Auth & BYOK

## Introduction
Users save scenes, mark references that guide future generations, and sign in securely. Includes the account basics the MVP needs.

## Requirements

### R1: Authentication
1. THE system SHALL support email and Google sign-in via Cognito.
2. THE API SHALL reject unauthenticated generation, refine and export requests.
3. EVERY data query SHALL be scoped to the caller's workspaceId.
4. A workspace SHALL be created on first sign-in.

### R2: Save to library
1. WHEN the user chooses "Save to library", THE system SHALL create a LibraryItem of type `scene` linked to the scene id with a name, tags and thumbnail.
2. THE system SHALL suggest a name and tags via a Haiku-class model; the user MAY edit them.
3. THE user SHALL be able to tick "Use as reference".
4. Saving SHALL snapshot the scene version so later edits to the scene do not change the library item.

### R3: Library browser
1. THE browser SHALL list items with thumbnails and support text search and filters by tag, component, style and skill.
2. THE user SHALL open an item into a project as a new scene, rename, retag, toggle reference, and delete it.
3. Deleting an item SHALL NOT delete scenes already created from it.

### R4: Reference-guided generation (basic)
1. WHEN planning, THE Engine SHALL retrieve up to 3 reference summaries ranked by tag and component similarity to the intent.
2. A reference summary SHALL contain component, skill, style, duration, camera summary and colour emphasis.
3. WHEN a prompt names a saved item ("like my Tesla chart"), THE Engine SHALL prefer that item and reuse its component, skill and style while replacing the data.

### R5: Feedback
THE Studio SHALL provide 👍/👎 per scene with an optional reason, stored with the scene version.

### R6: BYOK
1. THE user SHALL add an Anthropic API key in settings.
2. THE system SHALL validate the key with a test call before saving.
3. THE key SHALL be encrypted with KMS, used only server-side, never logged, and never returned to the client.
4. THE user SHALL be able to delete the key at any time.

### R7: Limits
THE API SHALL apply per-user rate limiting (default 100 requests/hour on the free tier).

## Out of scope
Collections, taste profile UI, custom skills/styles in library, team libraries, Stripe billing, credits dashboard [V1/V2].
