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
  PermissionFlagsBits
} = require("discord.js");

const fs      = require("fs");
const express = require("express");

// ================= WEB SERVER =================
const app = express();
app.get("/", (req, res) => res.send("Bot aktif"));
app.listen(3000, () => console.log("✅ Web server çalışıyor: port 3000"));

// ============================================================
//  DEĞİŞKENLER
// ============================================================
const TOKEN          = process.env.TOKEN;
const CLIENT_ID      = process.env.CLIENT_ID;
const GUILD_ID       = process.env.GUILD_ID;
const YETKILI_ROL_ID = "1497222663708610630";
const LOG_KANAL_ID   = "1497470961392418816";
const ADMIN_DM_ID    = "1054405916209991740";
const TAG_ID         = "<@&1497222663708610630>";
// ============================================================

// ================= VERİ =================
let data = [];
if (fs.existsSync("./data.json")) {
  try { data = JSON.parse(fs.readFileSync("./data.json", "utf8")); }
  catch { data = []; }
}

function kaydet() {
  fs.writeFileSync("./data.json", JSON.stringify(data, null, 2));
}

// ================= CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages
  ]
});

// ================= YARDIMCILAR =================
function yetkili(interaction) {
  return interaction.member?.roles?.cache?.has(YETKILI_ROL_ID) ?? false;
}

function kalanSure(bitisMs) {
  const kalan = bitisMs - Date.now();
  if (kalan <= 0) return "Süresi doldu";
  const dk = Math.floor(kalan / 60000);
  const sn = Math.floor((kalan % 60000) / 1000);
  if (dk >= 60) {
    const saat = Math.floor(dk / 60);
    const kdk  = dk % 60;
    return `${saat}s ${kdk}dk`;
  }
  return `${dk}dk ${sn}sn`;
}

async function adminDm(embed) {
  try {
    const u = await client.users.fetch(ADMIN_DM_ID);
    await u.send({ embeds: [embed] });
  } catch {}
}

async function logKanal(logEmbed) {
  try {
    const kanal = client.channels.cache.get(LOG_KANAL_ID);
    if (kanal) await kanal.send({ content: `<@${TAG_ID}>`, embeds: [logEmbed] });
  } catch {}
}

// ================= KAYITLAR EMBEDİ =================
const SAYFA_BASI = 5;

function kayitlarEmbed(sayfa = 0) {
  const aktif       = data.filter(x => x.bitis > Date.now());
  const toplamSayfa = Math.max(1, Math.ceil(aktif.length / SAYFA_BASI));
  sayfa = Math.min(Math.max(sayfa, 0), toplamSayfa - 1);

  const embed = new EmbedBuilder()
    .setTitle("🚗  Ehliyet Kayıt Listesi")
    .setColor(0xE8B800)
    .setFooter({ text: `Sayfa ${sayfa + 1} / ${toplamSayfa}  •  Toplam ${aktif.length} aktif kayıt` })
    .setTimestamp();

  const dilim = aktif.slice(sayfa * SAYFA_BASI, (sayfa + 1) * SAYFA_BASI);
  if (dilim.length === 0) {
    embed.setDescription("```\nAktif kayıt bulunmuyor.\n```");
  } else {
    embed.setDescription(
      dilim.map((x, i) => {
        const no = sayfa * SAYFA_BASI + i + 1;
        return `\`${String(no).padStart(2, "0")}\`  **${x.isim}**\n　　⏳ \`${kalanSure(x.bitis)}\``;
      }).join("\n\n")
    );
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`kayit_sayfa_${sayfa - 1}`)
      .setLabel("◀  Önceki")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(sayfa === 0),
    new ButtonBuilder()
      .setCustomId(`kayit_sayfa_${sayfa + 1}`)
      .setLabel("Sonraki  ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(sayfa >= toplamSayfa - 1),
    new ButtonBuilder()
      .setCustomId(`kayit_yenile_${sayfa}`)
      .setLabel("🔄  Yenile")
      .setStyle(ButtonStyle.Success)
  );

  return { embed, row };
}

