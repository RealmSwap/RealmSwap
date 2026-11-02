-- Official realm seed (generated 2026-11-02 by scripts/generate-official-realm-seed.mjs)
-- "RealmSwap Official" starter shelf: the most popular packs on CurseForge and
-- Modrinth as one-click v2 realms. seller_id NULL = platform-official; the
-- publish guard exempts NULL-uid (trusted migration) contexts, which is why
-- verified_level OFFICIAL can be set here when no client can.
-- Deploys of these realms run the verified pipeline (snapshot → boot test →
-- rollback) client-side; OFFICIAL means "curated source", the boot test is
-- the per-install verification.
-- Idempotent: the WHERE NOT EXISTS guard on the deterministic slug makes this
-- safe to re-run.

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-rlcraft-cf285109', 'RLCraft', 'A modpack specially designed to bring an incredibly hardcore and semi-realism challenge revolving around survival, RPG elements, and adventure-like exploration.', 'MINECRAFT',
       array['Minecraft','CurseForge','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"curseforge","projectId":"285109"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-rlcraft-cf285109');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-all-the-mods-10-atm10-cf925200', 'All the Mods 10 - ATM10', 'The top pack of 2026 with around 500 mods! Tons of quests and a proper endgame. ', 'MINECRAFT',
       array['Minecraft','CurseForge','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"curseforge","projectId":"925200"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-all-the-mods-10-atm10-cf925200');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-the-pixelmon-modpack-cf389615', 'The Pixelmon Modpack', 'This is a Modpack designed to give players an easy time getting started.', 'MINECRAFT',
       array['Minecraft','CurseForge','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"curseforge","projectId":"389615"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-the-pixelmon-modpack-cf389615');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-better-mc-forge-bmc4-cf876781', 'Better MC [FORGE] BMC4', 'Version 1.20.1 | A Proper Vanilla+ Modpack | Don''t play Vanilla play this!', 'MINECRAFT',
       array['Minecraft','CurseForge','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"curseforge","projectId":"876781"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-better-mc-forge-bmc4-cf876781');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-all-the-mods-9-atm9-cf715572', 'All the Mods 9 - ATM9', 'ATM9 has over 400 mods loaded and countless quests and a built in proper endgame. Can you craft the ATM Star? Do you dare take on the Gregstar?', 'MINECRAFT',
       array['Minecraft','CurseForge','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"curseforge","projectId":"715572"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-all-the-mods-9-atm9-cf715572');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-prominence-ii-hasturian-era-cf466901', 'Prominence™ II: Hasturian Era', 'Lore-rich RPG | Explore the Kingdom of Vaaz with voiced NPCs, a custom Questing System, Custom Gear, Bosses, Talent Tree and more!', 'MINECRAFT',
       array['Minecraft','CurseForge','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"curseforge","projectId":"466901"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-prominence-ii-hasturian-era-cf466901');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-skyfactory-4-cf296062', 'SkyFactory 4', 'The ultimate skyblock modpack! Watch development at: darkosto.tv/SkyFactoryLive', 'MINECRAFT',
       array['Minecraft','CurseForge','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"curseforge","projectId":"296062"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-skyfactory-4-cf296062');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-dawncraft-echoes-of-legends-cf829758', 'DawnCraft - Echoes of Legends', 'Souls-like RPG modpack w/ Unique Questing System!', 'MINECRAFT',
       array['Minecraft','CurseForge','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"curseforge","projectId":"829758"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-dawncraft-echoes-of-legends-cf829758');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-all-the-mods-8-atm8-cf520914', 'All the Mods 8 - ATM8', 'Over 350 mods with quests and shaders on the 1.19.2 version of MC. ', 'MINECRAFT',
       array['Minecraft','CurseForge','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"curseforge","projectId":"520914"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-all-the-mods-8-atm8-cf520914');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-deceasedcraft-urban-zombie-apocalypse-cf490660', 'DeceasedCraft - Urban Zombie Apocalypse', 'Explore, loot and shoot your way through cities overrun by the infected in this zombie apocalypse modpack. Master the tech tree, craft better and stronger equipment, and eventually brave the radioactive Wasteland to find the cure.', 'MINECRAFT',
       array['Minecraft','CurseForge','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"curseforge","projectId":"490660"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-deceasedcraft-urban-zombie-apocalypse-cf490660');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-cursed-walking-a-modern-zombie-apocalypse-cf682001', 'Cursed Walking - A Modern Zombie Apocalypse', 'A fully fledged zombie apocalypse modpack for the newest versions of Minecraft.', 'MINECRAFT',
       array['Minecraft','CurseForge','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"curseforge","projectId":"682001"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-cursed-walking-a-modern-zombie-apocalypse-cf682001');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-fabulously-optimized-cf396246', 'Fabulously Optimized', 'Beautiful graphics, speedy performance and familiar features in a simple package. Wilderness Bound beta!', 'MINECRAFT',
       array['Minecraft','CurseForge','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"curseforge","projectId":"396246"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-fabulously-optimized-cf396246');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-better-mc-fabric-bmc1-cf452013', 'Better MC [FABRIC] BMC1', 'Version 1.19.2 | A Proper Vanilla+ Modpack | Don''t play Vanilla play this!', 'MINECRAFT',
       array['Minecraft','CurseForge','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"curseforge","projectId":"452013"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-better-mc-fabric-bmc1-cf452013');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-roguelike-adventures-and-dungeons-cf289267', 'Roguelike Adventures and Dungeons', 'Exploration-based rogue-like modpack with Quests, Character and Tools Leveling, tons of new structures, Twilight Forest, Aether, The Betweenlands, Tropicraft, Cavern, Beneath dimension and more!', 'MINECRAFT',
       array['Minecraft','CurseForge','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"curseforge","projectId":"289267"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-roguelike-adventures-and-dungeons-cf289267');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-sevtech-ages-cf268208', 'SevTech: Ages', 'The ultimate advanced progression modpack! Watch development at: darkosto.tv/SevTechLive', 'MINECRAFT',
       array['Minecraft','CurseForge','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"curseforge","projectId":"268208"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-sevtech-ages-cf268208');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-ftb-presents-skyfactory-3-cf256183', 'FTB Presents SkyFactory 3', 'It''s skyblock like you''ve never seen it before!', 'MINECRAFT',
       array['Minecraft','CurseForge','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"curseforge","projectId":"256183"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-ftb-presents-skyfactory-3-cf256183');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-all-the-mods-6-atm6-cf381671', 'All the Mods 6 - ATM6', 'HUGE 1.16.5  Modpack. Can you get to the Creative items by making the "ATM Star"? ', 'MINECRAFT',
       array['Minecraft','CurseForge','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"curseforge","projectId":"381671"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-all-the-mods-6-atm6-cf381671');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-cave-horror-project-1-best-horror-modpack-with-quests-cf952976', 'Cave Horror Project 1 - Best Horror Modpack with Quests!', 'Forge 1.20.1 | Chapter 6 is now out! | Best horror modpack with quests! PLAY NOW!', 'MINECRAFT',
       array['Minecraft','CurseForge','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"curseforge","projectId":"952976"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-cave-horror-project-1-best-horror-modpack-with-quests-cf952976');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-vault-hunters-third-edition-cf711537', 'Vault Hunters Third Edition', 'Action RPG in Minecraft! Level up, learn talents and abilities, build a base, build farms collect the 25 artifacts and defeat the final boss!', 'MINECRAFT',
       array['Minecraft','CurseForge','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"curseforge","projectId":"711537"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-vault-hunters-third-edition-cf711537');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-better-mc-forge-bmc1-cf429793', 'Better MC [FORGE] BMC1', 'Version  1.16.5 | A Proper Vanilla+ Modpack | Don''t play Vanilla play this!', 'MINECRAFT',
       array['Minecraft','CurseForge','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"curseforge","projectId":"429793"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-better-mc-forge-bmc1-cf429793');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-ftb-infinity-evolved-cf227724', 'FTB Infinity Evolved', 'Now Includes Quests! Infinity Evolved adds game modes!  Two modes are currently included; ''normal'' and ''expert''.  New and existing worlds are automatically in ''normal'' mode, to switch to the all-new game...', 'MINECRAFT',
       array['Minecraft','CurseForge','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"curseforge","projectId":"227724"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-ftb-infinity-evolved-cf227724');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-cobbleverse-pokemon-adventure-cobblemon-cf1210677', 'COBBLEVERSE - Pokemon Adventure [Cobblemon]', 'Start a true Pokémon adventure in Minecraft: Cobblemon 1.7.3 | ALL 1025 Pokémon! | ALL 93 Mega Evolutions | Gyms & Badges | Starter Kit | Unique Structures | Custom Music | Shaders | Optimized | So much more! [1.21.1]', 'MINECRAFT',
       array['Minecraft','CurseForge','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"curseforge","projectId":"1210677"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-cobbleverse-pokemon-adventure-cobblemon-cf1210677');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-cisco-s-fantasy-medieval-rpg-ultimate-cf957753', 'Cisco''s Fantasy Medieval RPG [Ultimate]', 'Explore a definitive medieval RPG experience featuring deep custom lore, powerful equipment and handcrafted quests , playable solo or with freinds.', 'MINECRAFT',
       array['Minecraft','CurseForge','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"curseforge","projectId":"957753"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-cisco-s-fantasy-medieval-rpg-ultimate-cf957753');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-stoneblock-cf290913', 'StoneBlock', 'Kinda like SkyBlock, except you don''t start with a tree and you''re surrounded by stone', 'MINECRAFT',
       array['Minecraft','CurseForge','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"curseforge","projectId":"290913"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-stoneblock-cf290913');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-mc-eternal-cf349129', 'MC  Eternal', 'Something for everyone I promise! Hybrid pack with some fun twists, Over 1000+ Quests and challenges to complete!', 'MINECRAFT',
       array['Minecraft','CurseForge','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"curseforge","projectId":"349129"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-mc-eternal-cf349129');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-zombie-invade-100-days-mr-l9m9tupn', 'Zombie Invade 100 Days', '僵尸入侵 100 天（高版本惊变重制）—— Same as Forge Labs 100 Days Zombie Apocalypse in new Minecraft', 'MINECRAFT',
       array['Minecraft','Modrinth','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"mrpack","projectId":"l9m9tuPN"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-zombie-invade-100-days-mr-l9m9tupn');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-cobblemon-official-modpack-fabric-mr-5ffgwnnp', 'Cobblemon Official Modpack [Fabric]', 'The official modpack of the Cobblemon mod, for Fabric!', 'MINECRAFT',
       array['Minecraft','Modrinth','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"mrpack","projectId":"5FFgwNNP"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-cobblemon-official-modpack-fabric-mr-5ffgwnnp');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-battlearmory-tacz-mr-rqixwlhb', 'BattleArmory TACZ', '厌倦了每次开局都是一样的钻石剑和弓？BattleArmory 让你每场重生都像开盲盒——400+ 现代枪械随机配发，从使命召唤的经典步枪到赛博朋克科幻杀器，配上 CS 经典地图和战术投掷物，开局就是 80 帧+丝滑刚枪。** 这不是模组体验卡，这是完全免费的 1.20.1 战术枪战整合包，下载启动，直接开战。', 'MINECRAFT',
       array['Minecraft','Modrinth','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"mrpack","projectId":"rQiXwLhB"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-battlearmory-tacz-mr-rqixwlhb');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-better-mc-fabric-bmc2-mr-shfhr8vx', 'Better MC [FABRIC] - BMC2', 'Version 1.20 | A Proper Vanilla+ Modpack | Don''t play Vanilla play this!', 'MINECRAFT',
       array['Minecraft','Modrinth','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"mrpack","projectId":"shFhR8Vx"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-better-mc-fabric-bmc2-mr-shfhr8vx');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-sodium-plus-mr-ch7uhy2j', 'Sodium Plus', 'A client-side optimization modpack with a few extra tweaks.', 'MINECRAFT',
       array['Minecraft','Modrinth','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"mrpack","projectId":"ch7UHY2J"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-sodium-plus-mr-ch7uhy2j');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-vanilla-perfected-mr-1ocgzrhv', 'Vanilla Perfected', 'A compilation of Vanilla Plus mods & packs to perfect the Minecraft experience without drifting too far from the feel of the base game!', 'MINECRAFT',
       array['Minecraft','Modrinth','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"mrpack","projectId":"1ocGzRHv"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-vanilla-perfected-mr-1ocgzrhv');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-slimes-adventure-mr-8ykzgjog', 'Slimes Adventure', 'Tensura: that time i got reincarnated as a slime modpack with many features', 'MINECRAFT',
       array['Minecraft','Modrinth','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"mrpack","projectId":"8yKzGJOG"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-slimes-adventure-mr-8ykzgjog');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-cobblemon-delta-mr-c9fchyz3', 'Cobblemon Delta', 'Pokemon Cobblemon Pack - QoL and Performance mods! The server included in the pack has Mega Evolution, Paradox Pokemon, Area Zero, Real Player Gyms, Raids, Dungeons, Pokemon Fishing!', 'MINECRAFT',
       array['Minecraft','Modrinth','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"mrpack","projectId":"C9FChyZ3"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-cobblemon-delta-mr-c9fchyz3');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-create-mr-t1toiuhz', 'Create+', 'A simple, optimized, Vanilla+ pack, with the special exception of Create (and its addons). Now with Create: Aeronautics!', 'MINECRAFT',
       array['Minecraft','Modrinth','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"mrpack","projectId":"t1tOiUHZ"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-create-mr-t1toiuhz');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-aged-mr-i4xhcd7q', 'Aged', 'realistic / medieval / progression based modpack for Fabric 1.20.1', 'MINECRAFT',
       array['Minecraft','Modrinth','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"mrpack","projectId":"i4XHCd7Q"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-aged-mr-i4xhcd7q');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-redstone-survival-optimization-mr-1fv3ghys', '红石生电优化【Redstone Survival Optimization】', '一个红石玩家必备的整合包，轻，快，小，是他的特点！A must-have integration package for a Redstone player, light, fast, and small, are his characteristics!', 'MINECRAFT',
       array['Minecraft','Modrinth','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"mrpack","projectId":"1Fv3GHYS"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-redstone-survival-optimization-mr-1fv3ghys');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-pokemon-elysium-mr-fgucz5nu', 'Pokemon Elysium', 'Modpack originally made for the Pokemon Elysium server, a Cobblemon-focused pack with hints of low-tech steampunk.', 'MINECRAFT',
       array['Minecraft','Modrinth','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"mrpack","projectId":"fgUCZ5nU"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-pokemon-elysium-mr-fgucz5nu');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-ardacraft-mr-x2bwrwhv', 'ArdaCraft', 'The modpack for the ArdaCraft server, a Lord of the Rings project re-creating J.R.R. Tolkien''s Middle-earth in Minecraft.', 'MINECRAFT',
       array['Minecraft','Modrinth','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"mrpack","projectId":"X2bWRWhV"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-ardacraft-mr-x2bwrwhv');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-landscapes-reimagined-genesis-mr-mdznsbka', 'Landscapes Reimagined Genesis', 'Dive into adventure with our mod pack! Explore Terralith, marvel at YUNG''s, MES, and MVS Structures; embrace the iconic Create mod and addons, pristine performance mods, embark on a captivating questline, and more!', 'MINECRAFT',
       array['Minecraft','Modrinth','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"mrpack","projectId":"MdznSbKA"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-landscapes-reimagined-genesis-mr-mdznsbka');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-realisticcraft-mr-7zbmp9ro', 'RealisticCraft', 'Taking Minecraft realism to the next level.', 'MINECRAFT',
       array['Minecraft','Modrinth','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"mrpack","projectId":"7zBMp9RO"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-realisticcraft-mr-7zbmp9ro');

insert into public.realms (seller_id, slug, name, description, game_slug, tags, payload, version, status, visibility, verified_level)
select null, 'official-backrooms-found-footage-mr-khwmgdke', 'Backrooms: Found Footage', 'The Best Backrooms Experience for Minecraft', 'MINECRAFT',
       array['Minecraft','Modrinth','Modpack','Official']::text[],
       '{"version":"2.0","mods":[],"configOverrides":[],"startupParams":{},"loader":null,"modpack":{"kind":"mrpack","projectId":"KHwMgdkE"}}'::jsonb, '1.0.0', 'PUBLISHED', 'PUBLIC', 'OFFICIAL'
where not exists (select 1 from public.realms where slug = 'official-backrooms-found-footage-mr-khwmgdke');
