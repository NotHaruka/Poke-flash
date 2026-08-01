export interface GameThemeColors {
  isDark: boolean;
  bg: string;
  surface: string;
  surface2: string;
  surface3: string;
  border: string;
  border2: string;
  text: string;
  text2: string;
  text3: string;
  accent: string;
  accentDim: string;
}

export function getGameTheme(): GameThemeColors {
  const isDark = document.body.classList.contains('dark');
  const style = getComputedStyle(document.body);

  const getVar = (name: string, fallback: string) => {
    const val = style.getPropertyValue(name).trim();
    return val || fallback;
  };

  return {
    isDark,
    bg: getVar('--bg', isDark ? '#14141d' : '#FAF7F2'),
    surface: getVar('--surface', isDark ? '#1e1e2c' : '#F2EDE4'),
    surface2: getVar('--surface2', isDark ? '#28283a' : '#E8E0D3'),
    surface3: getVar('--surface3', isDark ? '#DDD4C5' : '#DDD4C5'),
    border: getVar('--border', isDark ? 'rgba(255,255,255,0.08)' : 'rgba(28,28,46,0.10)'),
    border2: getVar('--border2', isDark ? 'rgba(255,255,255,0.16)' : 'rgba(28,28,46,0.20)'),
    text: getVar('--text', isDark ? '#f0eef5' : '#1C1C2E'),
    text2: getVar('--text2', isDark ? '#cfcbdc' : '#3A3A52'),
    text3: getVar('--text3', isDark ? '#9d99b2' : '#6B6B8A'),
    accent: getVar('--accent', isDark ? '#e07048' : '#C4613A'),
    accentDim: getVar('--accent-dim', isDark ? 'rgba(224,112,72,0.15)' : 'rgba(196,97,58,0.12)'),
  };
}
