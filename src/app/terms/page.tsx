import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";

export default function TermsOfService() {
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
            <FileText className="w-8 h-8 text-accentPurple" />
            Terms of Service
          </h1>
          <p className="text-slate-400 mt-2 text-sm">Last updated: June 30, 2026</p>
        </div>

        <div className="space-y-8 text-slate-300 text-sm leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-white mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing and using RealmSwap (also referred to as GameVault), you accept and agree to be bound by the terms and provision of this agreement. In addition, when using these particular services, you shall be subject to any posted guidelines or rules applicable to such services. Any participation in this service will constitute acceptance of this agreement.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">2. Description of Service</h2>
            <p>
              RealmSwap provides a game server management platform that allows users to deploy, configure, and manage dedicated game servers on their local hardware or cloud providers. The service includes tools for backups, mod management, and configuration editing.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">3. User Responsibilities</h2>
            <p>
              Users are solely responsible for the hardware and network configurations required to run game servers deployed via RealmSwap. RealmSwap is not responsible for any hardware damage, data loss, or security breaches resulting from the operation of game servers or the exposure of local ports to the public internet (such as via UPnP).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">4. Intellectual Property</h2>
            <p>
              The RealmSwap platform, including its original content, features, and functionality, are owned by RealmSwap and are protected by international copyright, trademark, patent, trade secret, and other intellectual property or proprietary rights laws. This does not include the game server binaries, game assets, or mods managed through the platform, which remain the property of their respective creators and publishers.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">5. Disclaimer of Warranties</h2>
            <p>
              The service is provided on an "as is" and "as available" basis. RealmSwap makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">6. Limitation of Liability</h2>
            <p>
              In no event shall RealmSwap or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on RealmSwap's platform.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
