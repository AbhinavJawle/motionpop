# Motionpop Technical Architecture

> Detailed technical specifications and architectural decisions.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                            │
│  Next.js 15 App Router + React 19 + Remotion Player       │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS/REST API
┌──────────────────────┴──────────────────────────────────────┐
│                      API Layer                               │
│  Next.js API Routes + Server Actions                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
┌───────▼──────┐ ┌────▼────┐ ┌──────▼───────┐
│   AI Engine  │ │ Storage │ │    Render    │
│   (Bedrock)  │ │ (S3/DB) │ │ (Remotion Λ) │
└──────────────┘ └─────────┘ └──────────────┘
```

## Technology Stack

### Frontend
- **Framework**: Next.js 15 (App Router, React Server Components)
- **UI**: React 19, TypeScript
- **Styling**: Tailwind CSS, shadcn/ui components
- **Animation UI**: Framer Motion for UI micro-interactions
- **Preview**: Remotion Player (browser-based video preview)
- **State**: React hooks + Server Actions (avoid Redux for MVP)

### Backend
- **Runtime**: Node.js 20+ on AWS Lambda (serverless)
- **API**: Next.js API Routes + Server Actions
- **Validation**: Zod schemas for runtime type safety
- **Authentication**: AWS Cognito (email/Google OAuth)

### AI & LLMs
- **Primary**: Amazon Bedrock (Claude 3.7 Sonnet, Claude Opus)
- **BYOK**: Anthropic API direct integration option
- **Abstraction**: Vercel AI SDK for provider flexibility
- **Caching**: Prompt caching for catalog (components, skills, styles)

### Animation & Rendering
- **Engine**: Remotion 4.x (React-based video)
- **Components**: Handcrafted in packages/components
- **Preview**: Remotion Player (real-time in browser)
- **Export**: Remotion Lambda (parallel cloud rendering)

### Storage & Data
- **Database**: DynamoDB (NoSQL, serverless, EU region)
- **Object Storage**: S3 (assets, renders, logos)
- **CDN**: CloudFront (global content delivery)
- **Secrets**: AWS Secrets Manager + KMS for BYOK keys

### Build & Deploy
- **Monorepo**: Turborepo
- **Hosting**: AWS Amplify Hosting or CloudFront + Lambda
- **CI/CD**: GitHub Actions (build, test, deploy)
- **Region**: EU (Frankfurt) by default for GDPR

## Data Model

### Workspace
```typescript
{
  id: string;
  name: string;
  plan: 'free' | 'creator' | 'pro' | 'team';
  credits: number;
  byokKeyRef?: string; // encrypted KMS reference
  tasteProfile: {
    pacing: 'slower' | 'normal' | 'faster';
    accentUsage: 'minimal' | 'moderate' | 'bold';
    camera: 'static' | 'subtle' | 'dynamic';
  };
  createdAt: string;
  updatedAt: string;
}
```

### Project
```typescript
{
  id: string;
  workspaceId: string;
  name: string;
  brandKitId?: string;
  stylePackId: StylePackId;
  formatPreset: FormatPreset;
  pacing: 'slow' | 'normal' | 'fast';
  sceneIds: string[];
  createdAt: string;
  updatedAt: string;
}
```

### Scene
```typescript
{
  id: string;
  projectId: string;
  order: number;
  component: ComponentType;
  stylePack: StylePackId;
  skill: DirectorSkillId;
  format: FormatPreset;
  duration: number;
  props: Record<string, any>; // validated against component schema
  direction: Direction; // camera, reveal, holds, sfx
  versionIds: string[];
  createdAt: string;
  updatedAt: string;
}
```

### SceneVersion
```typescript
{
  id: string;
  sceneId: string;
  props: Record<string, any>;
  direction: Direction;
  createdBy: 'ai' | 'user';
  message?: string;
  createdAt: string;
}
```

### BrandKit
```typescript
{
  id: string;
  workspaceId: string;
  name: string;
  logos: Array<{ url: string; type: 'primary' | 'secondary' | 'icon' | 'wordmark' }>;
  palette: Record<string, string>; // role to hex
  fonts: { primary: string; secondary?: string };
  stingStyle: 'minimal' | 'bold' | 'elegant';
  watermark?: { enabled: boolean; position: string; opacity: number };
  safeZoneMargins?: { top: number; bottom: number; left: number; right: number };
  endCard?: { enabled: boolean; text?: string; url?: string };
}
```

### LibraryItem
```typescript
{
  id: string;
  workspaceId: string;
  type: 'scene' | 'skill' | 'style' | 'asset' | 'data';
  name: string;
  tags: string[];
  isReference: boolean;
  refSceneId?: string;
  metadata?: Record<string, any>;
  thumbnailUrl?: string;
  createdAt: string;
  updatedAt: string;
}
```

### RenderJob
```typescript
{
  id: string;
  workspaceId: string;
  sceneId?: string;
  sequenceId?: string;
  format: FormatPreset;
  codec: 'h264-mp4' | 'prores-4444' | 'webm-vp9-alpha';
  quality: '1080p' | '4K';
  fps: number;
  status: 'pending' | 'rendering' | 'completed' | 'failed';
  progress: number; // 0-1
  outputUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}
