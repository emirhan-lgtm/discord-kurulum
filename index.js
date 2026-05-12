require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    PermissionsBitField
} = require("discord.js");

const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("v9.db");

// =====================================================
// CLIENT
// =====================================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// =====================================================
// DB
// =====================================================
db.run(`CREATE TABLE IF NOT EXISTS modlog (guild_id TEXT PRIMARY KEY, channel_id TEXT)`);

db.run(`CREATE TABLE IF NOT EXISTS levels (
    guild_id TEXT,
    user_id TEXT,
    messages INTEGER DEFAULT 0,
    level INTEGER DEFAULT 0
)`);

db.run(`CREATE TABLE IF NOT EXISTS level_settings (
    guild_id TEXT,
    level INTEGER,
    required_messages INTEGER
)`);

db.run(`CREATE TABLE IF NOT EXISTS level_roles (
    guild_id TEXT,
    level INTEGER,
    role_id TEXT
)`);

// =====================================================
// EMBED
// =====================================================
function UI(title, desc, color = 0x2b2d31) {
    return new EmbedBuilder()
        .setTitle(`✨ ${title}`)
        .setDescription(desc)
        .setColor(color)
        .setTimestamp();
}

// =====================================================
// dnd
// =====================================================

client.on("ready", () => {
    console.log(`🟢 V9 PRO AKTİF: ${client.user.tag}`);

    // ===== DND STATUS =====
    client.user.setPresence({
        status: "dnd", // online | idle | dnd | invisible
        activities: [
            {
                name: "V9 PRO SYSTEM",
                type: 0 // PLAYING
            }
        ]
    });
});

// =====================================================
// MODLOG ENGINE
// =====================================================
function sendLog(guild, embed) {

    if (!guild) return;

    db.get(`SELECT channel_id FROM modlog WHERE guild_id=?`, [guild.id], (err, row) => {

        if (!row) return;

        const ch = guild.channels.cache.get(row.channel_id);
        if (!ch) return;

        ch.send({ embeds: [embed] }).catch(() => {});
    });
}

// =====================================================
// READY
// =====================================================
client.on("ready", () => {
    console.log(`🟢 V9 PRO AKTİF: ${client.user.tag}`);
});

// =====================================================
// MESSAGE XP SYSTEM (LEVEL ENGINE)
// =====================================================
client.on("messageCreate", async msg => {

    if (!msg.guild || msg.author.bot) return;

    const g = msg.guild;
    const u = msg.author;

    db.get(
        `SELECT * FROM levels WHERE guild_id=? AND user_id=?`,
        [g.id, u.id],
        (err, row) => {

            let messages = row?.messages || 0;
            let level = row?.level || 0;

            messages++;

            db.get(
                `SELECT required_messages FROM level_settings WHERE guild_id=? AND level=?`,
                [g.id, level + 1],
                async (e, lvlData) => {

                    const req = lvlData?.required_messages;

                    // LEVEL UP
                    if (req && messages >= req) {

                        level++;
                        messages = 0;

                        // ROLE GIVE
                        db.get(
                            `SELECT role_id FROM level_roles WHERE guild_id=? AND level=?`,
                            [g.id, level],
                            async (e2, roleRow) => {

                                if (roleRow) {
                                    const role = g.roles.cache.get(roleRow.role_id);
                                    if (role) {
                                        const member = await g.members.fetch(u.id);
                                        member.roles.add(role).catch(() => {});
                                    }
                                }

                                msg.channel.send({
                                    embeds: [
                                        UI("🎉 LEVEL UP", `${u} artık **Level ${level}** oldu!`, 0xf1c40f)
                                    ]
                                });
                            }
                        );
                    }

                    db.run(
                        `REPLACE INTO levels VALUES (?,?,?,?)`,
                        [g.id, u.id, messages, level]
                    );
                }
            );
        }
    );
});

