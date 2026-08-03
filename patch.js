const fs = require('fs');
let code = fs.readFileSync('src/study.ts', 'utf8');

const target = `function markdownToHtml(md: string): string {
  if (!md) return '';
  
  // Escape HTML tags to prevent XSS
  let escaped = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  const blocks = escaped.split(/\\n\\n+/);
  const htmlBlocks = blocks.map(block => {
    const trimmed = block.trim();
    if (!trimmed) return '';
    
    // Check blocktypes
    // Headings
    if (trimmed.startsWith('### ')) {
      return \`<h3 style="font-size:15px;font-weight:600;margin:14px 0 6px;color:var(--text)">\${trimmed.slice(4)}</h3>\`;
    }
    if (trimmed.startsWith('## ')) {
      return \`<h2 style="font-size:17px;font-weight:600;margin:16px 0 8px;color:var(--text)">\${trimmed.slice(3)}</h2>\`;
    }
    if (trimmed.startsWith('# ')) {
      return \`<h1 style="font-size:20px;font-weight:600;margin:18px 0 10px;color:var(--text)">\${trimmed.slice(2)}</h1>\`;
    }
    
    // Horizontal Rule
    if (trimmed === '---') {
      return '<hr style="border:none;border-top:1px solid var(--border);margin:16px 0">';
    }
    
    // Blockquote
    if (trimmed.startsWith('&gt; ')) {
      const inlineParsed = parseInlineMarkdown(trimmed.slice(5));
      return \`<blockquote style="border-left:3px solid var(--accent);margin:8px 0;padding:6px 14px;color:var(--text2);background:var(--surface2);border-radius:0 var(--rs) var(--rs) 0">\${inlineParsed}</blockquote>\`;
    }
    
    // Lists (unordered/ordered)
    const lines = trimmed.split('\\n');
    const isUnordered = lines.every(line => line.trim().startsWith('- '));
    const isOrdered = lines.every(line => /^\\d+\\. /.test(line.trim()));
    
    if (isUnordered) {
      const listItems = lines.map(line => {
        const text = parseInlineMarkdown(line.trim().slice(2));
        return \`<li style="margin:3px 0;padding-left:4px">\${text}</li>\`;
      }).join('');
      return \`<ul style="padding-left:20px;margin:8px 0">\${listItems}</ul>\`;
    }
    
    if (isOrdered) {
      const listItems = lines.map(line => {
        const text = parseInlineMarkdown(line.trim().replace(/^\\d+\\. /, ''));
        return \`<li style="margin:3px 0;padding-left:4px">\${text}</li>\`;
      }).join('');
      return \`<ol style="padding-left:20px;margin:8px 0">\${listItems}</ol>\`;
    }
    
    // Default Paragraph
    const inlineParsed = parseInlineMarkdown(trimmed.replace(/\\n/g, '<br>'));
    return \`<p style="margin:6px 0;line-height:1.6">\${inlineParsed}</p>\`;
  });
  
  return htmlBlocks.join('');
}`;

const replacement = `function markdownToHtml(md: string): string {
  if (!md) return '';
  let escaped = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return marked.parse(escaped, { async: false }) as string;
}`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('src/study.ts', code);
  console.log("Success");
} else {
  console.log("Target not found");
}
