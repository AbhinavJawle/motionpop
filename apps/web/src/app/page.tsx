import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Clapperboard, Sparkles, Target } from 'lucide-react';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2 font-bold text-xl">
            <Clapperboard className="h-6 w-6" />
            <span>Motionpop</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link href="/studio" className="text-sm font-medium transition-colors hover:text-primary">
              Studio
            </Link>
            <Link href="/gallery" className="text-sm font-medium transition-colors hover:text-primary">
              Gallery
            </Link>
            <Link href="/pricing" className="text-sm font-medium transition-colors hover:text-primary">
              Pricing
            </Link>
            <Button variant="default" size="sm" asChild>
              <Link href="/signup">Get Started</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="container px-4 py-24 md:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-4 inline-flex items-center rounded-full border border-border/40 bg-muted/50 px-4 py-1.5 text-sm">
              <Sparkles className="mr-2 h-4 w-4" />
              Built for Kiroween 2026
            </div>
            
            <h1 className="mb-6 text-5xl font-bold tracking-tight sm:text-6xl md:text-7xl">
              AI can animate.
              <br />
              <span className="text-muted-foreground">It can't direct.</span>
              <br />
              We do.
            </h1>
            
            <p className="mb-8 text-lg text-muted-foreground sm:text-xl">
              Create cinematically directed, polished, on-brand motion graphics in seconds.
              Every scene gets a director, and every clip gets your style.
            </p>
            
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button size="lg" asChild>
                <Link href="/studio">Start Creating →</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/gallery">See Examples</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-border/40 bg-muted/20 py-20">
          <div className="container px-4">
            <h2 className="mb-12 text-center text-3xl font-bold">What makes us different</h2>
            <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-3">
              <div className="space-y-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Target className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-semibold">Director Skills</h3>
                <p className="text-muted-foreground">
                  Readable markdown skills that cinematically direct each scene with professional pacing, camera movement, and emphasis.
                </p>
              </div>
              
              <div className="space-y-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Sparkles className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-semibold">Handcrafted Components</h3>
                <p className="text-muted-foreground">
                  Premium, hand-built components. The AI never freestyles code—quality is set by craft, not luck.
                </p>
              </div>
              
              <div className="space-y-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Clapperboard className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-semibold">Edit, Don't Re-roll</h3>
                <p className="text-muted-foreground">
                  Precise refinement by chat or controls without breaking the rest. Your library learns your taste.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8">
        <div className="container px-4 text-center text-sm text-muted-foreground">
          <p>Built with ❤️ using Kiro AI IDE</p>
          <p className="mt-2">© 2026 Motionpop. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