// ================= KOMUTLAR =================
const commands = [

  new SlashCommandBuilder()
    .setName("ehliyet")
    .setDescription("Ehliyet panelini açar"),

  new SlashCommandBuilder()
    .setName("kayitlar")
    .setDescription("Ehliyet kayıtlarını listeler")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("kayit_sil")
    .setDescription("Ehliyet kaydı siler")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o =>
      o.setName("isim")
        .setDescription("Silinecek kayıt ismi")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("duyuru")
    .setDescription("Duyuru gönderir")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o =>
      o.setName("mesaj")
        .setDescription("Duyuru metni")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("mesaj_sil")
    .setDescription("Toplu mesaj siler (max 300)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption(o =>
      o.setName("adet")
        .setDescription("Silinecek mesaj sayısı (1-300)")
        .setMinValue(1)
        .setMaxValue(300)
        .setRequired(true)
    ),

].map(c => c.toJSON());

// ================= REGISTER =================
const rest = new REST({ version: "10" }).setToken(TOKEN);
(async () => {
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("✅ Slash komutlar kaydedildi.");
  } catch (e) {
    console.error("Komut kayıt hatası:", e);
  }
})();

// ================= BOT HAZIR =================
client.once("ready", () => {
  console.log(`✅ Bot aktif: ${client.user.tag}`);
});

