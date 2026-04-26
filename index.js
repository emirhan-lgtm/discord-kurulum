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

// ================= CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ================= COMMANDS =================
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
    .setDescription("Kayıt sil")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("duyuru")
    .setDescription("Duyuru yap")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("mesaj_sil")
    .setDescription("Mesaj sil (max 100)")
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
      .setDescription("📝 Kayıt ekle\n📋 Kayıtları görüntüle\n🗑️ Kayıt sil");

    return i.reply({
      embeds: [embed],
      components: [ehliyetPanel()],
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

    kayitlar.push({
      userId: i.user.id,
      isim,
      sureGun: Number(sure),
      baslangic: Date.now(),
    });

    const embed = new EmbedBuilder()
      .setColor("Green")
      .setTitle("Kayıt Eklendi")
      .setDescription(`Personel: ${isim}`);

    client.channels.fetch(LOG_KANAL_ID).then(c =>
      c.send({ content: `<@&${TAG_ID}>`, embeds: [embed] })
    );

    client.users.fetch(ADMIN_DM_ID).then(u =>
      u.send({ embeds: [embed] })
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

    kayitlar = kayitlar.filter(k => k.isim !== isim);

    const embed = new EmbedBuilder()
      .setColor("Red")
      .setTitle("Kayıt Silindi")
      .addFields(
        { name: "Silinen", value: isim },
        { name: "Silen Yetkili", value: `<@${i.user.id}>` }
      );

    client.channels.fetch(LOG_KANAL_ID).then(c =>
      c.send({ content: `<@&${TAG_ID}>`, embeds: [embed] })
    );

    client.users.fetch(ADMIN_DM_ID).then(u =>
      u.send({ embeds: [embed] })
    );

    return i.reply({ content: "Silindi", ephemeral: true });
  }

  // ================= DUYURU =================
  if (i.commandName === "duyuru") {
    const modal = new ModalBuilder()
      .setCustomId("duyuru_modal")
      .setTitle("📢 Duyuru");

    const msg = new TextInputBuilder()
      .setCustomId("msg")
      .setLabel("Duyuru metni")
      .setStyle(TextInputStyle.Paragraph);

    modal.addComponents(new ActionRowBuilder().addComponents(msg));

    return i.showModal(modal);
  }

  if (i.isModalSubmit() && i.customId === "duyuru_modal") {
    const msg = i.fields.getTextInputValue("msg");

    const embed = new EmbedBuilder()
      .setColor("Yellow")
      .setTitle("📢 DUYURU")
      .setDescription(msg)
      .setFooter({ text: `Yetkili: ${i.user.tag}` });

    await i.channel.send({
      content: "@everyone",
      embeds: [embed],
    });

    return i.reply({ content: "Duyuru gönderildi", ephemeral: true });
  }

  // ================= MESAJ SİL =================
  if (i.commandName === "mesaj_sil") {
    if (!i.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return i.reply({ content: "Yetkin yok", ephemeral: true });
    }

    await i.reply({
      content: "Silinecek mesaj sayısını yaz (1-100):",
      ephemeral: true,
    });

    const filter = m => m.author.id === i.user.id;

    const collector = i.channel.createMessageCollector({
      filter,
      max: 1,
      time: 15000,
    });

    collector.on("collect", async (msg) => {
      let count = Number(msg.content);

      if (isNaN(count)) return msg.reply("Sayı gir.");

      if (count > 100) count = 100;

      const messages = await i.channel.messages.fetch({ limit: count });

      await i.followUp({ content: "Siliniyor...", ephemeral: true });

      await i.channel.bulkDelete(messages, true);

      await i.followUp({ content: "Mesajlar silindi ✔", ephemeral: true });
    });
  }
});

// ================= SÜRE KONTROL =================
function checkSureler() {
  const now = Date.now();

  kayitlar = kayitlar.filter(k => {
    const bitis = k.baslangic + k.sureGun * 86400000;

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
