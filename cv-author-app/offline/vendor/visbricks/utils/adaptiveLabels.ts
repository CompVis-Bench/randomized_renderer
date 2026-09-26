/**
 * Label layout helpers shared by deterministic SVG renderers and coordinate
 * system components. A reference box guides font scaling, but labels remain
 * complete after reaching their minimum size. All calculations are
 * deterministic so server rendering and the browser produce the same result.
 */

export type LabelReference = {
  text: string;
  width: number;
  height: number;
  background?: string;
  fontFamily?: string;
  fontSize?: number;
  minFontSize?: number;
  maxFontSize?: number;
  padding?: number;
};

export type AdaptiveLabel = {
  text: string;
  fontSize: number;
  color: string;
  width: number;
  height: number;
  truncated: boolean;
};

const WHITE = "#ffffff";
const BLACK = "#111827";

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function channel(value: string) {
  const parsed = Number.parseInt(value, 16);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseColor(value: string | undefined): [number, number, number] | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!normalized || normalized === "none" || normalized === "transparent") return null;
  if (normalized.startsWith("#")) {
    const hex = normalized.slice(1);
    if (hex.length === 3) return [channel(`${hex[0]}${hex[0]}`), channel(`${hex[1]}${hex[1]}`), channel(`${hex[2]}${hex[2]}`)];
    if (hex.length >= 6) return [channel(hex.slice(0, 2)), channel(hex.slice(2, 4)), channel(hex.slice(4, 6))];
  }
  const rgb = normalized.match(/^rgba?\(([^)]+)\)/)?.[1];
  if (rgb) {
    const values = rgb.split(",").slice(0, 3).map((item) => Number.parseFloat(item.trim()));
    if (values.length === 3 && values.every(Number.isFinite)) return values.map((item) => clamp(item, 0, 255)) as [number, number, number];
  }
  const named: Record<string, [number, number, number]> = {
    black: [0, 0, 0],
    white: [255, 255, 255],
    gray: [128, 128, 128],
    grey: [128, 128, 128],
    silver: [192, 192, 192],
    navy: [0, 0, 128],
    blue: [0, 0, 255],
    red: [255, 0, 0],
    green: [0, 128, 0],
    orange: [255, 165, 0],
    yellow: [255, 255, 0],
    purple: [128, 0, 128],
  };
  return named[normalized] ?? null;
}

function relativeLuminance(rgb: [number, number, number]) {
  const linear = rgb.map((value) => {
    const channelValue = value / 255;
    return channelValue <= 0.03928 ? channelValue / 12.92 : ((channelValue + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrastRatio(left: number, right: number) {
  const light = Math.max(left, right);
  const dark = Math.min(left, right);
  return (light + 0.05) / (dark + 0.05);
}

/** Select the higher contrast of black and white for a mark background. */
export function readableTextColor(background?: string, fallback = BLACK) {
  const rgb = parseColor(background);
  if (!rgb) return fallback;
  const luminance = relativeLuminance(rgb);
  return contrastRatio(luminance, relativeLuminance([255, 255, 255]))
    >= contrastRatio(luminance, relativeLuminance([17, 24, 39]))
    ? WHITE
    : BLACK;
}

/**
 * Measure text without requiring a DOM.  Browsers use a canvas reference
 * element when available; the fallback is deliberately conservative for SSR
 * and tests where canvas is not present.
 */
export function measureLabelWidth(text: string, fontSize: number, fontFamily = "sans-serif") {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (context) {
      context.font = `${fontSize}px ${fontFamily}`;
      const measured = context.measureText(text).width;
      if (Number.isFinite(measured)) return measured;
    }
  }
  const width = Array.from(text).reduce((sum, character) => {
    if (/\s/.test(character)) return sum + 0.3;
    if (/[\u2e80-\u9fff\uac00-\ud7ff]/.test(character)) return sum + 1;
    if (/[A-Z0-9]/.test(character)) return sum + 0.66;
    return sum + 0.55;
  }, 0);
  return width * fontSize;
}

/** Calculate an adaptive style from a concrete reference box. */
export function adaptiveLabel(reference: LabelReference): AdaptiveLabel {
  const fontFamily = reference.fontFamily ?? "sans-serif";
  const padding = Math.max(0, reference.padding ?? 4);
  const availableWidth = Math.max(0, reference.width - padding * 2);
  const availableHeight = Math.max(0, reference.height - padding * 2);
  const minFontSize = Math.max(4, reference.minFontSize ?? 7);
  const maxFontSize = Math.max(minFontSize, reference.maxFontSize ?? reference.fontSize ?? 12);
  const preferred = Math.max(minFontSize, reference.fontSize ?? maxFontSize);
  const widthBound = availableWidth > 0
    ? preferred * availableWidth / Math.max(measureLabelWidth(reference.text, preferred, fontFamily), 1)
    : minFontSize;
  const heightBound = availableHeight > 0 ? availableHeight / 1.2 : minFontSize;
  const fontSize = clamp(Math.min(preferred, widthBound, heightBound), minFontSize, maxFontSize);
  return {
    text: reference.text,
    fontSize,
    color: readableTextColor(reference.background),
    width: measureLabelWidth(reference.text, fontSize, fontFamily),
    height: fontSize * 1.2,
    truncated: false,
  };
}

/**
 * Return one common size for ordered axis labels.  Using adjacent positions
 * as the reference elements prevents neighbouring ticks from colliding.
 */
export function adaptiveAxisFontSize(
  labels: readonly string[],
  positions: readonly number[],
  baseFontSize = 10,
  minFontSize = 7,
  maxFontSize = baseFontSize,
) {
  const gaps = positions.slice(1).map((position, index) => Math.abs(position - (positions[index] ?? position))).filter((gap) => gap > 0);
  const available = gaps.length > 0 ? Math.min(...gaps) * 0.86 : Infinity;
  const longest = labels.reduce((longestLabel, label) => Math.max(longestLabel, measureLabelWidth(label, baseFontSize)), 0);
  const widthBound = Number.isFinite(available) && longest > 0 ? baseFontSize * available / longest : baseFontSize;
  return clamp(Math.min(baseFontSize, widthBound), minFontSize, maxFontSize);
}