```

## AI Generation Pipeline

### Phase 1: Intent Parsing
**Input**: User prompt + optional data/assets
**Model**: Sonnet 3.7
**Output**: Structured intent
```typescript
{
  message: string; // core message to convey
  data: { type: 'numbers' | 'trend' | 'comparison' | 'geography' | 'timeline', values: any };
  emotion: 'neutral' | 'excitement' | 'concern' | 'shock' | 'calm';
  entities: string[]; // extracted brands, years, locations
}
```

### Phase 2: Planning
**Input**: Intent + Catalog (cached) + Project defaults + References
**Model**: Sonnet 3.7 with prompt caching
**Output**: Scene plan
```typescript
{
  component: ComponentType;
  skill: DirectorSkillId;
  stylePack: StylePackId;
  duration: number;
  reasoning: string; // why these choices
}
```

**Catalog Structure (Cached)**:
```typescript
{
  components: Array<{
    id: ComponentType;
    name: string;
    description: string;
    schema: string; // JSON schema string
    examplePrompts: string[];
    compatibleSkills: string[];
  }>;
  skills: Array<{
    id: DirectorSkillId;
    name: string;
    markdown: string; // full skill definition
    useWhen: string;
    energy: 'low' | 'medium' | 'high';
  }>;
  styles: Array<{
    id: StylePackId;
    name: string;
    description: string;
    tokens: StylePack; // full token set
  }>;
}
```

### Phase 3: Props Generation
**Input**: Plan + Intent + Skill definition + Brand kit
**Model**: Sonnet 3.7
**Output**: Complete props + direction
```typescript
{
  props: ComponentPropsFor[plan.component];
  direction: {
    camera: CameraKeyframe[];
    reveal: 'all-at-once' | 'sequential' | 'highlight-last' | 'build-to-peak';
    holdAt?: number; // 0-1 normalized
    holdDuration?: number; // seconds
    sfx: SoundCue[];
    emphasis?: { target: string; style: string };
  };
}
```

**Skill Application**: The model reads the skill markdown and translates timing percentages into absolute values based on duration.

### Phase 4: Validation
**Validators**:
1. **Schema validation** (Zod): Props match component schema
2. **Text overflow**: Text fits in bounding boxes at all times
3. **Element collisions**: No overlapping elements (bounding box check)
4. **Safe zones**: Elements respect format safe zones
5. **Data-number match**: Displayed numbers exactly match input data
6. **Duration bounds**: Scene duration within min/max (1-30s)
7. **Font size minimums**: Text readable at format resolution

**On Failure**:
- First attempt: Return errors to model for retry (max 2)
- After 2 failures: Fall back to safe defaults or escalate to Opus

### Phase 5: Preview
**Execution**: Remotion Player renders in browser (no AI, no server)
- Scene JSON → Remotion component
- Real-time preview at 30fps
- Scrubbing, play/pause

### Phase 6: Refinement
**Input**: Scene + User instruction + Lock list
**Model**: Haiku 3.7 (fast, cheap)
**Output**: JSON patch
```typescript
{
  path: string; // JSONPath to property
  op: 'replace' | 'add' | 'remove';
  value: any;
}
```

**Examples**:
- "Make it slower" → `{ path: '/duration', op: 'replace', value: 12 }`
- "Hold 2024 longer" → `{ path: '/direction/holdAt', op: 'replace', value: 0.7 }`
- "Use my red" → `{ path: '/props/highlight', op: 'replace', value: '2024' }`

### Phase 7: Visual QA (V1)
**Input**: Keyframe screenshots
**Model**: Haiku (vision)
**Output**: Suggestions
```typescript
{
  issues: Array<{
    type: 'clutter' | 'contrast' | 'composition' | 'hierarchy';
    severity: 'info' | 'warning';
    description: string;
    fix?: { path: string; value: any }; // one-click fix
  }>;
}
```

### Phase 8: Export
**Execution**: Remotion Lambda
1. Scene JSON → Remotion bundle
2. Deploy to Lambda
3. Parallel rendering (chunks)
4. Stitching
5. Upload to S3
6. CloudFront URL

**Codecs**:
- **MP4 (H.264)**: Default, widely compatible
- **ProRes 4444**: Transparent background, pro editors
- **WebM (VP9 Alpha)**: Transparent, web-optimized

## Security Architecture

### Authentication & Authorization
- **Cognito User Pools** for identity
- **JWT tokens** for API access
- **IAM roles** for service-to-service
- **Row-level security**: All queries scoped to workspaceId

### Secrets Management
- **Environment variables**: Never in repo, in AWS Secrets Manager
- **BYOK keys**: Encrypted with KMS, stored as reference only
- **API keys**: Server-side only, never exposed to client

### Input Validation
- All user input validated with Zod schemas
- Prompt injection protections (content policy layer)
- File upload validation (type, size, virus scan)
- Rate limiting per user (100 req/hour for Free, higher for paid)

### Data Protection
- **Encryption at rest**: S3 and DynamoDB encryption enabled
- **Encryption in transit**: HTTPS only, TLS 1.3
- **Data residency**: EU region by default
- **Deletion**: Hard delete support for GDPR "right to erasure"

## Performance Targets

### Latency
- **Plan generation**: <2s (p50), <5s (p95)
- **Props generation**: <4s (p50), <8s (p95)
- **Preview render**: <1s to first frame
- **Refinement patch**: <1s (p50), <2s (p95)
- **Export (10s 1080p)**: <60s

### Throughput
- **Concurrent generations**: 100+ per region
- **Remotion Lambda**: 1000+ parallel renders

### Optimization Strategies
- **Prompt caching**: Catalog cached, reused across requests
- **Edge caching**: Static assets on CloudFront
- **Preview in browser**: No server-side preview rendering
- **Lazy loading**: Components load on demand
- **Code splitting**: Next.js automatic code splitting

## Cost Model

### AI Costs (estimated)
- **Intent parsing**: ~500 input tokens + 200 output = $0.002
- **Planning** (with cache): ~10,000 cached + 500 input + 300 output = $0.003
- **Props generation**: ~15,000 cached + 1,000 input + 800 output = $0.008
- **Refinement**: ~200 input + 100 output = $0.0003
- **Total per scene**: ~$0.013 (Haiku) to ~$0.04 (Sonnet)

### Render Costs
- **Remotion Lambda**: ~$0.02 per minute of video (1080p)
- **10s scene**: ~$0.003
- **Storage**: $0.023/GB/month (S3)

### Target Gross Margin
- **Free tier**: Loss leader (watermark for growth)
- **Creator ($19/mo)**: 70% margin (AI + render ~$6/mo per user)
- **Pro ($49/mo)**: 80% margin

## Deployment Architecture

### Development
```
Local dev → npm run dev → localhost:3000
```

### Staging
```
GitHub (main) → GitHub Actions → AWS Amplify (staging)
staging.motionpop.com
```

### Production
```
GitHub (release tag) → GitHub Actions → AWS Amplify (prod)
motionpop.com
```

### Infrastructure as Code
AWS CDK stacks:
- `CognitoStack`: User pools, identity pools
- `DynamoDBStack`: Tables with backup enabled
- `S3Stack`: Buckets with lifecycle policies
- `LambdaStack`: Remotion render functions
- `CloudFrontStack`: CDN distribution
- `BedrockStack`: Model access configuration

## Monitoring & Observability

### Metrics (CloudWatch)
- API latency (p50, p95, p99)
- Error rate by endpoint
- AI model token usage
- Render job duration
- Database read/write capacity

### Logging
- Structured JSON logs
- Request ID tracing
- Error stack traces to Sentry
- User actions (generation, export, refinement)

### Alerts
- Error rate >1%
- API latency p95 >5s
- AWS Budget exceeded
- Render job failure rate >5%

## Scalability Considerations

### Current Architecture (MVP)
- Serverless (Lambda, DynamoDB)
- Auto-scaling by default
- No single points of failure
- Region: EU-Central-1

### Future Scaling
- Multi-region deployment
- DynamoDB Global Tables
- CloudFront edge locations worldwide
- Lambda@Edge for routing

---

This architecture supports the MVP and scales to thousands of users without major changes. The serverless foundation keeps costs variable and removes operational burden.
