// The 20 confetti pieces of the ready dialog, read from the "Success dialog" frame in
// design/figma-export.css: [left, top, width, height, colour, rotation in degrees] in dialog
// pixels (560 wide).
export const READY_CONFETTI: ReadonlyArray<
  readonly [number, number, number, number, string, number]
> = [
  [384.0, 137.0, 5.0, 5.0, '#ffad85', 0],
  [192.25, 180.16, 8.0, 3.0, '#a38aff', -31.0],
  [291.71, 48.25, 8.0, 3.0, '#ff4d6d', -62.0],
  [343.02, 206.34, 5.0, 5.0, '#bfe9d6', -93.0],
  [158.35, 118.59, 8.0, 3.0, '#ffad85', -124.0],
  [393.06, 96.05, 8.0, 3.0, '#a38aff', -25.0],
  [253.0, 212.04, 5.0, 5.0, '#ff4d6d', -56.0],
  [225.15, 45.59, 8.0, 3.0, '#bfe9d6', -87.0],
  [402.11, 148.42, 8.0, 3.0, '#ffad85', -118.0],
  [183.87, 162.08, 5.0, 5.0, '#a38aff', -19.0],
  [330.43, 56.6, 8.0, 3.0, '#ff4d6d', -50.0],
  [320.11, 218.79, 8.0, 3.0, '#bfe9d6', -81.0],
  [188.14, 101.41, 5.0, 5.0, '#ffad85', -112.0],
  [396.22, 120.17, 8.0, 3.0, '#a38aff', -13.0],
  [202.94, 198.53, 8.0, 3.0, '#ff4d6d', -44.0],
  [266.63, 38.95, 5.0, 5.0, '#bfe9d6', -75.0],
  [368.79, 165.86, 8.0, 3.0, '#ffad85', -106.0],
  [146.11, 138.92, 8.0, 3.0, '#a38aff', -7.0],
  [353.71, 76.08, 5.0, 5.0, '#ff4d6d', -38.0],
  [274.51, 223.43, 8.0, 3.0, '#bfe9d6', -69.0],
];

/** The oval's top edge in the dialog: confetti `top` values are measured from the dialog top. */
export const READY_GLOW_TOP = 56;
