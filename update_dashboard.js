const fs = require('fs');

let content = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

if (!content.includes('import { motion }')) {
  content = content.replace('"use client";', '"use client";\n\nimport { motion } from "framer-motion";');
}

const variants = `
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
};
`;

if (!content.includes('const containerVariants')) {
  content = content.replace('export default function DashboardView', variants + '\nexport default function DashboardView');
}

// Wrap the main containers
content = content.replace(
  '<div className="relative z-10 space-y-8 max-w-full">',
  '<motion.div className="relative z-10 space-y-8 max-w-full" variants={containerVariants} initial="hidden" animate="show">'
);

// We need to replace the closing tag of that div.
// Because it's tricky, we'll replace the exact blocks.
content = content.replace(
  '<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">',
  '<motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">'
);
content = content.replace(
  '</section>\n\n            {/* Error Message */}',
  '</motion.div>\n\n            {/* Error Message */}'
);

content = content.replace(
  '{errorMessage && (\n              <div',
  '{errorMessage && (\n              <motion.div variants={itemVariants}'
);
content = content.replace(
  '</button>\n              </div>\n            )}',
  '</button>\n              </motion.div>\n            )}'
);

content = content.replace(
  '            {/* Active Servers Hero Grid */}\n            <section>',
  '            {/* Active Servers Hero Grid */}\n            <motion.section variants={itemVariants}>'
);
content = content.replace(
  '              </div>\n            </section>\n            </div>',
  '              </div>\n            </motion.section>\n            </motion.div>'
);

content = content.replace(
  '            {/* Right Column: Server Health */}\n            <HealthSidebar',
  '            {/* Right Column: Server Health */}\n            <motion.div variants={itemVariants}>\n              <HealthSidebar'
);
content = content.replace(
  'find((s: any) => s.id === selectedServerId) || data.servers[0]} \n            />\n          </div>',
  'find((s: any) => s.id === selectedServerId) || data.servers[0]} \n            />\n            </motion.div>\n          </div>'
);

content = content.replace(
  '          {/* Vault and Feed Row */}\n          <div className="grid grid-cols-1 xl:grid-cols-[400px_1fr]',
  '          {/* Vault and Feed Row */}\n          <motion.div variants={itemVariants} className="grid grid-cols-1 xl:grid-cols-[400px_1fr]'
);
content = content.replace(
  '<ActivityFeed activityLogs={data.activityLogs} />\n          </div>',
  '<ActivityFeed activityLogs={data.activityLogs} />\n          </motion.div>'
);

fs.writeFileSync('src/components/DashboardView.tsx', content);
