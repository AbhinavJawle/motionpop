# Motionpop

> **AI can animate. It can't direct. We do.**

An AI-powered motion graphics studio that directs every scene with cinematic skills and keeps everything on-brand.

## What is Motionpop?

Motionpop is a web app where anyone—from YouTube creators to small business owners to professional motion designers—describes a scene in plain words and gets a **cinematically directed, polished, on-brand motion-graphics clip** in seconds.

## The Difference: Director Skills

Unlike generic AI motion generators, Motionpop uses readable **markdown "director skills"** that cinematically direct each scene: pacing, camera movement, reveal order, emphasis, holds, transitions, sound cues. This is what separates professional motion design from generic templates.

## Architecture

This is a monorepo containing:

- **apps/web**: Next.js application (main UI)
- **packages/components**: Remotion scene components
- **packages/schemas**: Zod schemas and shared TypeScript types
- **packages/styles**: Style pack token definitions
- **packages/skills**: Built-in director skills (markdown)
- **packages/engine**: AI planning, validation, patching, model routing
- **packages/render**: Remotion Lambda render orchestration
- **infra**: Infrastructure as Code (AWS CDK)

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Run tests
npm run test
```

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS, shadcn/ui
- **Animation**: Remotion (components, player, Lambda rendering)
- **AI**: Amazon Bedrock (Claude models) + Anthropic API
- **Cloud**: AWS (S3, CloudFront, Lambda, Cognito, DynamoDB, Transcribe)
- **Payments**: Stripe

## License

See [LICENSE](./LICENSE) file.

## Development

This project was built for Kiroween 2026 Hackathon.

Built with ❤️ using Kiro AI IDE.
