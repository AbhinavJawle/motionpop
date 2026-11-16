/** The dashboard greeting by local hour (spec 11 R2.2). Pure. */

export interface Greeting {
  line: string;
  subline: string;
  night: boolean;
}

/** First word of the display name, else "there". */
export function firstName(displayName?: string | null): string {
  const first = displayName?.trim().split(/\s+/)[0];
  return first && first.length > 0 ? first : 'there';
}

export function greet(hour: number, displayName?: string | null): Greeting {
  const name = firstName(displayName);
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h >= 23 || h < 5) {
    return {
      line: `Working late, ${name}?`,
      subline: "Pip's still up. Let's make something.",
      night: true,
    };
  }
  if (h < 12) {
    return {
      line: `Good morning, ${name}`,
      subline: 'Fresh ideas taste better with coffee.',
      night: false,
    };
  }
  if (h < 17) {
    return { line: `Good afternoon, ${name}`, subline: "Let's make something move.", night: false };
  }
  return { line: `Good evening, ${name}`, subline: 'One more story before dinner?', night: false };
}
