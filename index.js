require('dotenv').config();
const {
  Client, GatewayIntentBits, Collection, REST, Routes,
  SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder,
  ChannelType, ActivityType, AttachmentBuilder
} = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');

// ============================================================
// DATABASE
// ============================================================
const db = new Database(path.join(__dirname, 'bot.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    level INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id TEXT PRIMARY KEY,
    mod_log_channel TEXT,
    swear_filter INTEGER DEFAULT 0,
    warn_role_1 TEXT,
    warn_role_2 TEXT,
    warn_role_3 TEXT,
    warn_mute_1 INTEGER DEFAULT 10,
    warn_mute_2 INTEGER DEFAULT 30,
    warn_mute_3 INTEGER DEFAULT 60,
    level_role_1 TEXT,
    level_role_2 TEXT,
    level_role_3 TEXT,
    level_role_4 TEXT,
    level_role_5 TEXT,
    level_msg_1 INTEGER DEFAULT 10,
    level_msg_2 INTEGER DEFAULT 30,
    level_msg_3 INTEGER DEFAULT 60,
    level_msg_4 INTEGER DEFAULT 100,
    level_msg_5 INTEGER DEFAULT 200
  );

  CREATE TABLE IF NOT EXISTS user_levels (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    level INTEGER DEFAULT 0,
    message_count INTEGER DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS afk_users (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    reason TEXT,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, user_id)
  );
`);

// ============================================================
// MOD LOGGER
// ============================================================
async function sendModLog(guild, embed, imageBuffer = null) {
  const settings = db.prepare('SELECT mod_log_channel FROM guild_settings WHERE guild_id = ?').get(guild.id);
  if (!settings?.mod_log_channel) return;
  try {
    const channel = await guild.channels.fetch(settings.mod_log_channel);
    if (!channel) return;
    const options = { embeds: [embed] };
    if (imageBuffer) {
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'kanit.png' });
      options.files = [attachment];
    }
    await channel.send(options);
  } catch (err) {
    console.error('Mod log gönderilemedi:', err);
  }
}

async function logBan(guild, target, moderator, reason, proofBuffer = null) {
  const embed = new EmbedBuilder()
    .setTitle('🔨 Kullanıcı Banlandı')
    .setColor(0xFF0000)
    .addFields(
      { name: '👤 Banlanan Kullanıcı', value: `${target.tag} \`(${target.id})\``, inline: true },
      { name: '🛡️ Banlayan Moderatör', value: `${moderator.tag} \`(${moderator.id})\``, inline: true },
      { name: '📋 Sebep', value: reason, inline: false },
      { name: '🕒 Tarih', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
    )
    .setThumbnail(target.displayAvatarURL({ dynamic: true }))
    .setFooter({ text: `Ban Logu • ${guild.name}` })
    .setTimestamp();
  if (proofBuffer) embed.setImage('attachment://kanit.png');
  await sendModLog(guild, embed, proofBuffer);
}

