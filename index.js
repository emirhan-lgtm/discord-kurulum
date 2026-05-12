require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder
} = require("discord.js");

const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("v8.db");

// =====================================================
// BOT CORE
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
// DATABASE
// =====================================================
db.run(`CREATE TABLE IF NOT EXISTS modlog (guild_id INTEGER PRIMARY KEY, channel_id INTEGER)`);
db.run(`CREATE TABLE IF NOT EXISTS afk (user_id INTEGER PRIMARY KEY, reason TEXT)`);

// =====================================================
// EMBED SYSTEM
// =====================================================
function UI(title, desc, color = 0x2b2d31) {
    return new EmbedBuilder()
        .setTitle(`✨ ${title}`)
        .setDescription(desc)
        .setColor(color)
        .setTimestamp();
}

// =====================================================
// SAFE LOG SYSTEM
// =====================================================
async function log(guild, title, desc, color) {

    if (!guild) return;

    db.get(`SELECT channel_id FROM modlog WHERE guild_id=?`, [guild.id], (err, row) => {
        if (!row) return;

        const ch = guild.channels.cache.get(row.channel_id);
        if (!ch) return;

        ch.send({ embeds: [UI(title, desc, color)] }).catch(() => {});
    });
}

// =====================================================
// READY
// =====================================================
client.on("ready", () => {
    console.log(`🟢 ${client.user.tag} V8 PRO FIXED AKTİF`);
});

// =====================================================
// MESSAGE SYSTEM (AFK + SAFETY)
// =====================================================
client.on("messageCreate", async msg => {

    if (!msg.guild || msg.author.bot) return;

    // AFK RETURN
    db.get(`SELECT reason FROM afk WHERE user_id=?`, [msg.author.id], (err, row) => {

        if (row) {
            db.run(`DELETE FROM afk WHERE user_id=?`, [msg.author.id]);

            msg.reply({
                embeds: [UI("AFK SONLANDI", "Artık aktif durumdasın", 0x2ecc71)]
            }).catch(() => {});
        }
    });

    // AFK MENTION
    msg.mentions.users.forEach(u => {

        db.get(`SELECT reason FROM afk WHERE user_id=?`, [u.id], (err, row) => {

            if (row) {
                msg.channel.send({
                    embeds: [
                        UI("💤 AFK",
                            `${u.tag}\nSebep: ${row.reason}`,
                            0x95a5a6
                        )
                    ]
                }).catch(() => {});
            }
        });
    });
});

// =====================================================
// INTERACTIONS
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

        try {
            const member = await g.members.fetch(user.id);
            await member.ban({ reason });
        } catch {
            return i.reply({ content: "Ban başarısız", ephemeral: true });
        }

        user.send({
            embeds: [
                UI("⛔ BANLANDIN", `Sunucu: ${g.name}\nSebep: ${reason}`, 0xe74c3c)
            ]
        }).catch(() => {});

        await log(g, "BAN LOG", `${user.tag} banlandı\nSebep: ${reason}`, 0xe74c3c);

        i.reply({ embeds: [UI("Ban", "Kullanıcı banlandı", 0xe74c3c)], ephemeral: true });
    }

    // =====================================================
    // UNBAN
    // =====================================================
    if (i.commandName === "unban") {

        const id = i.options.getString("id");

        try {
            const user = await client.users.fetch(id);
            await g.members.unban(user);

            i.reply({ embeds: [UI("Unban", "Ban kaldırıldı", 0x2ecc71)], ephemeral: true });

        } catch {
            i.reply({ content: "Geçersiz ID veya kullanıcı banlı değil", ephemeral: true });
        }
    }

    // =====================================================
    // KICK
    // =====================================================
    if (i.commandName === "kick") {

        const user = i.options.getUser("kullanıcı");
        const reason = i.options.getString("sebep");

        try {
            const member = await g.members.fetch(user.id);
            await member.kick(reason);
        } catch {
            return i.reply({ content: "Kick başarısız", ephemeral: true });
        }

        user.send({
            embeds: [UI("🚪 ATILDIN", `Sunucu: ${g.name}\nSebep: ${reason}`, 0xf39c12)]
        }).catch(() => {});

        await log(g, "KICK LOG", `${user.tag} atıldı`, 0xf39c12);

        i.reply({ embeds: [UI("Kick", "Kullanıcı atıldı", 0xf39c12)] });
    }

    // =====================================================
    // MODLOG
    // =====================================================
    if (i.commandName === "modlog") {

        const channel = i.options.getChannel("kanal");

        db.run(`REPLACE INTO modlog VALUES (?,?)`, [g.id, channel.id]);

        i.reply({
            embeds: [
                UI("ModLog", `Kanal ayarlandı: ${channel}`, 0x5865F2)
            ],
            ephemeral: true
        });
    }

    // =====================================================
    // AFK
    // =====================================================
    if (i.commandName === "afk") {

        const reason = i.options.getString("sebep");

        db.run(`REPLACE INTO afk VALUES (?,?)`, [u.id, reason]);

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

        if (amount < 1 || amount > 100)
            return i.reply({ content: "1-100 arası olmalı", ephemeral: true });

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

        const ch = i.options.getChannel("kanal");
        const title = i.options.getString("başlık");
        const msg = i.options.getString("mesaj");

        ch.send({ embeds: [UI(title, msg, 0x5865F2)] });

        i.reply({ content: "Duyuru gönderildi", ephemeral: true });
    }
});

// =====================================================
// LOGIN (SAFE)
// =====================================================
client.login(process.env.TOKEN).catch(err => {
    console.error("TOKEN HATASI:", err);
});