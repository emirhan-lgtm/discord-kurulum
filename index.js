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

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// SABİTLER
const YETKILI_ROL_ID = "1497222663708610630";
const LOG_KANAL_ID = "1497470961392418816";
const ADMIN_DM_ID = "1054405916209991740";
const TAG_ID = "1497222663708610630";

// MEMORY DB
let kayitlar = []; 
// { userId, isim, sureGun, baslangic }

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages],
  partials: []
});

// ---------------- COMMANDS ----------------
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

const rest = new REST({ version: "10" }).setToken(TOKEN);

client.once("ready", async () => {
  console.log("Bot aktif");

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );

  setInterval(checkSureler, 60 * 1000);
});

// ---------------- EHLIYET PANEL ----------------
function panel() {
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
      .setCustomId("kayit_sil_panel")
      .setLabel("🗑️ Kayıt Sil")
      .setStyle(ButtonStyle.Danger)
  );
}

// ---------------- EVENTS ----------------
client.on(Events.InteractionCreate, async (i) => {
  if (!i.isChatInputCommand() && !i.isButton() && !i.isModalSubmit()) return;

  const member = i.member;

  const yetki = member.roles?.cache?.has(YETKILI_ROL_ID);

  // ---------------- /ehliyet ----------------
  if (i.commandName === "ehliyet") {
    if (!yetki) return i.reply({ content: "Yetkin yok", ephemeral: true });

    const embed = new EmbedBuilder()
      .setTitle("Ehliyet Panel")
      .setColor("Blue");

    return i.reply({ embeds: [embed], components: [panel()] });
  }

  // ---------------- KAYIT EKLE MODAL ----------------
  if (i.isButton() && i.customId === "kayit_ac") {
    const modal = new ModalBuilder()
      .setCustomId("kayit_modal")
      .setTitle("Kayıt Ekle");

    const isim = new TextInputBuilder()
      .setCustomId("isim")
      .setLabel("Kullanıcı Adı")
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
      baslangic: Date.now()
    });

    const dm = new EmbedBuilder()
      .setColor("Green")
      .setTitle("Kayıt Eklendi")
      .setDescription(`${isim} eklendi`);

    client.users.fetch(ADMIN_DM_ID).then(u => u.send({ embeds: [dm] }));

    return i.reply({ content: "Kayıt eklendi", ephemeral: true });
  }

  // ---------------- KAYIT LİSTE ----------------
  if ((i.commandName === "kayitlar") || (i.isButton() && i.customId === "kayit_list")) {
    if (!yetki) return i.reply({ content: "Yetkin yok", ephemeral: true });

    const page = 0;
    const sayfa = kayitlar.slice(0, 5);

    const embed = new EmbedBuilder()
      .setTitle("Kayıtlar")
      .setColor("Purple")
      .setDescription(
        sayfa.map((k, idx) =>
          `**${idx + 1}.** ${k.isim} - ${k.sureGun} gün`
        ).join("\n") || "Boş"
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("prev").setLabel("◀").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("refresh").setLabel("🔄").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("next").setLabel("▶").setStyle(ButtonStyle.Secondary)
    );

    return i.reply({ embeds: [embed], components: [row], ephemeral: true });
  }

  // ---------------- KAYIT SİL ----------------
  if (i.commandName === "kayit_sil") {
    if (!yetki) return i.reply({ content: "Yetkin yok", ephemeral: true });

    const modal = new ModalBuilder()
      .setCustomId("sil_modal")
      .setTitle("Kayıt Sil");

    const isim = new TextInputBuilder()
      .setCustomId("isim")
      .setLabel("Silinecek isim")
      .setStyle(TextInputStyle.Short);

    modal.addComponents(new ActionRowBuilder().addComponents(isim));

    return i.showModal(modal);
  }

  if (i.isModalSubmit() && i.customId === "sil_modal") {
    const isim = i.fields.getTextInputValue("isim");

    kayitlar = kayitlar.filter(k => k.isim !== isim);

    const log = new EmbedBuilder()
      .setColor("Red")
      .setTitle("Kayıt Silindi")
      .setDescription(isim);

    client.channels.fetch(LOG_KANAL_ID).then(c =>
      c.send({ content: `<@&${TAG_ID}>`, embeds: [log] })
    );

    return i.reply({ content: "Silindi", ephemeral: true });
  }

  // ---------------- DUYURU ----------------
  if (i.commandName === "duyuru") {
    const modal = new ModalBuilder()
      .setCustomId("duyuru_modal")
      .setTitle("Duyuru");

    const msg = new TextInputBuilder()
      .setCustomId("msg")
      .setLabel("Mesaj")
      .setStyle(TextInputStyle.Paragraph);

    modal.addComponents(new ActionRowBuilder().addComponents(msg));

    return i.showModal(modal);
  }

  if (i.isModalSubmit() && i.customId === "duyuru_modal") {
    const msg = i.fields.getTextInputValue("msg");

    const embed = new EmbedBuilder()
      .setColor("Yellow")
      .setDescription(msg);

    await i.channel.send({ content: "@everyone", embeds: [embed] });

    return i.reply({ content: "Gönderildi", ephemeral: true });
  }

  // ---------------- MESAJ SİL ----------------
  if (i.commandName === "mesaj_sil") {
    const modal = new ModalBuilder()
      .setCustomId("msil")
      .setTitle("Mesaj Sil");

    const count = new TextInputBuilder()
      .setCustomId("count")
      .setLabel("Kaç mesaj (max 100)")
      .setStyle(TextInputStyle.Short);

    modal.addComponents(new ActionRowBuilder().addComponents(count));

    return i.showModal(modal);
  }

  if (i.isModalSubmit() && i.customId === "msil") {
    let count = Number(i.fields.getTextInputValue("count"));
    if (count > 100) count = 100;

    const messages = await i.channel.messages.fetch({ limit: count });

    await i.reply({ content: "Siliniyor..." });

    await i.channel.bulkDelete(messages, true);

    return i.followUp({
      content: "Tamamlandı",
      ephemeral: true
    });
  }
});

// ---------------- SÜRE KONTROL ----------------
function checkSureler() {
  const now = Date.now();

  kayitlar = kayitlar.filter(k => {
    const bitis = k.baslangic + (k.sureGun * 24 * 60 * 60 * 1000);

    if (now > bitis) {
      const log = new EmbedBuilder()
        .setColor("Yellow")
        .setTitle("Süre Bitti")
        .setDescription(k.isim);

      client.channels.fetch(LOG_KANAL_ID).then(c =>
        c.send({ content: `<@&${TAG_ID}>`, embeds: [log] })
      );

      client.users.fetch(ADMIN_DM_ID).then(u =>
        u.send({ embeds: [log] })
      );

      return false;
    }

    return true;
  });
}

client.login(TOKEN);
