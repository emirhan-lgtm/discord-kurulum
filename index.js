const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    PermissionFlagsBits, 
    REST, 
    Routes, 
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const express = require("express");

// --- UPTIME SERVİSİ ---
const app = express();
app.get("/", (_, res) => res.send("Slash Bot Aktif!"));
app.listen(3000);

// --- KONFİGÜRASYON ---
const TOKEN = process.env.TOKEN;
const CLIENT_ID = "process.env.CLIENT_ID"; // Botunun ID'sini buraya yazmalısın
let LOG_KANAL_ID = null; 

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
    ],
});

// --- SLASH KOMUTLARI TANIMLAMA ---
const commands = [
    new SlashCommandBuilder().setName('kanal_kilitle').setDescription('Kanalı yazıya kapatır').addChannelOption(opt => opt.setName('kanal').setDescription('Kilitlenecek kanal')),
    new SlashCommandBuilder().setName('kanal_olustur').setDescription('Yeni kanal açar').addStringOption(opt => opt.setName('isim').setDescription('Kanal adı').setRequired(true)),
    new SlashCommandBuilder().setName('duyuru').setDescription('Duyuru yapar').addChannelOption(opt => opt.setName('kanal').setDescription('Kanal seç').setRequired(true)).addStringOption(opt => opt.setName('mesaj').setDescription('Duyuru metni').setRequired(true)),
    new SlashCommandBuilder().setName('bilet_aktiflestir').setDescription('Ticket sistemini açar'),
    new SlashCommandBuilder().setName('afk').setDescription('AFK moduna geçer').addStringOption(opt => opt.setName('sebep').setDescription('Neden AFK?')),
    new SlashCommandBuilder().setName('anket').setDescription('Anket başlatır').addStringOption(opt => opt.setName('soru').setDescription('Anket sorusu').setRequired(true)),
    new SlashCommandBuilder().setName('anti_raid').setDescription('Saldırı koruması').addStringOption(opt => opt.setName('durum').setDescription('Aç veya Kapat').setRequired(true).addChoices({name:'Aç', value:'ac'}, {name:'Kapat', value:'kapat'})),
    new SlashCommandBuilder().setName('avatar').setDescription('Avatar gösterir').addUserOption(opt => opt.setName('kullanici').setDescription('Kullanıcı seç')),
    new SlashCommandBuilder().setName('ban').setDescription('Kullanıcıyı yasaklar').addUserOption(opt => opt.setName('kullanici').setDescription('Yasaklanacak kişi').setRequired(true)).addStringOption(opt => opt.setName('sebep').setDescription('Sebep')),
    new SlashCommandBuilder().setName('basvuru').setDescription('Başvuru formu açar'),
    new SlashCommandBuilder().setName('log_ayarla').setDescription('Olay log kanalını belirler').addChannelOption(opt => opt.setName('kanal').setDescription('Log kanalı').setRequired(true)),
].map(command => command.toJSON());

// --- KOMUTLARI DISCORD'A KAYDETME ---
const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
    try {
        console.log('Slash komutlar yükleniyor...');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('Slash komutlar başarıyla kaydedildi!');
    } catch (error) {
        console.error(error);
    }
})();

// --- LOG GÖNDERME FONKSİYONU ---
const logHaberVer = (baslik, aciklama, renk = "Blue") => {
    if (!LOG_KANAL_ID) return;
    const kanal = client.channels.cache.get(LOG_KANAL_ID);
    if (kanal) {
        const embed = new EmbedBuilder().setTitle(baslik).setDescription(aciklama).setColor(renk).setTimestamp();
        kanal.send({ embeds: [embed] });
    }
};

// --- KOMUT ÇALIŞTIRMA (INTERACTION) ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options } = interaction;

    if (commandName === 'log_ayarla') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply("Yetkin yok!");
        const kanal = options.getChannel('kanal');
        LOG_KANAL_ID = kanal.id;
        await interaction.reply(`✅ Log kanalı ${kanal} olarak ayarlandı.`);
    }

    if (commandName === 'kanal_kilitle') {
        const kanal = options.getChannel('kanal') || interaction.channel;
        await kanal.permissionOverwrites.edit(interaction.guild.id, { SendMessages: false });
        await interaction.reply(`🔒 ${kanal} kilitlendi.`);
        logHaberVer("Kanal Kilitlendi", `${interaction.user.tag} tarafından ${kanal} kilitlendi.`, "Red");
    }

    if (commandName === 'avatar') {
        const user = options.getUser('kullanici') || interaction.user;
        const embed = new EmbedBuilder().setTitle(`${user.tag} Avatarı`).setImage(user.displayAvatarURL({ size: 1024 }));
        await interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'afk') {
        const sebep = options.getString('sebep') || "Belirtilmedi";
        await interaction.reply(`💤 AFK modundasın: **${sebep}**`);
    }

    // Diğer komutları da bu şekilde (interaction.reply) mantığıyla buraya ekleyebilirsin.
});

// --- OLAY LOGLARI (Events) ---
client.on('guildMemberAdd', member => logHaberVer("📥 Giriş", `${member} geldi.`, "Green"));
client.on('guildMemberRemove', member => logHaberVer("📤 Çıkış", `${member.user.tag} ayrıldı.`, "Red"));
client.on('voiceStateUpdate', (oldS, newS) => {
    if (!oldS.channelId && newS.channelId) logHaberVer("🎤 Ses", `${newS.member} -> **${newS.channel.name}** giriş yaptı.`, "Aqua");
});

client.login(TOKEN);
    
