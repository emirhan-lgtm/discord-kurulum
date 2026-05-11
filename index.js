const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    PermissionFlagsBits, 
    AuditLogEvent 
} = require('discord.js');
const express = require("express");

const app = express();
app.get("/", (_, res) => res.send("Log Botu Aktif!"));
app.listen(3000);

// --- KONFİGÜRASYON ---
const TOKEN = process.env.TOKEN;
const PREFIX = "/";
let LOG_KANAL_ID = null; // Komutla ayarlanacak kanal

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences
    ],
});

client.on('ready', () => {
    console.log(`${client.user.tag} Tüm olayları loglamak için hazır!`);
});

// --- LOG GÖNDERME FONKSİYONU ---
const logHaberVer = (baslik, aciklama, renk = "Blue") => {
    if (!LOG_KANAL_ID) return;
    const kanal = client.channels.cache.get(LOG_KANAL_ID);
    if (kanal) {
        const embed = new EmbedBuilder()
            .setTitle(baslik)
            .setDescription(aciklama)
            .setColor(renk)
            .setTimestamp();
        kanal.send({ embeds: [embed] });
    }
};

// --- KOMUTLAR ---
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // /log_ayarla kanal:#kanal
    if (command === 'log_ayarla') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
        const kanal = message.mentions.channels.first();
        if (!kanal) return message.reply("⚠️ Lütfen bir kanal etiketle! Örn: `/log_ayarla #log-kanalı`");
        
        LOG_KANAL_ID = kanal.id;
        message.reply(`✅ Log kanalı başarıyla ${kanal} olarak ayarlandı. Artık her şey burada!`);
        logHaberVer("Sistem Aktif", "Loglama sistemi bu kanalda başlatıldı.", "Green");
    }
});

// --- TÜM OLAYLARI İZLEYEN EVENTLER ---

// 1. Üye Giriş
client.on('guildMemberAdd', (member) => {
    logHaberVer("📥 Üye Katıldı", `${member} sunucuya giriş yaptı.\n**Kullanıcı Adı:** ${member.user.tag}`, "Green");
});

// 2. Üye Çıkış
client.on('guildMemberRemove', (member) => {
    logHaberVer("📤 Üye Ayrıldı", `**${member.user.tag}** sunucudan ayrıldı veya atıldı.`, "Red");
});

// 3. Mesaj Silme
client.on('messageDelete', (message) => {
    if (message.author?.bot) return;
    logHaberVer("🗑️ Mesaj Silindi", `**Gönderen:** ${message.author}\n**Kanal:** ${message.channel}\n**Mesaj:** ${message.content || "İçerik yok (Görsel olabilir)"}`, "Orange");
});

// 4. Mesaj Düzenleme
client.on('messageUpdate', (oldMessage, newMessage) => {
    if (oldMessage.author?.bot || oldMessage.content === newMessage.content) return;
    logHaberVer("📝 Mesaj Düzenlendi", `**Gönderen:** ${oldMessage.author}\n**Eski:** ${oldMessage.content}\n**Yeni:** ${newMessage.content}`, "Yellow");
});

// 5. Ses Kanalı Hareketleri (Giriş/Çıkış/Değiştirme)
client.on('voiceStateUpdate', (oldState, newState) => {
    const member = newState.member;
    
    if (!oldState.channelId && newState.channelId) {
        logHaberVer("🎤 Sese Giriş", `${member} kullanıcısı **${newState.channel.name}** kanalına girdi.`, "Blue");
    } else if (oldState.channelId && !newState.channelId) {
        logHaberVer("🔇 Sesden Çıkış", `${member} kullanıcısı **${oldState.channel.name}** kanalından ayrıldı.`, "Grey");
    } else if (oldState.channelId !== newState.channelId) {
        logHaberVer("🔄 Kanal Değiştirdi", `${member} kullanıcısı **${oldState.channel.name}** -> **${newState.channel.name}** kanalına geçti.`, "Purple");
    }
});

// 6. Rol Değişiklikleri
client.on('guildMemberUpdate', (oldMember, newMember) => {
    const removedRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));
    const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));

    if (addedRoles.size > 0) {
        logHaberVer("🛡️ Rol Verildi", `${newMember} kullanıcısına **${addedRoles.map(r => r.name).join(", ")}** rolü verildi.`, "Aqua");
    }
    if (removedRoles.size > 0) {
        logHaberVer("🛡️ Rol Alındı", `${newMember} kullanıcısından **${removedRoles.map(r => r.name).join(", ")}** rolü alındı.`, "DarkRed");
    }
});

client.login(TOKEN);