// =====================================================
// INTERACTIONS
// =====================================================
client.on("interactionCreate", async i => {

    if (!i.isChatInputCommand()) return;
    const g = i.guild;
    const u = i.user;

    // =====================================================
    // MODLOG SET
    // =====================================================
    if (i.commandName === "modlog") {

        const channel = i.options.getChannel("kanal");

        db.run(
            `REPLACE INTO modlog VALUES (?,?)`,
            [g.id, channel.id]
        );

        i.reply({
            embeds: [UI("ModLog", `Kanal ayarlandı: ${channel}`, 0x5865F2)],
            ephemeral: true
        });
    }

    // =====================================================
    // BAN
    // =====================================================
    if (i.commandName === "ban") {

        const user = i.options.getUser("kullanıcı");
        const reason = i.options.getString("sebep");

        const member = await g.members.fetch(user.id);
        await member.ban({ reason });

        sendLog(g,
            UI("🔨 BAN", `${user.tag}\nSebep: ${reason}`, 0xe74c3c)
        );

        i.reply({ embeds: [UI("Ban", "Kullanıcı banlandı", 0xe74c3c)], ephemeral: true });
    }

    // =====================================================
    // UNBAN (FIXED)
    // =====================================================
    if (i.commandName === "unban") {

        const id = i.options.getString("id");

        try {
            await g.members.unban(id);

            sendLog(g,
                UI("🔓 UNBAN", `ID: ${id}`, 0x2ecc71)
            );

            i.reply({ embeds: [UI("Unban", "Ban kaldırıldı", 0x2ecc71)], ephemeral: true });

        } catch {
            i.reply({ embeds: [UI("Hata", "Kullanıcı banlı değil", 0xe74c3c)], ephemeral: true });
        }
    }

    // =====================================================
    // KICK
    // =====================================================
    if (i.commandName === "kick") {

        const user = i.options.getUser("kullanıcı");
        const reason = i.options.getString("sebep");

        const member = await g.members.fetch(user.id);
        await member.kick(reason);

        sendLog(g,
            UI("👢 KICK", `${user.tag}\nSebep: ${reason}`, 0xf39c12)
        );

        i.reply({ embeds: [UI("Kick", "Kullanıcı atıldı", 0xf39c12)], ephemeral: true });
    }

    // =====================================================
    // LEVEL ROLE SET
    // =====================================================
    if (i.commandName === "seviye_rol_ayarla") {

        const level = i.options.getInteger("seviye");
        const role = i.options.getRole("rol");

        db.run(
            `REPLACE INTO level_roles VALUES (?,?,?)`,
            [g.id, level, role.id]
        );

        i.reply({
            embeds: [UI("Level Rol", `Seviye ${level} → ${role}`, 0x2ecc71)],
            ephemeral: true
        });
    }

    // =====================================================
    // LEVEL THRESHOLD SET
    // =====================================================
    if (i.commandName === "seviye_mesaj_ayarla") {

        const level = i.options.getInteger("seviye");
        const msgCount = i.options.getInteger("mesaj");

        db.run(
            `REPLACE INTO level_settings VALUES (?,?,?)`,
            [g.id, level, msgCount]
        );

        i.reply({
            embeds: [UI("Level Ayar", `Seviye ${level} = ${msgCount} mesaj`, 0x3498db)],
            ephemeral: true
        });
    }

    // =====================================================
    // DUYURU (REQUESTED FINAL VERSION)
    // =====================================================
    if (i.commandName === "duyuru") {

        const channel = i.options.getChannel("kanal");
        const baslik = i.options.getString("baslik");
        const mesaj = i.options.getString("mesaj");
        const etiket = i.options.getRole("etiket");

        channel.send({
            content: etiket ? `${etiket}` : null,
            embeds: [
                UI(`📢 ${baslik}`, mesaj, 0x5865F2)
            ]
        });

        i.reply({
            content: "Duyuru gönderildi",
            ephemeral: true
        });
    }
});

// =====================================================
// LOGIN
// =====================================================
client.login(process.env.TOKEN);