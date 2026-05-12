import discord
from discord.ext import commands
from discord import app_commands
import sqlite3
import os
import datetime
import asyncio

# ===================== BOT SETUP =====================
TOKEN = os.getenv("TOKEN")
OWNER_ID = int(os.getenv("OWNER_ID", "0"))

intents = discord.Intents.all()
bot = commands.Bot(command_prefix="!", intents=intents)

# ===================== DATABASE =====================
db = sqlite3.connect("bot.db")
cursor = db.cursor()

cursor.execute("CREATE TABLE IF NOT EXISTS modlog (guild_id INTEGER PRIMARY KEY, channel_id INTEGER)")
cursor.execute("CREATE TABLE IF NOT EXISTS afk (user_id INTEGER PRIMARY KEY, reason TEXT)")
cursor.execute("CREATE TABLE IF NOT EXISTS user_warning (guild_id INTEGER, user_id INTEGER, warning_count INTEGER)")
cursor.execute("CREATE TABLE IF NOT EXISTS level_settings (guild_id INTEGER, level INTEGER, required_xp INTEGER)")
cursor.execute("CREATE TABLE IF NOT EXISTS user_levels (guild_id INTEGER, user_id INTEGER, xp INTEGER, level INTEGER)")
cursor.execute("CREATE TABLE IF NOT EXISTS level_rewards (guild_id INTEGER, level INTEGER, role_id INTEGER)")
db.commit()

# ===================== EMBED STYLE =====================
def create_embed(title: str, description: str, color=0x2b2d31):
    return discord.Embed(
        title=f"✨ {title}",
        description=description,
        color=color,
        timestamp=discord.utils.utcnow()
    )

# ===================== MOD LOG =====================
async def send_mod_log(guild, title, user, reason, color):
    cursor.execute("SELECT channel_id FROM modlog WHERE guild_id=?", (guild.id,))
    data = cursor.fetchone()

    if data:
        channel = guild.get_channel(data[0])

        if channel:
            embed = discord.Embed(
                title=f"📌 {title}",
                color=color,
                timestamp=discord.utils.utcnow()
            )
            embed.add_field(name="Kullanıcı", value=str(user), inline=True)
            embed.add_field(name="Sebep", value=reason, inline=False)
            embed.set_footer(text="Moderasyon Sistemi")

            await channel.send(embed=embed)

# ===================== BOT READY =====================
@bot.event
async def on_ready():
    await bot.tree.sync()
    print("Bot aktif ve hazır!")

# ===================== AFK SYSTEM =====================
@bot.tree.command(
    name="afk",
    description="AFK moduna girmenizi sağlar ve sebep belirlemenizi ister."
)
async def afk(interaction: discord.Interaction, sebep: str):

    cursor.execute("REPLACE INTO afk VALUES (?,?)", (interaction.user.id, sebep))
    db.commit()

    try:
        await interaction.user.edit(nick=f"{interaction.user.display_name} [AFK]")
    except:
        pass

    await interaction.response.send_message(
        embed=create_embed("AFK Aktif", f"Sebep: {sebep}", 0x3498db),
        ephemeral=True
    )

# ===================== MESSAGE XP SYSTEM =====================
@bot.event
async def on_message(message):

    if message.author.bot:
        return

    # AFK CHECK
    cursor.execute("SELECT reason FROM afk WHERE user_id=?", (message.author.id,))
    afk_data = cursor.fetchone()

    if afk_data:
        cursor.execute("DELETE FROM afk WHERE user_id=?", (message.author.id,))
        db.commit()

        try:
            await message.author.edit(nick=message.author.display_name.replace(" [AFK]", ""))
        except:
            pass

    for mention in message.mentions:
        cursor.execute("SELECT reason FROM afk WHERE user_id=?", (mention.id,))
        data = cursor.fetchone()

        if data:
            await message.channel.send(
                embed=create_embed("AFK Bilgisi", f"{mention.display_name} sebep: {data[0]}", 0x95a5a6)
            )

    # XP SYSTEM
    guild_id = message.guild.id
    user_id = message.author.id

    cursor.execute("SELECT xp, level FROM user_levels WHERE guild_id=? AND user_id=?", (guild_id, user_id))
    data = cursor.fetchone()

    xp, level = data if data else (0, 1)

    xp += 5

    cursor.execute("SELECT required_xp FROM level_settings WHERE guild_id=? AND level=?", (guild_id, level + 1))
    req = cursor.fetchone()
    req = req[0] if req else (level + 1) * 100

    if xp >= req:
        level += 1
        xp = 0

        cursor.execute("SELECT role_id FROM level_rewards WHERE guild_id=? AND level=?", (guild_id, level))
        role_data = cursor.fetchone()

        if role_data:
            role = message.guild.get_role(role_data[0])
            if role:
                await message.author.add_roles(role)

        await message.channel.send(
            embed=create_embed("Seviye Atladın!", f"{message.author.mention} → Seviye {level}", 0xf1c40f)
        )

    cursor.execute("REPLACE INTO user_levels VALUES (?,?,?,?)", (guild_id, user_id, xp, level))
    db.commit()

    await bot.process_commands(message)

# ===================== TEMİZLE KOMUTU =====================
@bot.tree.command(
    name="mesaj_temizle",
    description="Belirtilen sayıda mesaj siler (1-100 arası)."
)
async def mesaj_temizle(interaction: discord.Interaction, mesaj_sayisi: int):

    if not 1 <= mesaj_sayisi <= 100:
        return await interaction.response.send_message("1-100 arası olmalı", ephemeral=True)

    await interaction.channel.purge(limit=mesaj_sayisi)

    await interaction.response.send_message(
        embed=create_embed("Temizlik Tamamlandı", f"{mesaj_sayisi} mesaj silindi", 0x95a5a6),
        ephemeral=True
    )

