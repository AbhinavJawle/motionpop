# The render job (spec 08 design §17): HyperFrames producer + headless Chrome + ffmpeg, run as a
# Cloud Run job, one execution per export. Built from the repository root:
#   docker build -f services/render/Dockerfile .
FROM node:24-bookworm-slim

# ffmpeg for muxing and probing; the shared libraries headless Chrome needs on Debian bookworm.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg ca-certificates fonts-liberation unzip \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libcairo2 libcups2 libdbus-1-3 libdrm2 libgbm1 \
    libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libx11-6 libx11-xcb1 libxcb1 \
    libxcomposite1 libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 libxshmfence1 \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PUPPETEER_CACHE_DIR=/app/.cache/puppeteer \
    NODE_ENV=production \
    # No user namespaces in Cloud Run's sandbox: Chrome runs without its own sandbox, inside the
    # container's (the job holds no credentials beyond its own render's paths).
    HYPERFRAMES_CHROME_SANDBOX=0 \
    CHROME_NO_SANDBOX=1

WORKDIR /app
RUN chown node:node /app
USER node

COPY --chown=node:node . .
# Installs the job and its workspace packages; puppeteer's install script fetches Chrome into
# PUPPETEER_CACHE_DIR. Then the composition runtime the job inlines into each render.
RUN pnpm install --frozen-lockfile --filter "@motionpop/render..." \
  && ls "$PUPPETEER_CACHE_DIR"/chrome-headless-shell "$PUPPETEER_CACHE_DIR"/chrome \
  && pnpm --filter @motionpop/motion build:runtime

WORKDIR /app/services/render
CMD ["node", "--import", "tsx", "src/job.ts"]
