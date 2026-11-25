/** Every user-facing string of the configure screen (spec 39 R2). */
export const CONFIGURE_COPY = {
  loading: 'Pip is unpacking your take…',
  headlineVideo: 'Set up your edit.',
  headlineVoice: 'Set up your video.',
  headlineGraphic: 'Design your motion graphic.',
  subline:
    'Pick a recipe and a look while Pip reads your take. Nothing is spent until you press Create.',
  sublineGraphic:
    'Pick a format, recipe, visual style, or custom SKILL.md. Nothing is spent until you press Create.',
  chooseAnother: 'Choose another file to continue',
  format: {
    title: 'Format',
    hint: 'Aspect ratio for preview, MP4, and transparent WebM export.',
  },
  recipe: {
    title: 'Recipe',
    hint: 'What kind of video this is. It sets the pacing, the hook and the visuals the director reaches for.',
    custom: 'Describe your own',
    customSub: 'Tell Pip what you want',
    customLabel: 'Describe your recipe',
    placeholder: 'Fast-paced coding breakdown with crisp comparisons',
  },
  style: {
    title: 'Style',
    hintVideo: 'Colours, type and captions for this recipe.',
    hintVoice: 'The look your graphics are drawn in.',
    hintGraphic:
      'Paper textures, colour palette, typography, and cutout art direction for custom scenes.',
    custom: 'Describe your own',
    customLabel: 'Describe your style',
    placeholder: 'Vox-style paper collage with graph paper, yellow tape & red highlights',
  },
  visuals: {
    title: 'AI Cutout Visuals',
    hint: 'Creates style-matched cutout illustrations & props that key cleanly onto transparent WebM.',
    toggle: 'AI cutout illustrations',
    toggleSub: 'Custom editorial artwork matched to your chosen look',
  },
  hook: {
    title: 'Hook',
    hint: 'How the first second grabs attention.',
  },
  captions: {
    title: 'Captions',
    hint: 'Words on screen, in time with the voice.',
    styleLabel: 'Caption style',
  },
  cta: {
    title: 'Call to action',
    hint: 'The ask at the end. Leave the text empty to keep it only if you ask on camera.',
    textLabel: 'Call to action text',
    placeholder: 'Comment LINK',
  },
  sound: {
    title: 'Sound',
    hint: 'Clean speech, small hits, and a bed of music under it all.',
    cleanup: 'Speech cleanup',
    cleanupSub: 'Removes pauses, fillers and retakes',
    sfx: 'Sound effects',
    sfxSub: 'Pops, ticks and whooshes on the beats',
    illustrations: 'AI illustrations',
    illustrationsSub: 'Pictures drawn for the things you describe',
    music: 'Music',
    autoFor: (recipe: string) => `picked for ${recipe}`,
  },
  soon: {
    recipes: 'More recipes coming soon',
    styles: 'More styles coming soon',
    hooks: 'More hooks coming soon',
    captions: 'More caption styles coming soon',
    sound: 'More sound packs coming soon',
  },
} as const;
