const fs = require('fs');

const getGameIconCode = `const getGameIcon = (game: string) => {
    switch(game) {
      case "MINECRAFT": return "⛏️";
      case "VALHEIM": return "⛵";
      case "ENSHROUDED": return "🔥";
      case "ZOMBOID": return "🧟";
      case "ARK": return "🦖";
      case "TERRARIA": return "🌳";
      case "PALWORLD": return "🦊";
      case "RUST": return "⚙️";
      case "SATISFACTORY": return "🏭";
      case "VRISING": return "🦇";
      case "WINDROSE": return "⚔️";
      default: return "🎮";
    }
  };`;

const files = [
  'src/components/ConfigEditorView.tsx',
  'src/components/DashboardView.tsx',
  'src/components/dashboard/VaultSection.tsx'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  // Find the getGameIcon function block
  const blockRegex = /const getGameIcon = \(game: string\) => {[\s\S]*?default: return "🎮";\s*}\s*};/g;
  content = content.replace(blockRegex, getGameIconCode);
  fs.writeFileSync(file, content);
}
