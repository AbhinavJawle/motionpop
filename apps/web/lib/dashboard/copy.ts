/** Every user-facing string of the dashboard and Start (spec 11, rewritten for spec 35). */
export const DASHBOARD_COPY = {
  nav: { projects: 'Projects', styles: 'Styles' },
  newProject: 'New project',
  capture: {
    hold: 'Hold to record',
    release: 'Release to finish',
    hint: '…or paste a script, or drop audio anywhere',
    placeholder: 'Paste a script and press Enter',
    micDenied: "Pip can't hear you. Allow the microphone in the address bar, or upload instead.",
    uploadInstead: 'Upload instead',
  },
  empty: {
    title: 'Your first video is two minutes away',
    body: 'Hold the mic and talk, paste a script, or drop a voiceover anywhere on this page. Pip finds the moments and puts a graphic on each one.',
    cta: 'Create your first project',
    sample: 'Try it with a sample',
    foot: 'No editing experience needed. Just something to say.',
  },
  drag: {
    pill: "Drop it, I'll catch it!",
    body: 'Let go anywhere. Pip takes it from here.',
    formats: 'MP3, WAV, M4A, MP4 or MOV',
  },
  continue: {
    title: 'Pick up where you left off',
    resume: 'Resume',
    ready: (ready: number, total: number) =>
      total === 0
        ? 'No graphics yet'
        : ready === total
          ? `All ${total} graphics ready`
          : `${ready} of ${total} graphics ready`,
  },
  week: (videos: number, graphics: number, saved: string) =>
    `This week: ${videos} ${videos === 1 ? 'video' : 'videos'}, ${graphics} ${graphics === 1 ? 'graphic' : 'graphics'}, ${saved} of editing saved.`,
  projects: {
    title: 'Projects',
    search: 'Search projects',
    noMatch: (q: string) => `No projects match “${q}”.`,
    sort: { edited: 'Last edited', created: 'Created', name: 'Name' },
    damaged: 'This save looks damaged',
  },
  menu: { open: 'Open', rename: 'Rename', duplicate: 'Duplicate', delete: 'Delete' },
  deleteConfirm: {
    title: (t: string) => `Delete “${t}”?`,
    body: "This removes its graphics and voiceover. You can't undo this.",
  },
  toasts: {
    styles: 'Styles are on their way.',
    exploreStyles: 'The style gallery is on its way.',
    styleSoon: (name: string) => `${name} is on its way.`,
    duplicated: (t: string) => `Duplicated as “${t}”.`,
    duplicateFailed: "Couldn't copy the audio. Nothing was duplicated.",
    deleted: (t: string) => `Deleted “${t}”.`,
    deleteFailed: "Couldn't delete that project. Try again.",
    renameFailed: "Couldn't rename that project. Try again.",
    brandKit: 'Brand kit is on its way.',
  },
  styles: {
    title: 'Try a look',
    subline: 'Same voice, different clothes. Start your next video in one of these.',
    explore: 'All looks',
  },
  footer: { line: 'Made for the stories only you can tell.', help: 'Help & shortcuts' },
} as const;

export const START_COPY = {
  eyebrow: 'Pick a way in. I’ll catch the rest.',
  headline: "Bring your voice. We'll bring the motion.",
  subline: 'Record, upload or paste a script, and graphics will follow every word.',
  record: { title: 'Record', body: 'Your voice, in the moment.', cta: 'Start recording' },
  upload: {
    title: 'Upload voiceover',
    body: 'Already have the perfect take?',
    drop: 'Drop your audio or browse',
    formats: 'MP3, WAV, M4A, MP4, MOV',
    sample: 'Try a sample',
  },
  script: {
    title: 'Paste script',
    body: 'Start with the words.',
    placeholder: 'Every great story starts with…',
    cta: "We'll generate the voice",
  },
  single: 'Or just make a single graphic',
  singleFoot: 'No timeline to tame. Just a story to tell.',
  untitled: 'Untitled Project',
} as const;

export const RECORD_COPY = {
  eyebrow: 'I’m listening…',
  headline: 'Your voice is the starting point.',
  subline: 'Keep talking. Pip is catching every word.',
  recording: 'Recording',
  paused: 'Paused',
  review: 'Your take',
  reviewEyebrow: 'Caught every word!',
  reviewHeadline: 'Nice take.',
  reviewSubline: 'Listen back, or let Pip get to work.',
  stop: 'Click to stop',
  pause: 'Pause',
  resume: 'Resume',
  discard: 'Discard',
  good: 'Nice and clear. Keep going.',
  quiet: 'A bit quiet, move closer',
  waiting: 'Waiting for your microphone…',
  pausedLine: 'Paused. Press Space to keep going.',
  nearLimit: 'One minute left. Takes stop at 10:00.',
  limit: 'That’s 10 minutes. Pip kept everything so far.',
  unplugged: 'Your mic went quiet. Pick another one to keep going.',
  denied: "Pip can't hear you. Allow the microphone in the address bar, then try again.",
  noDevice: 'No microphone found. Plug one in, or upload a file instead.',
  tryAgain: 'Try again',
  uploadInstead: 'Upload instead',
  useTake: 'Use this take',
  again: 'Record again',
  footLine: 'Your recording stays here until you’re ready.',
  footNote: 'Nothing is uploaded until you finish.',
  discardTitle: 'Discard this take?',
  discardBody: 'Pip will forget everything you just said.',
  discardConfirm: 'Discard take',
  keep: 'Keep recording',
  defaultMic: 'Built-in microphone',
} as const;