// ================= INTERACTION =================
client.on(Events.InteractionCreate, async interaction => {

  // ─────────── /ehliyet ───────────
  if (interaction.isChatInputCommand() && interaction.commandName === "ehliyet") {
    if (!yetkili(interaction))
      return interaction.reply({ content: "❌ Bu komutu kullanma yetkin yok.", ephemeral: true });

    const panelEmbed = new EmbedBuilder()
      .setTitle("🚗  Ehliyet Yönetim Paneli")
      .setDescription(
        "Aşağıdaki butonları kullanarak ehliyet kayıtlarını yönetebilirsin.\n\n" +
        "📝 **Ehliyet Kayıt** — Yeni personel kaydı oluştur\n" +
        "📋 **Kayıtlar** — Aktif kayıtları ve kalan süreleri gör\n" +
        "🗑️ **Kayıt Sil** — Mevcut kaydı sil"
      )
      .setColor(0xE8B800)
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ehliyet_kayit_ac")
        .setLabel("📝  Ehliyet Kayıt")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("kayit_sayfa_0")
        .setLabel("📋  Kayıtlar")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("kayit_sil_ac")
        .setLabel("🗑️  Kayıt Sil")
        .setStyle(ButtonStyle.Danger)
    );

    return interaction.reply({ embeds: [panelEmbed], components: [row], ephemeral: true });
  }

  // ─────────── /kayitlar ───────────
  if (interaction.isChatInputCommand() && interaction.commandName === "kayitlar") {
    if (!yetkili(interaction))
      return interaction.reply({ content: "❌ Bu komutu kullanma yetkin yok.", ephemeral: true });

    const { embed, row } = kayitlarEmbed(0);
    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }

  // ─────────── /kayit_sil ───────────
  if (interaction.isChatInputCommand() && interaction.commandName === "kayit_sil") {
    if (!yetkili(interaction))
      return interaction.reply({ content: "❌ Bu komutu kullanma yetkin yok.", ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    const isim  = interaction.options.getString("isim").trim();
    const index = data.findIndex(x => x.isim.toLowerCase() === isim.toLowerCase());

    if (index === -1)
      return interaction.editReply({ content: `❌ **${isim}** adlı kayıt bulunamadı.` });

    const kayit = data[index];
    data.splice(index, 1);
    kaydet();

    const logEmbed = new EmbedBuilder()
      .setTitle("🗑️  Kayıt Silindi")
      .addFields(
        { name: "📋 Silinen", value: `**${kayit.isim}**`, inline: true },
        { name: "🔧 Silen", value: `<@${interaction.user.id}>`, inline: true }
      )
      .setColor(0xED4245)
      .setTimestamp();

    await logKanal(logEmbed);

    const dmEmbed = new EmbedBuilder()
      .setTitle("🗑️  Kayıt Silindi")
      .addFields(
        { name: "📋 Silinen", value: `**${kayit.isim}**`, inline: true },
        { name: "🔧 Silen", value: interaction.user.username, inline: true }
      )
      .setColor(0xED4245)
      .setTimestamp();

    await adminDm(dmEmbed);

    return interaction.editReply({ content: `✅ **${kayit.isim}** silindi.` });
  }

  // ─────────── /duyuru ───────────
  if (interaction.isChatInputCommand() && interaction.commandName === "duyuru") {
    if (!yetkili(interaction))
      return interaction.reply({ content: "❌ Bu komutu kullanma yetkin yok.", ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    const mesaj = interaction.options.getString("mesaj");

    const duyuruEmbed = new EmbedBuilder()
      .setTitle("📢  Duyuru")
      .setDescription(mesaj)
      .setColor(0xE8B800)
      .setFooter({ text: `Yayınlayan: ${interaction.user.username}` })
      .setTimestamp();

    await interaction.channel.send({ content: "@everyone", embeds: [duyuruEmbed] });
    return interaction.editReply({ content: "✅ Duyuru gönderildi." });
  }

  // ─────────── /mesaj_sil ───────────
  if (interaction.isChatInputCommand() && interaction.commandName === "mesaj_sil") {
    if (!yetkili(interaction))
      return interaction.reply({ content: "❌ Bu komutu kullanma yetkin yok.", ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    const adet = interaction.options.getInteger("adet");

    try {
      const mesajlar = await interaction.channel.messages.fetch({ limit: adet });
      const silinecek = mesajlar.filter(m => Date.now() - m.createdTimestamp < 12 * 24 * 60 * 60 * 1000);

      if (silinecek.size === 0)
        return interaction.editReply({ content: "❌ Silinebilecek mesaj bulunamadı." });

      if (silinecek.size === 1) {
        await silinecek.first().delete();
        return interaction.editReply({ content: "✅ 1 mesaj silindi." });
      }

      const silinen = await interaction.channel.bulkDelete(silinecek, true);
      return interaction.editReply({ content: `✅ ${silinen.size} mesaj silindi.` });
    } catch (err) {
      console.error("mesaj_sil hata:", err);
      return interaction.editReply({ content: `❌ Hata: ${err.message}` });
    }
  }

  // ─────────── BUTON: Ehliyet kayıt formu aç ───────────
  if (interaction.isButton() && interaction.customId === "ehliyet_kayit_ac") {
    const modal = new ModalBuilder()
      .setCustomId("ehliyet_kayit_modal")
      .setTitle("Ehliyet Kayıt");

    const isimInput = new TextInputBuilder()
      .setCustomId("kayit_isim")
      .setLabel("Kullanıcı Adı")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder("Personelin adını girin");

    const sureInput = new TextInputBuilder()
      .setCustomId("kayit_sure")
      .setLabel("Süre (dakika — sadece rakam)")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder("Örnek: 60");

    modal.addComponents(
      new ActionRowBuilder().addComponents(isimInput),
      new ActionRowBuilder().addComponents(sureInput)
    );

    return interaction.showModal(modal);
  }

  // ─────────── BUTON: Kayıt sil formu aç ───────────
  if (interaction.isButton() && interaction.customId === "kayit_sil_ac") {
    const modal = new ModalBuilder()
      .setCustomId("kayit_sil_modal")
      .setTitle("Kayıt Sil");

    const isimInput = new TextInputBuilder()
      .setCustomId("sil_isim")
      .setLabel("Silinecek Kayıt İsmi")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder("Tam ismi girin");

    modal.addComponents(
      new ActionRowBuilder().addComponents(isimInput)
    );

    return interaction.showModal(modal);
  }

  // ─────────── BUTON: Sayfa geçişi ───────────
  if (interaction.isButton() && interaction.customId.startsWith("kayit_sayfa_")) {
    const sayfa = parseInt(interaction.customId.replace("kayit_sayfa_", ""), 10);
    if (isNaN(sayfa)) return;

    const { embed, row } = kayitlarEmbed(sayfa);

    try {
      return await interaction.update({ embeds: [embed], components: [row] });
    } catch {
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }
  }

  // ─────────── BUTON: Yenile ───────────
  if (interaction.isButton() && interaction.customId.startsWith("kayit_yenile_")) {
    const sayfa = parseInt(interaction.customId.replace("kayit_yenile_", ""), 10);
    if (isNaN(sayfa)) return;

    const { embed, row } = kayitlarEmbed(sayfa);

    try {
      return await interaction.update({ embeds: [embed], components: [row] });
    } catch {
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }
  }

  // ─────────── MODAL: Kayıt oluştur ───────────
  if (interaction.isModalSubmit() && interaction.customId === "ehliyet_kayit_modal") {
    const isim    = interaction.fields.getTextInputValue("kayit_isim").trim();
    const sureHam = interaction.fields.getTextInputValue("kayit_sure").trim();

    if (!/^\d+$/.test(sureHam)) {
      return interaction.reply({
        content: "❌ Süre alanına **sadece rakam** girebilirsin. Kayıt yapılmadı.",
        ephemeral: true
      });
    }

    const sureDakika = parseInt(sureHam, 10);
    if (sureDakika <= 0) {
      return interaction.reply({
        content: "❌ Süre 0'dan büyük olmalı.",
        ephemeral: true
      });
    }

    const bitis = Date.now() + sureDakika * 60 * 1000;
    data.push({ isim, userId: interaction.user.id, bitis });
    kaydet();

    const dmEmbed = new EmbedBuilder()
      .setTitle("📝  Yeni Kayıt Eklendi")
      .addFields(
        { name: "📋 Personel", value: `**${isim}**`, inline: true },
        { name: "👤 Kaydeden", value: interaction.user.username, inline: true },
        { name: "⏱️ Süre", value: `${sureDakika} dakika`, inline: true }
      )
      .setColor(0x57F287)
      .setTimestamp();

    await adminDm(dmEmbed);

    return interaction.reply({
      content: `✅ **${isim}** kayıtlara eklendi. Süre: **${sureDakika} dakika**.`,
      ephemeral: true
    });
  }

  // ─────────── MODAL: Kayıt sil ───────────
  if (interaction.isModalSubmit() && interaction.customId === "kayit_sil_modal") {
    const isim  = interaction.fields.getTextInputValue("sil_isim").trim();
    const index = data.findIndex(x => x.isim.toLowerCase() === isim.toLowerCase());

    if (index === -1) {
      return interaction.reply({
        content: `❌ **${isim}** adlı kayıt bulunamadı.`,
        ephemeral: true
      });
    }

    const kayit = data[index];
    data.splice(index, 1);
    kaydet();

    const logEmbed = new EmbedBuilder()
      .setTitle("🗑️  Kayıt Silindi")
      .addFields(
        { name: "📋 Silinen", value: `**${kayit.isim}**`, inline: true },
        { name: "🔧 Silen", value: `<@${interaction.user.id}>`, inline: true }
      )
      .setColor(0xED4245)
      .setTimestamp();

    await logKanal(logEmbed);

    const dmEmbed = new EmbedBuilder()
      .setTitle("🗑️  Kayıt Silindi")
      .addFields(
        { name: "📋 Silinen", value: `**${kayit.isim}**`, inline: true },
        { name: "🔧 Silen", value: interaction.user.username, inline: true }
      )
      .setColor(0xED4245)
      .setTimestamp();

    await adminDm(dmEmbed);

    return interaction.reply({
      content: `✅ **${kayit.isim}** silindi.`,
      ephemeral: true
    });
  }
});

// ================= SÜRE KONTROLÜ (her dakika) =================
setInterval(async () => {
  const now   = Date.now();
  let degisti = false;

  data = data.filter(x => {
    if (x.bitis <= now) {
      degisti = true;

      const logEmbed = new EmbedBuilder()
        .setTitle("⏰  Ehliyet Süresi Doldu")
        .addFields({ name: "📋 Personel", value: `**${x.isim}**` })
        .setColor(0xFEE75C)
        .setTimestamp();

      logKanal(logEmbed);

      const dmEmbed = new EmbedBuilder()
        .setTitle("⏰  Ehliyet Süresi Doldu")
        .addFields({ name: "📋 Personel", value: `**${x.isim}**` })
        .setColor(0xFEE75C)
        .setTimestamp();

      adminDm(dmEmbed);

      return false;
    }
    return true;
  });

  if (degisti) kaydet();
}, 60_000);

// ================= GİRİŞ =================
client.login(TOKEN);