# ===================== BAN =====================
@bot.tree.command(
    name="sunucu_ban",
    description="Kullanıcıyı sunucudan banlar ve DM gönderir."
)
async def ban(interaction, kullanıcı: discord.Member, sebep: str):

    try:
        await kullanıcı.send(
            embed=create_embed("Sunucudan Yasaklandın", f"Sebep: {sebep}", 0xff0000)
        )
    except:
        pass

    await kullanıcı.ban(reason=sebep)

    await send_mod_log(interaction.guild, "BAN", kullanıcı, sebep, 0xff0000)

    await interaction.response.send_message(
        embed=create_embed("Ban İşlemi", "Başarıyla tamamlandı", 0xff0000),
        ephemeral=True
    )

# ===================== KICK =====================
@bot.tree.command(
    name="sunucu_at",
    description="Kullanıcıyı sunucudan atar ve DM gönderir."
)
async def kick(interaction, kullanıcı: discord.Member, sebep: str):

    try:
        await kullanıcı.send(
            embed=create_embed("Sunucudan Atıldın", f"Sebep: {sebep}", 0xffa500)
        )
    except:
        pass

    await kullanıcı.kick(reason=sebep)

    await send_mod_log(interaction.guild, "KICK", kullanıcı, sebep, 0xffa500)

    await interaction.response.send_message(
        embed=create_embed("Kick İşlemi", "Başarıyla tamamlandı", 0xffa500),
        ephemeral=True
    )

# ===================== MUTE =====================
@bot.tree.command(
    name="sunucu_sustur",
    description="Kullanıcıyı süreli susturur."
)
async def mute(interaction, kullanıcı: discord.Member, sure_dakika: int, sebep: str):

    await kullanıcı.timeout(datetime.timedelta(minutes=sure_dakika), reason=sebep)

    await send_mod_log(interaction.guild, "MUTE", kullanıcı, sebep, 0xffff00)

    await interaction.response.send_message(
        embed=create_embed("Susturma İşlemi", "Başarıyla tamamlandı", 0xffff00),
        ephemeral=True
    )

# ===================== MOD LOG =====================
@bot.tree.command(
    name="mod_log_kanali_ayarla",
    description="Mod log kanalını ayarlar."
)
async def modlog(interaction, kanal: discord.TextChannel):

    cursor.execute("REPLACE INTO modlog VALUES (?,?)", (interaction.guild.id, kanal.id))
    db.commit()

    await interaction.response.send_message(
        embed=create_embed("Mod Log Ayarlandı", kanal.mention, 0x5865f2),
        ephemeral=True
    )

# ===================== LEVEL ROLE =====================
@bot.tree.command(
    name="seviye_rol_ayarla",
    description="Seviyelere göre verilecek rolleri ayarlar."
)
async def level_roles(interaction,
    seviye_bir: discord.Role,
    seviye_iki: discord.Role,
    seviye_uc: discord.Role,
    seviye_dort: discord.Role,
    seviye_bes: discord.Role
):

    roles = [seviye_bir, seviye_iki, seviye_uc, seviye_dort, seviye_bes]

    for i, role in enumerate(roles, start=1):
        cursor.execute("REPLACE INTO level_rewards VALUES (?,?,?)", (interaction.guild.id, i, role.id))

    db.commit()

    await interaction.response.send_message(
        embed=create_embed("Seviye Rolleri Ayarlandı", "1-5 level sistem hazır", 0x00ffcc)
    )

# ===================== LEVEL XP AYAR =====================
@bot.tree.command(
    name="seviye_xp_ayarla",
    description="Seviyeler için gerekli XP miktarını ayarlar."
)
async def level_xp(interaction,
    seviye_bir: int,
    seviye_iki: int,
    seviye_uc: int,
    seviye_dort: int,
    seviye_bes: int
):

    values = [seviye_bir, seviye_iki, seviye_uc, seviye_dort, seviye_bes]

    for i, xp in enumerate(values, start=1):
        cursor.execute("REPLACE INTO level_settings VALUES (?,?,?)", (interaction.guild.id, i, xp))

    db.commit()

    await interaction.response.send_message(
        embed=create_embed("XP Sistemi Ayarlandı", "Level sistemi aktif", 0x2ecc71)
    )

# ===================== LEVEL GÖR =====================
@bot.tree.command(
    name="seviye",
    description="Kullanıcının seviyesini gösterir."
)
async def level(interaction, kullanıcı: discord.Member = None):

    user = kullanıcı or interaction.user

    cursor.execute("SELECT xp, level FROM user_levels WHERE guild_id=? AND user_id=?", (interaction.guild.id, user.id))
    data = cursor.fetchone()

    if not data:
        return await interaction.response.send_message("Veri yok")

    xp, level = data

    await interaction.response.send_message(
        embed=create_embed("Seviye Bilgisi", f"{user.mention}\nLevel: {level}\nXP: {xp}", 0xf1c40f)
    )

# ===================== ADMIN =====================
@bot.tree.command(
    name="admin_sistem",
    description="Sistemi senkronize eder (sadece owner)."
)
async def admin(interaction):

    if interaction.user.id != OWNER_ID:
        return await interaction.response.send_message("Yetki yok", ephemeral=True)

    await bot.tree.sync()

    await interaction.response.send_message(
        embed=create_embed("Sistem Güncellendi", "Komutlar sync edildi", 0x00ffcc),
        ephemeral=True
    )

# ===================== RUN =====================
bot.run(TOKEN)
