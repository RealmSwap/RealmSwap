const fs = require('fs');

const files = [
  'src/components/ModsView.tsx',
  'src/components/BackupsView.tsx',
  'src/components/TeamView.tsx',
  'src/components/AuditLogsView.tsx',
  'src/components/CreateServerView.tsx',
  'src/components/ConfigEditorView.tsx',
  'src/components/DashboardView.tsx'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');

  const lucideImportRegex = /import\s+\{([^}]+)\}\s+from\s+['"]lucide-react['"]/;
  const match = content.match(lucideImportRegex);
  if (match) {
    let imports = match[1];
    let toAdd = [];
    
    const words = imports.split(',').map(s => s.trim());
    
    if (!words.includes('Clock')) {
      toAdd.push('Clock');
    }
    if (!words.includes('Terminal')) {
      toAdd.push('Terminal');
    }
    
    if (toAdd.length > 0) {
      // Just append it before the end of the import block
      const newImports = imports + ',\n  ' + toAdd.join(',\n  ');
      content = content.replace(imports, newImports);
    }
  }

  const configLineRegex = /([ \t]*)\{\s*label:\s*["']Server Config["'][^}]+\},/;
  
  if (!content.includes('label: "Server Console"')) {
    content = content.replace(configLineRegex, (fullMatch, indent) => {
        return fullMatch + "\n" + indent + '{ label: "Server Console", icon: Terminal, href: "/dashboard/console" },\n' + indent + '{ label: "Schedules", icon: Clock, href: "/dashboard/schedules" },';
    });
  } else {
    // If it DOES have Server Console
    const consoleRegex = /([ \t]*)\{\s*label:\s*["']Server Console["'][^}]+\},/;
    content = content.replace(consoleRegex, (fullMatch, indent) => {
        return fullMatch + "\n" + indent + '{ label: "Schedules", icon: Clock, href: "/dashboard/schedules" },';
    });
  }

  fs.writeFileSync(file, content, 'utf8');
}
