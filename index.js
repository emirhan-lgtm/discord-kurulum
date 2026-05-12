require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    PermissionsBitField
} = require("discord.js");

const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("v8.db");

// =====================================================
// BOT
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
db.run(`CREATE TABLE IF NOT EXISTS afk (user_id TEXT PRIMARY KEY, reason TEXT)`);

// =====================================================
// EMBED UI
// =====================================================
function UI(title, desc, color = 0x2b2d31) {
    return new EmbedBuilder()
        .setTitle(`✨ ${title}`)
        .setDescription(desc)
        .setColor(color)
        .setTimestamp();
}

// =====================================================
// MODLOG FIX ENGINE (KRİTİK DÜZELTME)
// =====================================================
async function log(guild, title, desc, color) {

    if (!guild) return;

    db.get(
        `SELECT channel_id FROM modlog WHERE guild_id=?`,
        [guild.id],
        (err, row) => {

            if (err || !row) return;

            const channel = guild.channels.cache.get(row.channel_id);
            if (!channel) return;

            channel.send({
                embeds: [UI(title, desc, color)]
            }).catch(() => {});
        }
    );
}

// =====================================================
// READY
// =====================================================
client.on("ready", () => {
    console.log(`🟢 ${client.user.tag} V8 PRO ONLINE`);
});

// =====================================================
// MESSAGE SYSTEM (AFK)
// =====================================================
client.on("messageCreate", async msg => {

    if (!msg.guild || msg.author.bot) return;

    // AFK RETURN
    db.get(`SELECT reason FROM afk WHERE user_id=?`, [msg.author.id], (e, row) => {
        if (!row) return;

        db.run(`DELETE FROM afk WHERE user_id=?`, [msg.author.id]);

        msg.reply({
            embeds: [UI("AFK SONLANDI", "Artık aktifsin", 0x2ecc71)]
        }).catch(() => {});
    });

    // AFK MENTION
    msg.mentions.users.forEach(user => {

        db.get(`SELECT reason FROM afk WHERE user_id=?`, [user.id], (e, row) => {

            if (!row) return;

            msg.channel.send({
                embeds: [
                    UI(
                        "💤 AFK",
                        `${user.tag}\nSebep: ${row.reason}`,
                        0x95a5a6
                    )
                ]
            }).catch(() => {});
        });
    });
});

// =====================================================
// COMMAND SYSTEM
// =====================================================
client.on("interactionCreate", async i => {

    if (!i.isChatInputCommand()) return;
    if (!i.guild) return;

    const g = i.guild;
    const u = i.user;

    // =====================================================
    // BAN
    // =====================================================
    if (i.commandName === "ban") {

        const user = i.options.getUser("kullanıcı");
        const reason = i.options.getString("sebep");

        const member = await g.members.fetch(user.id);
        await member.ban({ reason });

        await log(g,
            "🔨 BAN",
            `Kullanıcı: ${user.tag}\nSebep: ${reason}`,
            0xe74c3c
        );

        i.reply({
            embeds: [UI("Ban", "Kullanıcı banlandı", 0xe74c3c)],
            ephemeral: true
        });
    }

    // =====================================================
    // ❗ FIXED UNBAN (GERÇEK ÇALIŞAN)
    // =====================================================
    if (i.commandName === "unban") {

        const id = i.options.getString("id");

        try {
            const bans = await g.bans.fetch();
            const bannedUser = bans.get(id);

            if (!bannedUser) {
                return i.reply({
                    embeds: [UI("Unban", "Kullanıcı banlı değil", 0xe74c3c)],
                    ephemeral: true
                });
            }

            await g.members.unban(id);

            await log(g,
                "🔓 UNBAN",
                `ID: ${id}`,
                0x2ecc71
            );

            i.reply({
                embeds: [UI("Unban", "Ban kaldırıldı", 0x2ecc71)],
                ephemeral: true
            });

        } catch (err) {
            i.reply({
                embeds: [UI("Hata", "Unban işlemi başarısız", 0xe74c3c)],
                ephemeral: true
            });
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

        await log(g,
            "👢 KICK",
            `${user.tag} atıldı\nSebep: ${reason}`,
            0xf39c12
        );

        i.reply({ embeds: [UI("Kick", "Kullanıcı atıldı", 0xf39c12)], ephemeral: true });
    }

    // =====================================================
    // MODLOG AYAR
    // =====================================================
    if (i.commandName === "modlog") {

        const channel = i.options.getChannel("kanal");

        db.run(
            `REPLACE INTO modlog VALUES (?,?)`,
            [g.id, channel.id]
        );

        i.reply({
            embeds: [UI("ModLog", `Kanal: ${channel}`, 0x5865F2)],
            ephemeral: true
        });
    }

    // =====================================================
    // AFK
    // =====================================================
    if (i.commandName === "afk") {

        const reason = i.options.getString("sebep");

        db.run(
            `REPLACE INTO afk VALUES (?,?)`,
            [u.id, reason]
        );

        i.reply({
            embeds: [UI("AFK", reason, 0x3498db)],
            ephemeral: true
        });
    }

    // =====================================================
    // TEMİZLE
    // =====================================================
    if (i.commandName === "temizle") {

        const amount = i.options.getInteger("miktar");

        if (amount < 1 || amount > 100) {
            return i.reply({
                embeds: [UI("Hata", "1-100 arası olmalı", 0xe74c3c)],
                ephemeral: true
            });
        }

        await i.channel.bulkDelete(amount, true);

        i.reply({
            embeds: [UI("Temizlik", `${amount} mesaj silindi`, 0x95a5a6)],
            ephemeral: true
        });
    }

    // =====================================================
    // DUYURU
    // =====================================================
    if (i.commandName === "duyuru") {

        const channel = i.options.getChannel("kanal");
        const title = i.options.getString("başlık");
        const msg = i.options.getString("mesaj");

        channel.send({
            embeds: [UI(`📢 ${title}`, msg, 0x5865F2)]
        });

        i.reply({ content: "Duyuru gönderildi", ephemeral: true });
    }
});

// =====================================================
// LOGIN
// =====================================================
client.login(process.env.TOKEN);
