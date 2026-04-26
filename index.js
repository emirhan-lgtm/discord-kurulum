const {
Client,
GatewayIntentBits,
SlashCommandBuilder,
Routes,
REST,
ActionRowBuilder,
ButtonBuilder,
ButtonStyle,
ModalBuilder,
TextInputBuilder,
TextInputStyle,
Events,
EmbedBuilder,
PermissionFlagsBits,
Partials
} = require("discord.js");

const fs = require("fs");
const express = require("express");
require("dotenv").config();

// ================= WEB SUNUCU (RAILWAY FIX) =================
const app = express();

app.get("/", (req, res) => {
res.send("Bot aktif ve çalışıyor");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
console.log(✅ Web sunucusu çalışıyor: ${PORT});
});

// ================= AYARLAR =================
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const YETKILI_ROL_ID = "1497222663708610630";
const LOG_KANAL_ID = "1497470961392418816";
const ADMIN_DM_ID = "1054405916209991740";

const TAG_ID = "1497222663708610630";

// ================= VERİ =================
let veri = [];

if (fs.existsSync("./data.json")) {
try {
veri = JSON.parse(fs.readFileSync("./data.json", "utf8"));
} catch {
veri = [];
}
}

function kaydet() {
fs.writeFileSync("./data.json", JSON.stringify(veri, null, 2));
}

// ================= BOT =================
const client = new Client({
intents: [
GatewayIntentBits.Guilds,
GatewayIntentBits.DirectMessages,
GatewayIntentBits.GuildMessages,
GatewayIntentBits.MessageContent
],
partials: [Partials.Channel]
});


// ================= KOMUTLAR =================
const commands = [
  new SlashCommandBuilder()
    .setName("ehliyet")
    .setDescription("Ehliyet panelini açar"),

  new SlashCommandBuilder()
    .setName("kayitlar")
    .setDescription("Kayıtları listeler")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("kayit_sil")
    .setDescription("Kayıt siler")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o =>
      o.setName("id").setDescription("Kayıt ID").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("duyuru")
    .setDescription("Duyuru gönderir")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o =>
      o.setName("mesaj").setDescription("Mesaj").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("mesaj_sil")
    .setDescription("Mesaj siler (max 100)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption(o =>
      o.setName("adet").setDescription("Silinecek mesaj").setRequired(true)
    )
];

// ================= DISCORD =================
const rest = new REST({ version: "10" }).setToken(TOKEN);

client.once("ready", async () => {
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
    body: commands
  });

  console.log("Bot aktif");

  setInterval(checkExpired, 60000);
});

// ================= PANEL =================
function panelEmbed() {
  return new EmbedBuilder()
    .setTitle("Ehliyet Paneli")
    .setColor("Blue")
    .setDescription("İşlem seç");
}

function panelButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("kayit_ac")
      .setLabel("📝 Kayıt Aç")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("kayit_list")
      .setLabel("📋 Kayıtlar")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("kayit_sil_btn")
      .setLabel("🗑️ Kayıt Sil")
      .setStyle(ButtonStyle.Danger)
  );
}

