const fs = require('fs');
let code = fs.readFileSync('src/init.ts', 'utf8');

const regex = /  if \(location\.hash\.startsWith\('#import='\)\) \{\s*const payload = location\.hash\.slice\(8\);\s*window\.location\.hash = '';\s*setTimeout\(\(\) => promptUrlImport\(payload\), 100\);\s*\}/;

const replacement = `  if (location.hash.startsWith('#import=')) {
    const payload = location.hash.slice(8);
    window.location.hash = '';
    setTimeout(() => promptUrlImport(payload), 100);
  }
  
  setTimeout(checkScheduledDecks, 1500);`;

if (regex.test(code)) {
  code = code.replace(regex, replacement);
  code += `\nfunction checkScheduledDecks() {
  const S = (window as any).S;
  if (!S || !S.decks) return;
  const today = new Date().toISOString().split('T')[0];
  const due = [];
  for (const id in S.decks) {
    const d = S.decks[id];
    if (d.scheduledDate && d.scheduledDate <= today) {
      due.push(d.name);
      // optionally clear the date so it doesn't alert tomorrow if they ignore it?
      // For now, let's leave it until they change it or delete it.
    }
  }
  if (due.length > 0) {
    alert(\`Reminder: It's time to study the following scheduled decks:\\n\\n\` + due.join('\\n'));
  }
}
Object.assign(window, { checkScheduledDecks });\n`;
  fs.writeFileSync('src/init.ts', code);
  console.log('Success HTML');
} else {
  console.log('Target HTML not found');
}
