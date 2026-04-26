const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  Events,
  PermissionFlagsBits,
} = require("discord.js");

const express = require("express");
const app = express();
app.get("/", (_, res) => res.send("Bot aktif"));
app.listen(3000);

// ================= SABİTLER =================
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const YETKILI_ROL_ID = "1497222663708610630";
const LOG_KANAL_ID = "1497470961392418816";
const ADMIN_DM_ID = "1054405916209991740";
const TAG_ID = "1497222663708610630";

// ================= MEMORY =================
let kayitlar = []; 
// { userId, isim, sureGun, baslangic, yetkili }

// ================= CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ================= COMMANDS =================
const commands = [
  new SlashCommandBuilder()
    .setName("ehliyet")
    .setDescription("Ehliyet kayıt panelini açar"),

  new SlashCommandBuilder()
    .setName("kayitlar")
    .setDescription("Kayıtları listeler")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("kayit_sil")
    .setDescription("Kayıt sil")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(c => c.toJSON());

// ================= REGISTER =================
const rest = new REST({ version: "10" }).setToken(TOKEN);

client.once("ready", async () => {
  console.log("Bot aktif");

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );

  setInterval(checkSureler, 60 * 1000);
});

// ================= EHLIYET PANEL =================
function ehliyetPanel() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("kayit_ac")
      .setLabel("📝 Kayıt Ekle")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("kayit_list")
      .setLabel("📋 Kayıtlar")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("kayit_sil")
      .setLabel("🗑️ Kayıt Sil")
      .setStyle(ButtonStyle.Danger)
  );
}

// ================= EVENTS =================
client.on(Events.InteractionCreate, async (i) => {
  const member = i.member;
  const yetki = member?.roles?.cache?.has(YETKILI_ROL_ID);

  // ================= /EHLİYET =================
  if (i.commandName === "ehliyet") {
    if (!yetki) return i.reply({ content: "Yetkin yok", ephemeral: true });

    const embed = new EmbedBuilder()
      .setColor("Blue")
      .setTitle("👮 ## Ehliyet Kayıt")
      .setDescription("Aşağıdan işlem seçebilirsin.\n\n📝 Kayıt ekle\n📋 Kayıtları görüntüle\n🗑️ Kayıt sil");

    return i.reply({
      embeds: [embed],
      components: [ehliyetPanel()]
    });
  }

  // ================= KAYIT EKLE =================
  if (i.isButton() && i.customId === "kayit_ac") {
    const modal = new ModalBuilder()
      .setCustomId("kayit_modal")
      .setTitle("Kayıt Ekle");

    const isim = new TextInputBuilder()
      .setCustomId("isim")
      .setLabel("Personel Adı")
      .setStyle(TextInputStyle.Short);

    const sure = new TextInputBuilder()
      .setCustomId("sure")
      .setLabel("Süre (gün)")
      .setStyle(TextInputStyle.Short);

    modal.addComponents(
      new ActionRowBuilder().addComponents(isim),
      new ActionRowBuilder().addComponents(sure)
    );

    return i.showModal(modal);
  }

  if (i.isModalSubmit() && i.customId === "kayit_modal") {
    const isim = i.fields.getTextInputValue("isim");
    const sure = i.fields.getTextInputValue("sure");

    if (isNaN(sure)) {
      return i.reply({ content: "Süre sayı olmalı", ephemeral: true });
    }

    const data = {
      userId: i.user.id,
      isim,
      sureGun: Number(sure),
      baslangic: Date.now()
    };

    kayitlar.push(data);

    // DM LOG
    const dmEmbed = new EmbedBuilder()
      .setColor("Green")
      .setTitle("Kayıt Eklendi")
      .setDescription(`Personel: ${isim}`);

    client.users.fetch(ADMIN_DM_ID).then(u => u.send({ embeds: [dmEmbed] }));

    // CHANNEL LOG
    const logEmbed = new EmbedBuilder()
      .setColor("Green")
      .setTitle("Kayıt Eklendi")
      .addFields(
        { name: "Personel", value: isim },
        { name: "Süren", value: `${sure} gün` },
        { name: "Ekleyen", value: `<@${i.user.id}>` }
      );

    client.channels.fetch(LOG_KANAL_ID).then(c =>
      c.send({ content: `<@&${TAG_ID}>`, embeds: [logEmbed] })
    );

    return i.reply({ content: "Kayıt eklendi", ephemeral: true });
  }

  // ================= KAYIT LİSTE =================
  if (i.isButton() && i.customId === "kayit_list") {
    const embed = new EmbedBuilder()
      .setColor("Purple")
      .setTitle("📋 Kayıtlar")
      .setDescription(
        kayitlar.length
          ? kayitlar.map((k, i) => `**${i + 1}.** ${k.isim} - ${k.sureGun} gün`).join("\n")
          : "Kayıt yok"
      );

    return i.reply({ embeds: [embed], ephemeral: true });
  }

  // ================= KAYIT SİL =================
  if (i.isButton() && i.customId === "kayit_sil") {
    const modal = new ModalBuilder()
      .setCustomId("sil_modal")
      .setTitle("Kayıt Sil");

    const isim = new TextInputBuilder()
      .setCustomId("isim")
      .setLabel("Silinecek personel")
      .setStyle(TextInputStyle.Short);

    modal.addComponents(new ActionRowBuilder().addComponents(isim));

    return i.showModal(modal);
  }

  if (i.isModalSubmit() && i.customId === "sil_modal") {
    const isim = i.fields.getTextInputValue("isim");

    const silinen = kayitlar.find(k => k.isim === isim);
    kayitlar = kayitlar.filter(k => k.isim !== isim);

    const logEmbed = new EmbedBuilder()
      .setColor("Red")
      .setTitle("Kayıt Silindi")
      .addFields(
        { name: "Silinen", value: isim },
        { name: "Silen Yetkili", value: `<@${i.user.id}>` }
      );

    // LOG KANAL
    client.channels.fetch(LOG_KANAL_ID).then(c =>
      c.send({ content: `<@&${TAG_ID}>`, embeds: [logEmbed] })
    );

    // DM
    client.users.fetch(ADMIN_DM_ID).then(u =>
      u.send({ embeds: [logEmbed] })
    );

    return i.reply({ content: "Silindi", ephemeral: true });
  }
});

// ================= SÜRE KONTROL =================
function checkSureler() {
  const now = Date.now();

  kayitlar = kayitlar.filter(k => {
    const bitis = k.baslangic + (k.sureGun * 86400000);

    if (now > bitis) {
      const embed = new EmbedBuilder()
        .setColor("Yellow")
        .setTitle("Ehliyet Süresi Doldu")
        .addFields(
          { name: "Personel", value: k.isim },
          { name: "Kayıt tarihi", value: `<t:${Math.floor(k.baslangic / 1000)}:F>` }
        );

      client.channels.fetch(LOG_KANAL_ID).then(c =>
        c.send({ content: `<@&${TAG_ID}>`, embeds: [embed] })
      );

      client.users.fetch(ADMIN_DM_ID).then(u =>
        u.send({ embeds: [embed] })
      );

      return false;
    }

    return true;
  });
}

client.login(TOKEN);