// ================= INTERACTION =================
client.on(Events.InteractionCreate, async interaction => {

  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === "ehliyet") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ content: "Yetkin yok", ephemeral: true });

      return interaction.reply({
        embeds: [panelEmbed()],
        components: [panelButtons()]
      });
    }

    if (interaction.commandName === "kayitlar") {
      return sendList(interaction, 0);
    }

    if (interaction.commandName === "kayit_sil") {
      const id = interaction.options.getString("id");

      db.kayitlar = db.kayitlar.filter(x => x.id !== id);
      saveDB();

      const embed = new EmbedBuilder()
        .setTitle("Kayıt Silindi")
        .setColor("Red")
        .setDescription(`ID: ${id}`);

      dmLog(embed);

      return interaction.reply("Silindi");
    }

    if (interaction.commandName === "duyuru") {
      const msg = interaction.options.getString("mesaj");

      const embed = new EmbedBuilder()
        .setTitle("📢 Duyuru")
        .setColor("Yellow")
        .setDescription(msg);

      interaction.channel.send({
        content: "@everyone",
        embeds: [embed]
      });

      return interaction.reply({ content: "Gönderildi", ephemeral: true });
    }

    if (interaction.commandName === "mesaj_sil") {
      const adet = interaction.options.getInteger("adet");

      if (adet > 100)
        return interaction.reply("Max 100");

      const silinen = await interaction.channel.bulkDelete(adet, true);

      return interaction.reply(`Silindi: ${silinen.size}`);
    }
  }

  // BUTTON
  if (interaction.isButton()) {

    if (interaction.customId === "kayit_ac") {
      const modal = new ModalBuilder()
        .setCustomId("kayit_modal")
        .setTitle("Kayıt Ekle");

      const user = new TextInputBuilder()
        .setCustomId("user")
        .setLabel("Kullanıcı")
        .setStyle(TextInputStyle.Short);

      const days = new TextInputBuilder()
        .setCustomId("days")
        .setLabel("Süre (gün)")
        .setStyle(TextInputStyle.Short);

      modal.addComponents(
        new ActionRowBuilder().addComponents(user),
        new ActionRowBuilder().addComponents(days)
      );

      return interaction.showModal(modal);
    }

    if (interaction.customId === "kayit_list") {
      return sendList(interaction, 0);
    }

    if (interaction.customId === "kayit_sil_btn") {
      const modal = new ModalBuilder()
        .setCustomId("sil_modal")
        .setTitle("Kayıt Sil");

      const id = new TextInputBuilder()
        .setCustomId("id")
        .setLabel("Kayıt ID")
        .setStyle(TextInputStyle.Short);

      modal.addComponents(
        new ActionRowBuilder().addComponents(id)
      );

      return interaction.showModal(modal);
    }
  }

  // MODAL
  if (interaction.isModalSubmit()) {

    if (interaction.customId === "kayit_modal") {
      const user = interaction.fields.getTextInputValue("user");
      const days = interaction.fields.getTextInputValue("days");

      if (isNaN(days))
        return interaction.reply({ content: "Sadece sayı gir", ephemeral: true });

      const id = Date.now().toString();

      db.kayitlar.push({
        id,
        user,
        expires: Date.now() + days * 86400000
      });

      saveDB();

      const embed = new EmbedBuilder()
        .setTitle("Kayıt Eklendi")
        .setColor("Green")
        .setDescription(`Kullanıcı: ${user}\nSüre: ${days} gün`);

      dmLog(embed);

      return interaction.reply({ content: "Eklendi", ephemeral: true });
    }

    if (interaction.customId === "sil_modal") {
      const id = interaction.fields.getTextInputValue("id");

      db.kayitlar = db.kayitlar.filter(x => x.id !== id);
      saveDB();

      const embed = new EmbedBuilder()
        .setTitle("Kayıt Silindi")
        .setColor("Red")
        .setDescription(`ID: ${id}`);

      dmLog(embed);

      return interaction.reply({ content: "Silindi", ephemeral: true });
    }
  }
});

// ================= LİSTE =================
function sendList(interaction, page) {
  const per = 5;
  const start = page * per;

  const data = db.kayitlar.slice(start, start + per);

  const embed = new EmbedBuilder()
    .setTitle("Kayıt Listesi")
    .setColor("Blue")
    .setDescription(
      data.map(x =>
        `ID: ${x.id} | ${x.user} | ${Math.floor((x.expires - Date.now()) / 60000)} dk`
      ).join("\n") || "Boş"
    );

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

// ================= SÜRE KONTROL =================
function checkExpired() {
  const now = Date.now();

  db.kayitlar.forEach(x => {
    if (x.expires < now) {

      const embed = new EmbedBuilder()
        .setTitle("Süre Doldu")
        .setColor("Yellow")
        .setDescription(`Kullanıcı: ${x.user}`);

      dmLog(embed);

      db.kayitlar = db.kayitlar.filter(k => k.id !== x.id);
      saveDB();
    }
  });
}

// ================= BOT =================
client.login(TOKEN);
