/**
 * Application-wide chart palette configuration.
 *
 * `categorical` is for distinguishing discrete series or groups.
 * `gradient` is ordered from the low end to the high end of a continuous scale.
 * Edit these arrays to customize chart colors; edit `frontendPalette` below
 * for the editor UI.
 */
export const globalPalette = {
  categorical: [
    "#606c38",
    "#283618",
    "#ffe6a7",
    "#dda15e",
    "#bc6c25",
    "#780000",
    "#c1121f",
    "#003049",
    "#669bbc",
  ],
  gradient: [
    "#ffedd8",
    "#f3d5b5",
    "#e7bc91",
    "#d4a276",
    "#bc8a5f",
    "#a47148",
    "#8b5e34",
    "#6f4518",
    "#603808",
    "#583101",

  ],
};

/**
 * Colors exposed by frontend appearance controls.
 *
 * Keep UI colors here so changing the visual language does not require
 * hunting through individual components. `components` identifies the
 * surfaces used by the major editor component types; `series` is the
 * categorical fallback used by chart controls.
 */
export const frontendPalette = {
  lightest: "#fffef7",
  surface: {
    canvas: "#fffef7",
    panel: "#fffef7",
    raised: "#fffef7",
    soft: "#fffef7",
    sidebar: "#fffef7",
  },
  text: {
    primary: "#432818",
    secondary: "#99582a",
    muted: "#728196",
    inverse: "#fffef7",
  },
  control: {
    accent: "#fffef7",
    accentStrong: "#99582a",
    sliderTrack: "#bc6c25",
    sliderThumb: "#606c38",
    borderSubtle: "rgb(67 40 24 / 24%)",
    border: "rgb(67 40 24 / 38%)",
    borderStrong: "rgb(67 40 24 / 58%)",
  },
  status: {
    info: "#2563eb",
    success: "#15803d",
    warning: "#d97706",
    danger: "#b42318",
  },
  components: {
    data: "#fffef7",
    chart: "#fffef7",
    composition: "#fffef7",
    inspector: "#fffef7",
    blockCard: "#fefae0",
  },
  series: [
    "#432818",
    "#99582a",
    "#ffe6a7",
    "#606c38",
    "#669bbc",
  ],
} as const;

const frontendLightRgb = [0, 2, 4]
  .map((offset) => Number.parseInt(frontendPalette.lightest.slice(offset + 1, offset + 3), 16))
  .join(" ");

/** CSS custom properties consumed by the component stylesheets. */
export const frontendPaletteCssVariables = {
  "--frontend-light-rgb": frontendLightRgb,
  "--frontend-surface-canvas": frontendPalette.surface.canvas,
  "--frontend-surface-panel": frontendPalette.surface.panel,
  "--frontend-surface-raised": frontendPalette.surface.raised,
  "--frontend-surface-soft": frontendPalette.surface.soft,
  "--frontend-sidebar-background": frontendPalette.surface.sidebar,
  "--frontend-text-primary": frontendPalette.text.primary,
  "--frontend-text-secondary": frontendPalette.text.secondary,
  "--frontend-text-muted": frontendPalette.text.muted,
  "--frontend-control-accent": frontendPalette.control.accent,
  "--frontend-control-accent-strong": frontendPalette.control.accentStrong,
  "--frontend-slider-track": frontendPalette.control.sliderTrack,
  "--frontend-slider-thumb": frontendPalette.control.sliderThumb,
  "--frontend-border-subtle": frontendPalette.control.borderSubtle,
  "--frontend-control-border": frontendPalette.control.border,
  "--frontend-border-strong": frontendPalette.control.borderStrong,
  "--frontend-component-data": frontendPalette.components.data,
  "--frontend-component-chart": frontendPalette.components.chart,
  "--frontend-component-composition": frontendPalette.components.composition,
  "--frontend-component-inspector": frontendPalette.components.inspector,
  "--frontend-component-block-card": frontendPalette.components.blockCard,
  "--frontend-status-info": frontendPalette.status.info,
  "--frontend-status-success": frontendPalette.status.success,
  "--frontend-status-warning": frontendPalette.status.warning,
  "--frontend-status-danger": frontendPalette.status.danger,
} as const;

/** Typography shared by all editor UI components. */
export const frontendTypography = {
  family: "Arial, sans-serif",
  style: "normal",
  weight: 700,
  scale: 1,
} as const;

export const frontendTypographyCssVariables = {
  "--frontend-font-family": frontendTypography.family,
  "--frontend-font-style": frontendTypography.style,
  "--frontend-font-weight": String(frontendTypography.weight),
  "--frontend-font-scale": String(frontendTypography.scale),
} as const;
