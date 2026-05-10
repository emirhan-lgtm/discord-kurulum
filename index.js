const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    PermissionFlagsBits 
} = require('discord.js');
const express = require("express");

// --- UPTIME SERVİSİ (7/24 Aktif Tutma) ---
const app = express();
app.get("/", (_, res) => res.send("Bot Kesintisiz Çalışıyor!"));
app.listen(3000);

// --- KONFİGÜRASYON ---
const TOKEN = process.env.TOKEN;
const YETKILI_ROL_ID = "1497222663708610630";
const LOG_KANAL_ID = "1497470961392418816";
const PREFIX = "/";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
});

client.on('ready', () => {
    console.log(`${client.user.tag} başarıyla başlatıldı!`);
});

// --- KOMUTLAR ---
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Log Kanalına Mesaj Gönderme Fonksiyonu
    const logGonder = (icerik) => {
        const kanal = client.channels.cache.get(LOG_KANAL_ID);
        if (kanal) {
            const logEmbed = new EmbedBuilder()
                .setColor("Grey")
                .setDescription(icerik)
                .setTimestamp();
            kanal.send({ embeds: [logEmbed] });
        }
    };

    // 1. YARDIM MENÜSÜ
    if (command === 'yardım') {
        const embed = new EmbedBuilder()
            .setTitle("📖 Komut Rehberi")
            .setColor("White")
            .addFields(
                { name: '🔒 Kanal Kilidi', value: '`/kilit` - Kanalı yazıya kapatır.', inline: true },
                { name: '🔓 Kilit Aç', value: '`/kilit-aç` - Kanalı yazıya açar.', inline: true },
                { name: '📢 Duyuru', value: '`/duyuru #kanal [mesaj]` - Duyuru yapar.', inline: false },
                { name: '✉️ DM Gönder', value: '`/dm @kullanıcı [mesaj]` - Bot ile mesaj atar.', inline: false }
            );
        message.channel.send({ embeds: [embed] });
    }

    // 2. KANAL KİLİTLEME (Yetkili Rolü Gerektirir)
    if (command === 'kilit') {
        if (!message.member.roles.cache.has(YETKILI_ROL_ID)) return message.reply("❌ Bu komutu sadece yetkililer kullanabilir.");
        
        await message.channel.permissionOverwrites.edit(message.guild.id, { SendMessages: false });
        message.reply("🔒 Kanal başarıyla kilitlendi.");
        logGonder(`🔐 **Kanal Kilidi:** ${message.channel} kanalı **${message.author.tag}** tarafından kilitlendi.`);
    }

    // 3. KANAL KİLİDİ AÇMA
    if (command === 'kilit-aç') {
        if (!message.member.roles.cache.has(YETKILI_ROL_ID)) return message.reply("❌ Bu komutu sadece yetkililer kullanabilir.");
        
        await message.channel.permissionOverwrites.edit(message.guild.id, { SendMessages: true });
        message.reply("🔓 Kanal tekrar yazıya açıldı.");
        logGonder(`🔓 **Kilit Açıldı:** ${message.channel} kanalı **${message.author.tag}** tarafından açıldı.`);
    }

    // 4. DM MESAJ SİSTEMİ
    if (command === 'dm') {
        if (!message.member.roles.cache.has(YETKILI_ROL_ID)) return;
        const hedef = message.mentions.users.first();
        const mesaj = args.slice(1).join(" ");
        
        if (!hedef || !mesaj) return message.reply("⚠️ Lütfen bir kullanıcı etiketleyin ve mesajınızı yazın.");

        hedef.send(`📩 **Yetkili Bildirimi:** ${mesaj}`)
            .then(() => {
                message.reply(`✅ Mesaj ${hedef.tag} kullanıcısına iletildi.`);
                logGonder(`✉️ **DM Log:** **${message.author.tag}**, ${hedef.tag} kullanıcısına mesaj gönderdi.`);
            })
            .catch(() => message.reply("❌ Kullanıcının DM kutusu kapalı olduğu için mesaj iletilemedi."));
    }

    // 5. DUYURU SİSTEMİ
    if (command === 'duyuru') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
        const kanal = message.mentions.channels.first();
        const duyuruMetni = args.slice(1).join(" ");
        
        if (!kanal || !duyuruMetni) return message.reply("⚠️ Kullanım: `/duyuru #kanal [mesaj]`");

        const embed = new EmbedBuilder()
            .setTitle("📢 Duyuru")
            .setDescription(duyuruMetni)
            .setColor("Blue")
            .setTimestamp();
        
        kanal.send({ embeds: [embed] });
        message.reply("✅ Duyuru paylaşıldı.");
    }
});

client.login(TOKEN);