async function logUnban(guild, targetId, targetTag, moderator) {
  const embed = new EmbedBuilder()
    .setTitle('✅ Ban Kaldırıldı')
    .setColor(0x00FF88)
    .addFields(
      { name: '👤 Ban Kaldırılan Kullanıcı', value: `${targetTag} \`(${targetId})\``, inline: true },
      { name: '🛡️ İşlemi Yapan Moderatör', value: `${moderator.tag} \`(${moderator.id})\``, inline: true },
      { name: '🕒 Tarih', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
    )
    .setFooter({ text: `Unban Logu • ${guild.name}` })
    .setTimestamp();
  await sendModLog(guild, embed);
}

async function logKick(guild, target, moderator, reason) {
  const embed = new EmbedBuilder()
    .setTitle('👢 Kullanıcı Sunucudan Atıldı')
    .setColor(0xFF8800)
    .addFields(
      { name: '👤 Atılan Kullanıcı', value: `${target.tag} \`(${target.id})\``, inline: true },
      { name: '🛡️ İşlemi Yapan Moderatör', value: `${moderator.tag} \`(${moderator.id})\``, inline: true },
      { name: '📋 Sebep', value: reason, inline: false },
      { name: '🕒 Tarih', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
    )
    .setThumbnail(target.displayAvatarURL({ dynamic: true }))
    .setFooter({ text: `Kick Logu • ${guild.name}` })
    .setTimestamp();
  await sendModLog(guild, embed);
}

async function logMute(guild, target, moderator, reason, duration) {
  const embed = new EmbedBuilder()
    .setTitle('🔇 Kullanıcı Susturuldu')
    .setColor(0xFFFF00)
    .addFields(
      { name: '👤 Susturulan Kullanıcı', value: `${target.tag} \`(${target.id})\``, inline: true },
      { name: '🛡️ İşlemi Yapan Moderatör', value: `${moderator.tag} \`(${moderator.id})\``, inline: true },
      { name: '⏱️ Süre', value: `${duration} dakika`, inline: true },
      { name: '📋 Sebep', value: reason, inline: false },
      { name: '🕒 Tarih', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
    )
    .setThumbnail(target.displayAvatarURL({ dynamic: true }))
    .setFooter({ text: `Susturma Logu • ${guild.name}` })
    .setTimestamp();
  await sendModLog(guild, embed);
}

async function logWarn(guild, target, moderator, reason, level) {
  const embed = new EmbedBuilder()
    .setTitle(`⚠️ Kullanıcıya Uyarı Verildi — Seviye ${level}`)
    .setColor(0xFFA500)
    .addFields(
      { name: '👤 Uyarılan Kullanıcı', value: `${target.tag} \`(${target.id})\``, inline: true },
      { name: '🛡️ Uyarıyı Veren Moderatör', value: `${moderator.tag} \`(${moderator.id})\``, inline: true },
      { name: '📋 Sebep', value: reason, inline: false },
      { name: '📊 Uyarı Seviyesi', value: `**${level}. Seviye**`, inline: true },
      { name: '🕒 Tarih', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
    )
    .setThumbnail(target.displayAvatarURL({ dynamic: true }))
    .setFooter({ text: `Uyarı Logu • ${guild.name}` })
    .setTimestamp();
  await sendModLog(guild, embed);
}

async function logChannelLock(guild, channel, moderator, locked) {
  const embed = new EmbedBuilder()
    .setTitle(locked ? '🔒 Kanal Kilitlendi' : '🔓 Kanal Kilidi Açıldı')
    .setColor(locked ? 0xFF4444 : 0x44FF44)
    .addFields(
      { name: '📢 Kanal', value: `${channel} \`(${channel.id})\``, inline: true },
      { name: '🛡️ İşlemi Yapan Moderatör', value: `${moderator.tag} \`(${moderator.id})\``, inline: true },
      { name: '🕒 Tarih', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
    )
    .setFooter({ text: `Kanal Kilidi Logu • ${guild.name}` })
    .setTimestamp();
  await sendModLog(guild, embed);
}

async function logSwearFilter(guild, member, channelId) {
  const embed = new EmbedBuilder()
    .setTitle('🤬 Küfür Filtresi Tetiklendi')
    .setColor(0xFF6600)
    .addFields(
      { name: '👤 Kullanıcı', value: `${member.user.tag} \`(${member.id})\``, inline: true },
      { name: '💬 Kanal', value: `<#${channelId}>`, inline: true },
      { name: '🕒 Tarih', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
    )
    .setFooter({ text: `Küfür Filtresi Logu • ${guild.name}` })
    .setTimestamp();
  await sendModLog(guild, embed);
}

// ============================================================
// COMMANDS DEFINITION
// ============================================================
const commands = [
  // /ban
  {
    data: new SlashCommandBuilder()
      .setName('ban')
      .setDescription('Belirtilen kullanıcıyı sunucudan kalıcı olarak yasaklar ve kullanıcıya DM bildirimi gönderir.')
      .addUserOption(o => o.setName('kullanici').setDescription('Yasaklanacak kullanıcıyı seçin.').setRequired(true))
      .addStringOption(o => o.setName('sebep').setDescription('Banlama sebebini yazın.').setRequired(true))
      .addAttachmentOption(o => o.setName('kanit').setDescription('Kanıt görseli (isteğe bağlı). Sadece mod loguna eklenir, kullanıcıya gösterilmez.').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    async execute(interaction) {
      const target = interaction.options.getUser('kullanici');
      const reason = interaction.options.getString('sebep');
      const proofAttachment = interaction.options.getAttachment('kanit');
      const guild = interaction.guild;
      const moderator = interaction.user;

      await interaction.deferReply({ ephemeral: true });

      const member = await guild.members.fetch(target.id).catch(() => null);
      if (member && !member.bannable)
        return interaction.editReply({ content: '❌ Bu kullanıcıyı banlayamam! Yetkim yetersiz veya rol hiyerarşisi uyumsuz.' });

      const dmEmbed = new EmbedBuilder()
        .setTitle(`🚫 ${guild.name}`)
        .setDescription([
          '```',
          '╔══════════════════════════════╗',
          '║      SUNUCUDAN BANLANDINIZ   ║',
          '╚══════════════════════════════╝',
          '```',
          `> **Sebep:** ${reason} nedeniyle banlandınız.`,
          '',
          '*Eğer bu kararın hatalı olduğunu düşünüyorsanız sunucu yöneticisiyle iletişime geçin.*'
        ].join('\n'))
        .setColor(0xFF0000)
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .setFooter({ text: `${guild.name} Moderasyon Sistemi` })
        .setTimestamp();

      try { await target.send({ embeds: [dmEmbed] }); } catch (_) {}

      let proofBuffer = null;
      if (proofAttachment) {
        try {
          const res = await fetch(proofAttachment.url);
          proofBuffer = Buffer.from(await res.arrayBuffer());
        } catch (_) {}
      }

      await guild.members.ban(target.id, { reason: `${reason} | Moderatör: ${moderator.tag}` });
      await logBan(guild, target, moderator, reason, proofBuffer);

      const embed = new EmbedBuilder()
        .setTitle('✅ Kullanıcı Banlandı')
        .setColor(0xFF0000)
        .addFields(
          { name: '👤 Kullanıcı', value: `${target.tag} \`(${target.id})\``, inline: true },
          { name: '📋 Sebep', value: reason, inline: true },
          { name: '🖼️ Kanıt', value: proofAttachment ? '✅ Loga eklendi' : '❌ Yok', inline: true }
        )
        .setFooter({ text: `İşlemi yapan: ${moderator.tag}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  },

  // /unban
  {
    data: new SlashCommandBuilder()
      .setName('unban')
      .setDescription('Belirtilen kullanıcı ID\'sine göre banı kaldırır. Kullanıcının banlı olup olmadığını kontrol eder.')
      .addStringOption(o => o.setName('id').setDescription('Banını kaldırmak istediğiniz kullanıcının Discord ID\'sini yazın.').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    async execute(interaction) {
      const userId = interaction.options.getString('id');
      const moderator = interaction.user;
      const guild = interaction.guild;

      await interaction.deferReply({ ephemeral: true });

      if (!/^\d{17,20}$/.test(userId))
        return interaction.editReply({ content: '❌ Geçersiz kullanıcı ID formatı.' });

      let banInfo;
      try {
        banInfo = await guild.bans.fetch(userId);
      } catch (_) {
        return interaction.editReply({ content: `❌ \`${userId}\` ID'li kullanıcı bu sunucuda banlı değil.` });
      }

      await guild.members.unban(userId, `Ban kaldırıldı | Moderatör: ${moderator.tag}`);
      await logUnban(guild, userId, banInfo.user.tag, moderator);

      const embed = new EmbedBuilder()
        .setTitle('✅ Ban Kaldırıldı')
        .setColor(0x00FF88)
        .addFields(
          { name: '👤 Kullanıcı', value: `${banInfo.user.tag} \`(${userId})\``, inline: true },
          { name: '🛡️ İşlemi Yapan', value: moderator.tag, inline: true },
          { name: '📋 Önceki Ban Sebebi', value: banInfo.reason || 'Belirtilmemiş', inline: false }
        )
        .setFooter({ text: `${guild.name} Moderasyon Sistemi` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  },

  // /kick
  {
    data: new SlashCommandBuilder()
      .setName('kick')
      .setDescription('Belirtilen kullanıcıyı sunucudan atar. Kullanıcı tekrar katılabilir.')
      .addUserOption(o => o.setName('kullanici').setDescription('Sunucudan atılacak kullanıcıyı seçin.').setRequired(true))
      .addStringOption(o => o.setName('sebep').setDescription('Atma sebebini yazın.').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

    async execute(interaction) {
      const target = interaction.options.getUser('kullanici');
      const reason = interaction.options.getString('sebep');
      const guild = interaction.guild;
      const moderator = interaction.user;

      await interaction.deferReply({ ephemeral: true });

      const member = await guild.members.fetch(target.id).catch(() => null);
      if (!member) return interaction.editReply({ content: '❌ Bu kullanıcı sunucuda bulunmuyor.' });
      if (!member.kickable) return interaction.editReply({ content: '❌ Bu kullanıcıyı atamam! Yetkim yetersiz.' });

      const dmEmbed = new EmbedBuilder()
        .setTitle(`👢 ${guild.name}`)
        .setDescription([
          '```',
          '╔══════════════════════════════╗',
          '║      SUNUCUDAN ATILDINIZ     ║',
          '╚══════════════════════════════╝',
          '```',
          `> **Sebep:** ${reason} nedeniyle atıldınız.`,
          '',
          '*Sunucuya tekrar katılabilirsiniz. Ancak kurallara uymanızı bekliyoruz.*'
        ].join('\n'))
        .setColor(0xFF8800)
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .setFooter({ text: `${guild.name} Moderasyon Sistemi` })
        .setTimestamp();

      try { await target.send({ embeds: [dmEmbed] }); } catch (_) {}

      await member.kick(`${reason} | Moderatör: ${moderator.tag}`);
      await logKick(guild, target, moderator, reason);

      const embed = new EmbedBuilder()
        .setTitle('✅ Kullanıcı Atıldı')
        .setColor(0xFF8800)
        .addFields(
          { name: '👤 Kullanıcı', value: `${target.tag} \`(${target.id})\``, inline: true },
          { name: '📋 Sebep', value: reason, inline: true }
        )
        .setFooter({ text: `İşlemi yapan: ${moderator.tag}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  },

  // /sustur
  {
    data: new SlashCommandBuilder()
      .setName('sustur')
      .setDescription('Belirtilen kullanıcıyı timeout ile susturur. Kullanıcıya DM bildirimi gönderilir.')
      .addUserOption(o => o.setName('kullanici').setDescription('Susturulacak kullanıcıyı seçin.').setRequired(true))
      .addStringOption(o => o.setName('sebep').setDescription('Susturma sebebini yazın.').setRequired(true))
      .addIntegerOption(o => o.setName('sure').setDescription('Susturma süresi dakika cinsinden. Varsayılan: 10 dakika.').setMinValue(1).setMaxValue(40320).setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async execute(interaction) {
      const target = interaction.options.getUser('kullanici');
      const reason = interaction.options.getString('sebep');
      const duration = interaction.options.getInteger('sure') ?? 10;
      const guild = interaction.guild;
      const moderator = interaction.user;

      await interaction.deferReply({ ephemeral: true });

      const member = await guild.members.fetch(target.id).catch(() => null);
      if (!member) return interaction.editReply({ content: '❌ Kullanıcı sunucuda bulunamadı.' });
      if (!member.moderatable) return interaction.editReply({ content: '❌ Bu kullanıcıyı susturamam! Yetkim yetersiz.' });

      const dmEmbed = new EmbedBuilder()
        .setTitle(`🔇 ${guild.name}`)
        .setDescription([
          '```',
          '╔══════════════════════════════╗',
          '║         SUSTURULDUNUZ        ║',
          '╚══════════════════════════════╝',
          '```',
          `> **Sebep:** ${reason} nedeniyle susturuldunuz.`,
          `> **Süre:** ${duration} dakika`,
          '',
          '*Süre dolduğunda tekrar konuşabilirsiniz.*'
        ].join('\n'))
        .setColor(0xFFFF00)
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .setFooter({ text: `${guild.name} Moderasyon Sistemi` })
        .setTimestamp();

      try { await target.send({ embeds: [dmEmbed] }); } catch (_) {}

      await member.timeout(duration * 60 * 1000, `${reason} | Moderatör: ${moderator.tag}`);
      await logMute(guild, target, moderator, reason, duration);

      const embed = new EmbedBuilder()
        .setTitle('✅ Kullanıcı Susturuldu')
        .setColor(0xFFFF00)
        .addFields(
          { name: '👤 Kullanıcı', value: `${target.tag} \`(${target.id})\``, inline: true },
          { name: '⏱️ Süre', value: `${duration} dakika`, inline: true },
          { name: '📋 Sebep', value: reason, inline: false }
        )
        .setFooter({ text: `İşlemi yapan: ${moderator.tag}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  },

  // /uyari_ver
  {
    data: new SlashCommandBuilder()
      .setName('uyari_ver')
      .setDescription('Kullanıcıya uyarı verir. Her uyarıda seviye artar (max 3). 3 gün sonra otomatik düşer.')
      .addUserOption(o => o.setName('kullanici').setDescription('Uyarı verilecek kullanıcıyı seçin.').setRequired(true))
      .addStringOption(o => o.setName('sebep').setDescription('Uyarı sebebini yazın.').setRequired(true))
      .addAttachmentOption(o => o.setName('kanit').setDescription('Kanıt görseli ekleyin (isteğe bağlı).').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async execute(interaction) {
      const target = interaction.options.getUser('kullanici');
      const reason = interaction.options.getString('sebep');
      const guild = interaction.guild;
      const moderator = interaction.user;

      await interaction.deferReply({ ephemeral: true });

      const member = await guild.members.fetch(target.id).catch(() => null);
      if (!member) return interaction.editReply({ content: '❌ Kullanıcı sunucuda bulunamadı.' });

      const settings = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guild.id);
      const now = Date.now();

      const existing = db.prepare(
        'SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? AND expires_at > ? ORDER BY created_at DESC'
      ).get(guild.id, target.id, now);

      const currentLevel = existing ? existing.level : 0;
      const newLevel = Math.min(currentLevel + 1, 3);
      const expiresAt = now + 3 * 24 * 60 * 60 * 1000;

      db.prepare('DELETE FROM warnings WHERE guild_id = ? AND user_id = ?').run(guild.id, target.id);
      db.prepare(
        'INSERT INTO warnings (guild_id, user_id, moderator_id, reason, level, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(guild.id, target.id, moderator.id, reason, newLevel, now, expiresAt);

      if (settings) {
        const roleIds = [null, settings.warn_role_1, settings.warn_role_2, settings.warn_role_3];
        const mutes  = [null, settings.warn_mute_1, settings.warn_mute_2, settings.warn_mute_3];
        if (roleIds[newLevel]) try { await member.roles.add(roleIds[newLevel]); } catch (_) {}
        if (mutes[newLevel])   try { await member.timeout(mutes[newLevel] * 60 * 1000, `Seviye ${newLevel} Uyarı: ${reason}`); } catch (_) {}
      }

      await logWarn(guild, target, moderator, reason, newLevel);

      const levelEmojis = ['', '⚠️', '🚨', '🔴'];
      const dmEmbed = new EmbedBuilder()
        .setTitle(`${levelEmojis[newLevel]} ${guild.name}`)
        .setDescription([
          '```',
          `╔══════════════════════════════╗`,
          `║  ${newLevel}. SEVİYE UYARI ALDINIZ   ║`,
          `╚══════════════════════════════╝`,
          '```',
          `> **Sebep:** ${reason} nedeniyle uyarı aldınız.`,
          `> **Uyarı Seviyeniz:** ${newLevel}/3`,
          '',
          '*Bu uyarı 3 gün sonra geçerliliğini yitirecektir.*'
        ].join('\n'))
        .setColor(newLevel === 1 ? 0xFFA500 : newLevel === 2 ? 0xFF6600 : 0xFF0000)
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .setFooter({ text: `${guild.name} Uyarı Sistemi` })
        .setTimestamp();

      try { await target.send({ embeds: [dmEmbed] }); } catch (_) {}

      const embed = new EmbedBuilder()
        .setTitle(`✅ Uyarı Verildi — Seviye ${newLevel}`)
        .setColor(0xFFA500)
        .addFields(
          { name: '👤 Kullanıcı', value: `${target.tag}`, inline: true },
          { name: '📊 Uyarı Seviyesi', value: `${newLevel}/3`, inline: true },
          { name: '📋 Sebep', value: reason, inline: false },
          { name: '⏳ Geçerlilik', value: '3 gün sonra düşer', inline: true }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  },

  // /uyari_al
  {
    data: new SlashCommandBuilder()
      .setName('uyari_al')
      .setDescription('Belirtilen kullanıcının uyarı seviyesini 1 kademe düşürür.')
      .addUserOption(o => o.setName('kullanici').setDescription('Uyarısı düşürülecek kullanıcıyı seçin.').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async execute(interaction) {
      const target = interaction.options.getUser('kullanici');
      const guild = interaction.guild;
      const now = Date.now();

      const existing = db.prepare(
        'SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? AND expires_at > ?'
      ).get(guild.id, target.id, now);

      if (!existing || existing.level === 0)
        return interaction.reply({ content: `❌ ${target.tag} adlı kullanıcının aktif bir uyarısı bulunmuyor.`, ephemeral: true });

      const newLevel = existing.level - 1;

      if (newLevel === 0) {
        db.prepare('DELETE FROM warnings WHERE guild_id = ? AND user_id = ?').run(guild.id, target.id);
      } else {
        db.prepare('UPDATE warnings SET level = ? WHERE guild_id = ? AND user_id = ?').run(newLevel, guild.id, target.id);
      }

      const embed = new EmbedBuilder()
        .setTitle('✅ Uyarı Düşürüldü')
        .setColor(0x00FF88)
        .addFields(
          { name: '👤 Kullanıcı', value: `${target.tag} \`(${target.id})\``, inline: true },
          { name: '📊 Yeni Seviye', value: newLevel === 0 ? '✅ Temizlendi' : `${newLevel}/3`, inline: true },
          { name: '🛡️ İşlemi Yapan', value: interaction.user.tag, inline: false }
        )
        .setFooter({ text: `${guild.name} Moderasyon Sistemi` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },

  // /uyarilar
  {
    data: new SlashCommandBuilder()
      .setName('uyarilar')
      .setDescription('Sunucudaki tüm aktif uyarıları ve uyarı seviyelerini listeler.')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async execute(interaction) {
      const guild = interaction.guild;
      const now = Date.now();

      const warnings = db.prepare(
        'SELECT * FROM warnings WHERE guild_id = ? AND expires_at > ? ORDER BY level DESC, created_at DESC'
      ).all(guild.id, now);

      if (warnings.length === 0)
        return interaction.reply({ content: '✅ Sunucuda aktif uyarısı bulunan kullanıcı yok.', ephemeral: true });

      const levelEmojis = { 1: '⚠️', 2: '🚨', 3: '🔴' };
      const lines = warnings.map(w => {
        const expires = Math.floor(w.expires_at / 1000);
        return `${levelEmojis[w.level]} **Seviye ${w.level}** — <@${w.user_id}> • ${w.reason} • <t:${expires}:R> sona erer`;
      });

      const embed = new EmbedBuilder()
        .setTitle(`📋 Aktif Uyarılar — ${guild.name}`)
        .setDescription(lines.join('\n'))
        .setColor(0xFFA500)
        .setFooter({ text: `Toplam ${warnings.length} aktif uyarı` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },

  // /kanal_kilit_kapa
  {
    data: new SlashCommandBuilder()
      .setName('kanal_kilit_kapa')
      .setDescription('Seçilen kanalı kilitler. Normal üyeler mesaj gönderemez, yetkililer gönderebilir.')
      .addChannelOption(o => o.setName('kanal').setDescription('Kilitlenecek kanalı seçin.').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async execute(interaction) {
      const channel = interaction.options.getChannel('kanal');
      const guild = interaction.guild;

      await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
      await logChannelLock(guild, channel, interaction.user, true);

      const embed = new EmbedBuilder()
        .setTitle('🔒 Kanal Kilitlendi')
        .setDescription(`${channel} kanalı kilitlendi. Normal üyeler artık mesaj gönderemiyor.`)
        .setColor(0xFF4444)
        .setFooter({ text: `İşlemi yapan: ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
  },

  // /kanal_kilit_ac
  {
    data: new SlashCommandBuilder()
      .setName('kanal_kilit_ac')
      .setDescription('Seçilen kanalın kilidini açar. Tüm üyeler tekrar mesaj gönderebilir.')
      .addChannelOption(o => o.setName('kanal').setDescription('Kilidi açılacak kanalı seçin.').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async execute(interaction) {
      const channel = interaction.options.getChannel('kanal');
      const guild = interaction.guild;

      await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: true });
      await logChannelLock(guild, channel, interaction.user, false);

      const embed = new EmbedBuilder()
        .setTitle('🔓 Kanal Kilidi Açıldı')
        .setDescription(`${channel} kanalının kilidi açıldı. Herkes tekrar mesaj gönderebilir.`)
        .setColor(0x44FF44)
        .setFooter({ text: `İşlemi yapan: ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
  },

  // /mod_log_ayarla
  {
    data: new SlashCommandBuilder()
      .setName('mod_log_ayarla')
      .setDescription('Moderasyon log kanalını ayarlar. Ban, kick, mute, uyarı gibi tüm işlemler bu kanala kaydedilir.')
      .addChannelOption(o => o.setName('kanal').setDescription('Mod loglarının gönderileceği kanalı seçin.').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
      const channel = interaction.options.getChannel('kanal');
      const guild = interaction.guild;

      db.prepare(`
        INSERT INTO guild_settings (guild_id, mod_log_channel)
        VALUES (?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET mod_log_channel = excluded.mod_log_channel
      `).run(guild.id, channel.id);

      const embed = new EmbedBuilder()
        .setTitle('✅ Mod Log Kanalı Ayarlandı')
        .setDescription([
          `Moderasyon logları artık ${channel} kanalına gönderilecek.`,
          '',
          '**Loglanacak olaylar:**',
          '🔨 Ban (kanıt görseli dahil)',
          '✅ Ban kaldırma',
          '👢 Kick',
          '🔇 Susturma',
          '⚠️ Uyarı',
          '🔒 Kanal kilitleme/açma',
          '🤬 Küfür filtresi tetiklenmeleri'
        ].join('\n'))
        .setColor(0x00AAFF)
        .setFooter({ text: `${guild.name} Moderasyon Sistemi` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },

  // /uyari_rol_ayarla
  {
    data: new SlashCommandBuilder()
      .setName('uyari_rol_ayarla')
      .setDescription('Her uyarı seviyesi için verilecek rol ve susturma süresini ayarlar.')
      .addRoleOption(o => o.setName('seviye1_rol').setDescription('1. seviye uyarıda verilecek rol.').setRequired(true))
      .addIntegerOption(o => o.setName('seviye1_mute').setDescription('1. seviye uyarıda susturma süresi (dakika).').setMinValue(1).setRequired(true))
      .addRoleOption(o => o.setName('seviye2_rol').setDescription('2. seviye uyarıda verilecek rol.').setRequired(true))
      .addIntegerOption(o => o.setName('seviye2_mute').setDescription('2. seviye uyarıda susturma süresi (dakika).').setMinValue(1).setRequired(true))
      .addRoleOption(o => o.setName('seviye3_rol').setDescription('3. seviye uyarıda verilecek rol.').setRequired(true))
      .addIntegerOption(o => o.setName('seviye3_mute').setDescription('3. seviye uyarıda susturma süresi (dakika).').setMinValue(1).setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
      const r1 = interaction.options.getRole('seviye1_rol');
      const m1 = interaction.options.getInteger('seviye1_mute');
      const r2 = interaction.options.getRole('seviye2_rol');
      const m2 = interaction.options.getInteger('seviye2_mute');
      const r3 = interaction.options.getRole('seviye3_rol');
      const m3 = interaction.options.getInteger('seviye3_mute');
      const guild = interaction.guild;

      db.prepare(`
        INSERT INTO guild_settings (guild_id, warn_role_1, warn_mute_1, warn_role_2, warn_mute_2, warn_role_3, warn_mute_3)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET
          warn_role_1 = excluded.warn_role_1, warn_mute_1 = excluded.warn_mute_1,
          warn_role_2 = excluded.warn_role_2, warn_mute_2 = excluded.warn_mute_2,
          warn_role_3 = excluded.warn_role_3, warn_mute_3 = excluded.warn_mute_3
      `).run(guild.id, r1.id, m1, r2.id, m2, r3.id, m3);

      const embed = new EmbedBuilder()
        .setTitle('✅ Uyarı Sistemi Ayarlandı')
        .setColor(0xFFA500)
        .addFields(
          { name: '⚠️ 1. Seviye', value: `Rol: ${r1} | Susturma: ${m1} dk`, inline: false },
          { name: '🚨 2. Seviye', value: `Rol: ${r2} | Susturma: ${m2} dk`, inline: false },
          { name: '🔴 3. Seviye', value: `Rol: ${r3} | Susturma: ${m3} dk`, inline: false }
        )
        .setFooter({ text: `${guild.name} Uyarı Sistemi` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },

  // /kufur_koruma
  {
    data: new SlashCommandBuilder()
      .setName('kufur_koruma')
      .setDescription('Küfür korumasını açar veya kapatır. Açıkken küfür yazan kullanıcı otomatik 1 dakika susturulur.')
      .addStringOption(o => o.setName('durum').setDescription('Küfür korumasını açın veya kapatın.').setRequired(true)
        .addChoices({ name: '✅ Aç', value: 'ac' }, { name: '❌ Kapat', value: 'kapat' }))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
      const value = interaction.options.getString('durum') === 'ac' ? 1 : 0;
      const guild = interaction.guild;

      db.prepare(`
        INSERT INTO guild_settings (guild_id, swear_filter)
        VALUES (?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET swear_filter = excluded.swear_filter
      `).run(guild.id, value);

      const embed = new EmbedBuilder()
        .setTitle(value ? '✅ Küfür Koruması Açıldı' : '❌ Küfür Koruması Kapatıldı')
        .setDescription(value
          ? 'Küfür içeren mesajlar silinecek ve kullanıcı **1 dakika** susturulacak.'
          : 'Küfür koruması devre dışı bırakıldı.')
        .setColor(value ? 0x00FF88 : 0xFF4444)
        .setFooter({ text: `${guild.name} Moderasyon Sistemi` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },

  // /duyuru
  {
    data: new SlashCommandBuilder()
      .setName('duyuru')
      .setDescription('Seçilen kanala başlık, içerik ve rol etiketiyle estetik bir duyuru gönderir.')
      .addChannelOption(o => o.setName('kanal').setDescription('Duyurunun gönderileceği kanalı seçin.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
      .addStringOption(o => o.setName('baslik').setDescription('Duyuru başlığı. Örnek: 📢 # Önemli Duyuru').setRequired(true))
      .addStringOption(o => o.setName('yazi').setDescription('Duyuru içeriği.').setRequired(true))
      .addRoleOption(o => o.setName('etiket').setDescription('Etiketlenecek rolü seçin (isteğe bağlı).').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
      const channel  = interaction.options.getChannel('kanal');
      const baslik   = interaction.options.getString('baslik');
      const yazi     = interaction.options.getString('yazi');
      const etiket   = interaction.options.getRole('etiket');
      const guild    = interaction.guild;

      await interaction.deferReply({ ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle(baslik)
        .setDescription(yazi)
        .setColor(0x5865F2)
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .setFooter({ text: `${guild.name} Duyuru Sistemi • ${interaction.user.tag}` })
        .setTimestamp();

      try {
        await channel.send({ content: etiket ? `${etiket}` : undefined, embeds: [embed] });
        await interaction.editReply({ content: `✅ Duyuru ${channel} kanalına gönderildi.` });
      } catch {
        await interaction.editReply({ content: '❌ Duyuru gönderilemedi. Kanal yazma yetkim var mı kontrol edin.' });
      }
    }
  },

  // /afk
  {
    data: new SlashCommandBuilder()
      .setName('afk')
      .setDescription('AFK moduna geçer. Etiketlendiğinizde bot bildirim verir. Bot isminizi [AFK] olarak değiştirir.')
      .addStringOption(o => o.setName('sebep').setDescription('AFK sebebinizi yazın.').setRequired(false)),

    async execute(interaction) {
      const sebep  = interaction.options.getString('sebep') || 'Sebep belirtilmedi';
      const guild  = interaction.guild;
      const member = interaction.member;

      db.prepare(`
        INSERT INTO afk_users (guild_id, user_id, reason, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(guild_id, user_id) DO UPDATE SET reason = excluded.reason, created_at = excluded.created_at
      `).run(guild.id, interaction.user.id, sebep, Date.now());

      try {
        const nick = member.nickname || member.user.username;
        await member.setNickname(`${nick} [AFK]`);
      } catch (_) {}

      const embed = new EmbedBuilder()
        .setTitle('💤 AFK Moduna Geçildi')
        .setDescription('Birisi sizi etiketlediğinde AFK olduğunuz bildirilecek.')
        .addFields({ name: '📋 Sebep', value: sebep })
        .setColor(0x808080)
        .setFooter({ text: 'Mesaj yazdığınızda AFK modu otomatik kaldırılır.' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },

  // /anket
  {
    data: new SlashCommandBuilder()
      .setName('anket')
      .setDescription('Seçenekli bir anket oluşturur. Kullanıcılar emoji reaksiyonu ile oy verebilir.')
      .addStringOption(o => o.setName('soru').setDescription('Anket sorusunu yazın.').setRequired(true))
      .addStringOption(o => o.setName('cevap1').setDescription('1. cevap seçeneği.').setRequired(true))
      .addStringOption(o => o.setName('cevap2').setDescription('2. cevap seçeneği.').setRequired(true))
      .addStringOption(o => o.setName('cevap3').setDescription('3. cevap seçeneği (isteğe bağlı).').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction) {
      const soru    = interaction.options.getString('soru');
      const cevaplar = [
        interaction.options.getString('cevap1'),
        interaction.options.getString('cevap2'),
        interaction.options.getString('cevap3')
      ].filter(Boolean);

      const EMOJIS = ['1️⃣', '2️⃣', '3️⃣'];
      const desc   = cevaplar.map((c, i) => `${EMOJIS[i]} — **${c}**`).join('\n\n');

      const embed = new EmbedBuilder()
        .setTitle(`📊 ${soru}`)
        .setDescription(desc)
        .setColor(0x5865F2)
        .setFooter({ text: `Anket oluşturan: ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      const msg = await interaction.fetchReply();
      for (let i = 0; i < cevaplar.length; i++) await msg.react(EMOJIS[i]);
    }
  },

  // /seviye_rol_ayarla
  {
    data: new SlashCommandBuilder()
      .setName('seviye_rol_ayarla')
      .setDescription('Her seviyeye ulaşıldığında verilecek rolleri ayarlar. XP mesaj göndererek kazanılır.')
      .addRoleOption(o => o.setName('seviye1').setDescription('1. seviyede verilecek rol.').setRequired(true))
      .addRoleOption(o => o.setName('seviye2').setDescription('2. seviyede verilecek rol.').setRequired(true))
      .addRoleOption(o => o.setName('seviye3').setDescription('3. seviyede verilecek rol.').setRequired(true))
      .addRoleOption(o => o.setName('seviye4').setDescription('4. seviyede verilecek rol.').setRequired(true))
      .addRoleOption(o => o.setName('seviye5').setDescription('5. seviyede verilecek rol.').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
      const roles = [1,2,3,4,5].map(i => interaction.options.getRole(`seviye${i}`));
      const guild = interaction.guild;

      db.prepare(`
        INSERT INTO guild_settings (guild_id, level_role_1, level_role_2, level_role_3, level_role_4, level_role_5)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET
          level_role_1 = excluded.level_role_1, level_role_2 = excluded.level_role_2,
          level_role_3 = excluded.level_role_3, level_role_4 = excluded.level_role_4,
          level_role_5 = excluded.level_role_5
      `).run(guild.id, ...roles.map(r => r.id));

      const emojis = ['🥉','🥈','🥇','💎','👑'];
      const embed = new EmbedBuilder()
        .setTitle('✅ Seviye Rolleri Ayarlandı')
        .setColor(0x00AAFF)
        .addFields(roles.map((r, i) => ({ name: `${emojis[i]} Seviye ${i+1}`, value: `${r}`, inline: true })))
        .setFooter({ text: `${guild.name} Seviye Sistemi` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },

  // /seviye_oyun
  {
    data: new SlashCommandBuilder()
      .setName('seviye_oyun')
      .setDescription('Her seviye için gereken mesaj sayısını ayarlar. Kullanıcılar mesaj göndererek XP kazanır.')
      .addIntegerOption(o => o.setName('seviye1').setDescription('1. seviye için gereken mesaj sayısı.').setMinValue(1).setRequired(true))
      .addIntegerOption(o => o.setName('seviye2').setDescription('2. seviye için gereken mesaj sayısı.').setMinValue(1).setRequired(true))
      .addIntegerOption(o => o.setName('seviye3').setDescription('3. seviye için gereken mesaj sayısı.').setMinValue(1).setRequired(true))
      .addIntegerOption(o => o.setName('seviye4').setDescription('4. seviye için gereken mesaj sayısı.').setMinValue(1).setRequired(true))
      .addIntegerOption(o => o.setName('seviye5').setDescription('5. seviye için gereken mesaj sayısı.').setMinValue(1).setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
      const msgs  = [1,2,3,4,5].map(i => interaction.options.getInteger(`seviye${i}`));
      const guild = interaction.guild;

      db.prepare(`
        INSERT INTO guild_settings (guild_id, level_msg_1, level_msg_2, level_msg_3, level_msg_4, level_msg_5)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET
          level_msg_1 = excluded.level_msg_1, level_msg_2 = excluded.level_msg_2,
          level_msg_3 = excluded.level_msg_3, level_msg_4 = excluded.level_msg_4,
          level_msg_5 = excluded.level_msg_5
      `).run(guild.id, ...msgs);

      const emojis = ['🥉','🥈','🥇','💎','👑'];
      const embed = new EmbedBuilder()
        .setTitle('✅ Seviye Eşikleri Ayarlandı')
        .setColor(0x00AAFF)
        .addFields(msgs.map((m, i) => ({ name: `${emojis[i]} Seviye ${i+1}`, value: `${m} mesaj`, inline: true })))
        .setFooter({ text: `${guild.name} Seviye Sistemi` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
];

// ============================================================
// SWEAR FILTER LIST
// ============================================================
const SWEAR_WORDS = [
  'orospu','orosp','sik','sikim','amk','amına','amina',
  'göt','got','meme','yarrak','yarak','piç','pic',
  'salak','gerizekalı','aptal','oç','oc','şerefsiz','serefsiz',
  'kahpe','kaltak','ibne','götveren','got veren'
];

function containsSwear(text) {
  const lower = text.toLowerCase().replace(/[^a-zçğıöşü ]/gi, '');
  return SWEAR_WORDS.some(w => lower.includes(w));
}

// ============================================================
// CLIENT SETUP
// ============================================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration
  ]
});

client.commands = new Collection();
for (const cmd of commands) client.commands.set(cmd.data.name, cmd);

// ============================================================
// EVENTS
// ============================================================
client.once('ready', async () => {
  console.log(`✅ Bot aktif: ${client.user.tag}`);

  client.user.setPresence({
    activities: [{ name: 'Sunucuyu Koruyorum', type: ActivityType.Watching }],
    status: 'dnd'
  });

  // Slash komutlarını deploy et
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log('🔄 Slash komutları deploy ediliyor...');
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands.map(c => c.data.toJSON()) }
    );
    console.log(`✅ ${commands.length} komut başarıyla deploy edildi.`);
  } catch (err) {
    console.error('❌ Deploy hatası:', err);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Komut hatası [/${interaction.commandName}]:`, err);
    const msg = { content: '❌ Komut çalıştırılırken bir hata oluştu.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(msg).catch(() => {});
    } else {
      await interaction.reply(msg).catch(() => {});
    }
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  const guild    = message.guild;
  const member   = message.member;
  const settings = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guild.id);

  // AFK — kendi mesajı: AFK'dan çık
  const afkUser = db.prepare('SELECT * FROM afk_users WHERE guild_id = ? AND user_id = ?')
    .get(guild.id, message.author.id);

  if (afkUser) {
    db.prepare('DELETE FROM afk_users WHERE guild_id = ? AND user_id = ?').run(guild.id, message.author.id);
    try {
      const nick = member.nickname || '';
      if (nick.endsWith(' [AFK]')) await member.setNickname(nick.replace(' [AFK]', ''));
    } catch (_) {}
    try {
      await message.reply({ content: `👋 Hoş geldin! AFK modun kaldırıldı.`, allowedMentions: { repliedUser: true } });
    } catch (_) {}
  }

  // AFK — başkasını etiketleme
  if (message.mentions.users.size > 0) {
    for (const [userId, user] of message.mentions.users) {
      const mentioned = db.prepare('SELECT * FROM afk_users WHERE guild_id = ? AND user_id = ?').get(guild.id, userId);
      if (mentioned) {
        try {
          await message.reply({
            content: `💤 **${user.username}** şu an AFK — *${mentioned.reason}* (<t:${Math.floor(mentioned.created_at / 1000)}:R>)`,
            allowedMentions: { repliedUser: false }
          });
        } catch (_) {}
      }
    }
  }

  // Küfür filtresi
  if (settings?.swear_filter && containsSwear(message.content)) {
    try {
      await message.delete();
      await member.timeout(60 * 1000, 'Küfür filtresi — otomatik susturma');
      await logSwearFilter(guild, member, message.channelId);
      const warn = await message.channel.send(`🔇 ${member} küfür kullandığı için **1 dakika** susturuldu.`);
      setTimeout(() => warn.delete().catch(() => {}), 5000);
    } catch (_) {}
    return;
  }

  // Seviye sistemi
  if (!settings) return;

  const thresholds = [
    settings.level_msg_1 || 10,
    settings.level_msg_2 || 30,
    settings.level_msg_3 || 60,
    settings.level_msg_4 || 100,
    settings.level_msg_5 || 200
  ];
  const levelRoles = [
    settings.level_role_1,
    settings.level_role_2,
    settings.level_role_3,
    settings.level_role_4,
    settings.level_role_5
  ];

  let userData = db.prepare('SELECT * FROM user_levels WHERE guild_id = ? AND user_id = ?').get(guild.id, message.author.id);
  if (!userData) {
    db.prepare('INSERT INTO user_levels (guild_id, user_id) VALUES (?, ?)').run(guild.id, message.author.id);
    userData = { level: 0, message_count: 0 };
  }

  const newMsgCount = userData.message_count + 1;
  let newLevel = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (newMsgCount >= thresholds[i]) newLevel = i + 1;
  }

  db.prepare('UPDATE user_levels SET message_count = ?, level = ? WHERE guild_id = ? AND user_id = ?')
    .run(newMsgCount, newLevel, guild.id, message.author.id);

  if (newLevel > userData.level) {
    const roleId = levelRoles[newLevel - 1];
    if (roleId) {
      try {
        await member.roles.add(roleId);
        if (newLevel > 1 && levelRoles[newLevel - 2]) await member.roles.remove(levelRoles[newLevel - 2]);
      } catch (_) {}
    }
    const emojis = ['🥉','🥈','🥇','💎','👑'];
    try {
      const lvlMsg = await message.channel.send(`🎉 Tebrikler ${member}! **${emojis[newLevel - 1]} ${newLevel}. Seviye**'ye ulaştın!`);
      setTimeout(() => lvlMsg.delete().catch(() => {}), 8000);
    } catch (_) {}
  }
});

// ============================================================
// LOGIN
// ============================================================
client.login(process.env.DISCORD_TOKEN);
