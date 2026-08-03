const fs = require('fs');
let code = fs.readFileSync('src/init.ts', 'utf8');

const regex = /document\.querySelectorAll\('\.nav-item\[data-panel\]'\)\.forEach\(btn => \{\s*btn\.addEventListener\('click', \(\) => showPanel\((?:btn as any)?(?:<any>btn)?(?:btn as HTMLElement)?\.dataset\.panel, btn\)\);\s*\}\);/g;

// I'll just do string replacement of the specific line:
code = code.replace(
  "btn.addEventListener('click', () => showPanel(btn.dataset.panel, btn));",
  `btn.addEventListener('click', () => {
      const b = btn as HTMLElement;
      if (b.dataset.panel === 'study') {
        if (typeof (window as any).goHome === 'function') {
          (window as any).goHome();
          return;
        }
      }
      showPanel(b.dataset.panel, btn);
    });`
);

fs.writeFileSync('src/init.ts', code);
