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

// ================= KOMUTLAR =================
const commands = [
  new SlashCommandBuilder()
    .setName("ehliyet")
    .setDescription("Ehliyet panelini açar"),

  new SlashCommandBuilder()
    .setName("kayitlar")
    .setDescription("Kayıtları sayfalı gösterir")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("kayit_sil")
    .setDescription("Kayıt sil")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("duyuru")
    .setDescription("Duyuru yap")
    .addStringOption(opt =>
      opt.setName("mesaj").setDescription("Mesaj").setRequired(true)
    )
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

// ================= PANEL =================
function panel() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("kayit_ac")
      .setLabel("📝 Kayıt Ekle")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("kayitlar_0")
      .setLabel("📋 Kayıtlar")
      .setStyle(ButtonStyle.Primary)
  );
}

// ================= SÜRE FORMAT =================
function formatSure(ms) {
  const dk = Math.floor(ms / 60000);
  const gun = Math.floor(dk / 1440);
  const saat = Math.floor((dk % 1440) / 60);
  const dakika = dk % 60;
  return `${gun}g ${saat}s ${dakika}dk`;
}

// ================= SAYFA =================
function getSayfa(page = 0) {
  const perPage = 10;

  const start = page * perPage;
  const list = kayitlar.slice(start, start + perPage);

  return new EmbedBuilder()
    .setColor("Purple")
    .setTitle("📋 Kayıtlar")
    .setDescription(
      list.length
        ? list.map((k, i) => {
            const kalan = (k.baslangic + k.sureGun * 86400000) - Date.now();
            return `**${start + i + 1}.** ${k.isim} | ${k.sureGun} gün | ${formatSure(kalan)}`;
          }).join("\n")
        : "Kayıt yok"
    )
    .setFooter({ text: `Sayfa ${page + 1}` });
}

// ================= BUTON =================
function pageButtons(page) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`prev_${page}`)
      .setLabel("◀")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`refresh_${page}`)
      .setLabel("🔄")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(`next_${page}`)
      .setLabel("▶")
      .setStyle(ButtonStyle.Secondary)
  );
}

// ================= EVENTS =================
client.on(Events.InteractionCreate, async (i) => {
  const yetki = i.member?.roles?.cache?.has(YETKILI_ROL_ID);

  // ================= /EHLİYET =================
  if (i.commandName === "ehliyet") {
    const embed = new EmbedBuilder()
      .setColor("Blue")
      .setTitle("👮 Ehliyet Sistemi");

    return i.reply({
      embeds: [embed],
      components: [panel()],
    });
  }

  // ================= KAYIT EKLE =================
  if (i.isButton() && i.customId === "kayit_ac") {
    const modal = new ModalBuilder()
      .setCustomId("kayit_modal")
      .setTitle("Kayıt Ekle");

    const isim = new TextInputBuilder()
      .setCustomId("isim")
      .setLabel("İsim")
      .setStyle(TextInputStyle.Short);

    const sure = new TextInputBuilder()
      .setCustomId("sure")
      .setLabel("Gün")
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

    if (isNaN(sure)) return i.reply({ content: "Sayı gir", ephemeral: true });

    kayitlar.push({
      isim,
      sureGun: Number(sure),
      baslangic: Date.now(),
    });

    return i.reply({ content: "Kayıt eklendi", ephemeral: true });
  }

  // ================= SAYFALI KAYITLAR =================
  if (i.customId?.startsWith("kayitlar_") || i.commandName === "kayitlar") {
    const page = 0;

    return i.reply({
      embeds: [getSayfa(page)],
      components: [pageButtons(page)],
      ephemeral: true,
    });
  }

  // ================= SAYFA BUTTON =================
  if (i.isButton()) {
    let [type, page] = i.customId.split("_");
    page = Number(page);

    const maxPage = Math.ceil(kayitlar.length / 10) - 1;

    if (type === "next") page++;
    if (type === "prev") page--;
    if (type === "refresh") page = page;

    if (page < 0) page = 0;
    if (page > maxPage) page = maxPage;

    return i.update({
      embeds: [getSayfa(page)],
      components: [pageButtons(page)],
    });
  }

  // ================= KAYIT SİL =================
  if (i.isButton() && i.customId === "kayit_sil") {
    const modal = new ModalBuilder()
      .setCustomId("sil_modal")
      .setTitle("Sil");

    const isim = new TextInputBuilder()
      .setCustomId("isim")
      .setLabel("İsim")
      .setStyle(TextInputStyle.Short);

    modal.addComponents(new ActionRowBuilder().addComponents(isim));

    return i.showModal(modal);
  }

  if (i.isModalSubmit() && i.customId === "sil_modal") {
    const isim = i.fields.getTextInputValue("isim");

    kayitlar = kayitlar.filter(k => k.isim !== isim);

    return i.reply({ content: "Silindi", ephemeral: true });
  }

  // ================= DUYURU =================
  if (i.commandName === "duyuru") {
    const msg = i.options.getString("mesaj");

    await i.channel.send({
      content: "@everyone",
      embeds: [
        new EmbedBuilder()
          .setColor("Yellow")
          .setTitle("📢 DUYURU")
          .setDescription(msg),
      ],
    });

    return i.reply({ content: "Gönderildi", ephemeral: true });
  }

  // ================= MESAJ SİL =================
  if (i.commandName === "mesaj_sil") {
    await i.reply({ content: "Sayı yaz (max 100)", ephemeral: true });

    const filter = m => m.author.id === i.user.id;

    const collector = i.channel.createMessageCollector({
      filter,
      max: 1,
      time: 15000,
    });

    collector.on("collect", async (msg) => {
      let count = Number(msg.content);
      if (count > 100) count = 100;

      const messages = await i.channel.messages.fetch({ limit: count });
      await i.channel.bulkDelete(messages, true);

      i.followUp({ content: "Silindi", ephemeral: true });
    });
  }
});

// ================= SÜRE =================
function checkSureler() {
  const now = Date.now();

  kayitlar = kayitlar.filter(k => {
    const bitis = k.baslangic + k.sureGun * 86400000;

    if (now > bitis) return false;
    return true;
  });
}

client.login(TOKEN);
