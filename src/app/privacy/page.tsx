import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen flex bg-[#030712] text-slate-100 font-sans selection:bg-accentPurple/30 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs text-mutedText hover:text-accentPurple font-semibold transition-colors mb-8"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Dashboard</span>
        </Link>

        <div className="mb-10">
          <h1 className="text-3xl font-extrabold text-white flex items-center gap-3">
            <Shield className="w-8 h-8 text-accentPurple" />
            Privacy Policy
          </h1>
          <p className="text-slate-400 mt-2 text-sm">Last updated: June 30, 2026</p>
        </div>

        <div className="space-y-8 text-slate-300 text-sm leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-white mb-3">1. Information We Collect</h2>
            <p>
              When you use RealmSwap, we collect information that you provide directly to us, including your account details (such as your name, email address, and authentication credentials). Because RealmSwap operates locally and manages game servers on your hardware, we also collect technical information regarding your server configurations, game saves, mods installed, and system performance metrics.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">2. How We Use Your Information</h2>
            <p>
              We use the information we collect primarily to provide, maintain, and improve the RealmSwap application. Specifically, your server data and configuration files are processed to enable features such as cloud backups (if configured), server migrations, and performance monitoring. Your authentication data is used to secure access to your personal GameVault dashboard.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">3. Data Storage and Security</h2>
            <p>
              The majority of your game server data, including save files and configuration files, is stored locally on your machine. Any data synced with our cloud services (such as backups or RealmSync archives) is encrypted in transit. However, remember that no method of transmission over the internet or method of electronic storage is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">4. Third-Party Services</h2>
            <p>
              RealmSwap interacts with third-party software including Docker, SteamCMD, and various game server binaries. We do not control the privacy practices of these third parties. Additionally, if you link your server to a cloud provider via our Host Link features, data will be transmitted to those providers in accordance with their respective privacy policies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">5. Data Retention</h2>
            <p>
              We retain your account information for as long as your account is active. Local server data is retained indefinitely on your machine unless manually deleted by you. Automated backups are rotated based on your configured snapshot intervals.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">6. Changes to This Privacy Policy</h2>
            <p>
              We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page. You are advised to review this Privacy Policy periodically for any changes.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
