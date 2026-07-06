const fs = require('fs');
const path = require('path');

const files = [
  'src/components/MarketplaceView.tsx',
  'src/components/ModsView.tsx',
  'src/components/BackupsView.tsx',
  'src/components/ConfigEditorView.tsx',
  'src/components/SchedulesView.tsx',
  'src/components/ConsoleView.tsx',
  'src/components/AuditLogsView.tsx',
  'src/components/TeamView.tsx',
  'src/components/StorageView.tsx',
  'src/components/CreateServerView.tsx',
  'src/components/DefinitionEditor.tsx',
  'src/components/SyncClientView.tsx'
];

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.log(`Skipping missing file ${file}`);
    continue;
  }
  let content = fs.readFileSync(file, 'utf8');

  // 1. Replace the aside with SidebarNavigation
  // Also remove the wrapper div that might surround it if it's there
  const asideRegex = /<aside[\s\S]*?<\/aside>/;
  if (asideRegex.test(content)) {
    content = content.replace(asideRegex, '<SidebarNavigation user={user} />');
  }

  // 2. Add import for SidebarNavigation
  if (!content.includes('SidebarNavigation')) {
    content = content.replace(
      'import React',
      'import { SidebarNavigation } from "@/components/dashboard/SidebarNavigation";\nimport React'
    );
  } else if (!content.includes('import { SidebarNavigation }')) {
    content = content.replace(
      'import React',
      'import { SidebarNavigation } from "@/components/dashboard/SidebarNavigation";\nimport React'
    );
  }

  // 3. Replace the root div
  content = content.replace(
    /className="flex h-screen bg-bgDark text-white overflow-hidden font-sans"/g,
    'className="min-h-screen flex bg-[#030712] text-slate-100 font-sans selection:bg-accentPurple/30"'
  );
  content = content.replace(
    /className="flex min-h-screen bg-bgDark text-white overflow-hidden font-sans"/g,
    'className="min-h-screen flex bg-[#030712] text-slate-100 font-sans selection:bg-accentPurple/30"'
  );
  content = content.replace(
    /className="min-h-screen flex bg-background text-slate-100"/g, // for DefinitionEditor
    'className="min-h-screen flex bg-[#030712] text-slate-100 font-sans selection:bg-accentPurple/30"'
  );

  // 4. Swap old colors for new ones
  // We want to remove bg-bgDark and border-borderDark globally.
  // Wait, bg-bgDark on headers/mains should become transparent or slate-900/40
  // If the file has `<main className="flex-1 overflow-y-auto">`, replace it with the new dashboard style
  content = content.replace(
    /<main className="flex-1(?: flex flex-col)? overflow-y-auto">/g,
    '<div className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10"><main className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col gap-8">'
  );
  // Also we need to close that div at the bottom of the component!
  // This is tricky using regex. 
  // Let's NOT wrap main. Let's just swap colors.
  content = content.replace(/bg-bgDark/g, 'bg-transparent');
  content = content.replace(/border-borderDark/g, 'border-white/5');

  // Let's find specific containers like header and change their bg
  content = content.replace(/bg-transparent\/90/g, 'bg-slate-950/80');

  // Let's change definition editor isAdmin
  if (file.includes('DefinitionEditor.tsx')) {
    content = content.replace('<SidebarNavigation user={user} />', '<SidebarNavigation user={null} />');
  }
  if (file.includes('SyncClientView.tsx')) {
    content = content.replace('<SidebarNavigation user={user} />', '<SidebarNavigation user={null} />');
  }

  fs.writeFileSync(file, content);
  console.log(`Updated ${file}`);
}
