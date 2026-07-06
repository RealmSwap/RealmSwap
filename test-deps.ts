
import { ThunderstoreProvider } from "./src/lib/mods/providers/ThunderstoreProvider";
(async () => {
  const provider = new ThunderstoreProvider();
  // Call it once to fetch the cache
  await provider.search("pilgrim", "VALHEIM");
  const deps = await provider.resolveDependenciesFull("ctogle-Pilgrim", "latest", "VALHEIM");
  console.log("DEPS:", deps.map(d => d.packageId));
})();

