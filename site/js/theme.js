export let theme = 'default';

export function setTheme(name) {
  theme = name === 'win-55' ? 'win-55' : 'default';
  C = theme === 'win-55' ? WIN55 : DEFAULT;
}

// The palette: the editor's tokens and vgui2-deck's states (README, Palette), and Catppuccin Mocha for the wells.
const DEFAULT = {
  win: '#4C5844',      // main surface
  inset: '#3E4637',    // sunken areas and fields
  btn: '#4E5744',      // buttons
  sel: '#958831',      // selection and focus, brass
  hi: '#7E8776',       // light bevel
  lo: '#32392C',       // dark bevel
  dark: '#282E20',     // darkest surface
  text: '#D8DED3',
  bright: '#F1F2F0',
  dim: '#758666',
  cb: '#1e1e2e',       // well background
  crust: '#11111b',
  ct: '#cdd6f4',
  cs: '#a6adc8',
  csurf: '#585b70',
  cov: '#6c7086',
  cur: '#313244',      // cursor row inside a navy well
  green: '#a6e3a1',
  teal: '#94e2d5',
  peach: '#fab387',
  blue: '#89b4fa',
  mauve: '#cba6f7',
  yellow: '#f9e2af',
  red: '#f38ba8',
};

// win-55-ui beta-0.8.0, src/palette.css and the panel and indent borders.
export const WIN55 = {
  win: '#CBCBCB',
  inset: '#FFFFFF',
  btn: '#CBCBCB',
  sel: '#000080',
  hi: '#FFFFFF',
  lo: '#555555',
  dark: '#BFBFBF',
  text: '#000000',
  bright: '#000000',
  dim: '#555555',
  cb: '#FFFFFF',
  crust: '#999999',
  ct: '#000000',
  cs: '#555555',
  csurf: '#CBCBCB',
  cov: '#555555',
  cur: '#BFBFBF',
  green: '#005500',
  teal: '#006666',
  peach: '#AA5500',
  blue: '#0000AA',
  mauve: '#AA00AA',
  yellow: '#FFFF55',
  red: '#AA0000',
  track: '#999999',
};

export let C = DEFAULT;
