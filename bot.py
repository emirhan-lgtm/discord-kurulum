import discord
from discord.ext import commands, tasks
from discord import app_commands
import sqlite3
import os
import asyncio
import datetime

# =========================================================
# BOT AYARLARI
# =========================================================

TOKEN = os.getenv("TOKEN")
OWNER_ID = int(os.getenv("OWNER_ID", "0"))

intents = discord.Intents.all()

bot = commands.Bot(
    command_prefix="!",
    intents=intents
)

# =========================================================
# DATABASE
# =========================================================

db = sqlite3.connect("bot.db")
cursor = db.cursor()

cursor.execute("""
CREATE TABLE IF NOT EXISTS mod_log (
    guild_id INTEGER PRIMARY KEY,
    channel_id INTEGER
)
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS afk_users (
    user_id INTEGER PRIMARY KEY,
    reason TEXT
)
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS warning_system (
    guild_id INTEGER,
    user_id INTEGER,
    warning_level INTEGER,
    warning_time TEXT
)
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS warning_roles (
    guild_id INTEGER,
    level INTEGER,
    role_id INTEGER,
    mute_minutes INTEGER
)
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS profanity_system (
    guild_id INTEGER PRIMARY KEY,
    enabled INTEGER
)
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS level_roles (
    guild_id INTEGER,
    level INTEGER,
    role_id INTEGER
)
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS level_settings (
    guild_id INTEGER,
    level INTEGER,
    required_messages INTEGER
)
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS user_levels (
    guild_id INTEGER,
    user_id INTEGER,
    message_count INTEGER,
    level INTEGER
)
""")

db.commit()

# =========================================================
# KÜFÜR LİSTESİ
# =========================================================

BAD_WORDS = [
    "amk",
    "orospu",
    "sik",
    "piç",
    "oç",
    "yarrak",
    "göt",
    "ibne",
    "salak",
    "aptal"
]

# =========================================================
# EMBED SİSTEMİ
# =========================================================

def create_embed(title, description, color=0x2b2d31):

    embed = discord.Embed(
        title=f"✨ {title}",
        description=description,
        color=color,
        timestamp=discord.utils.utcnow()
    )

    return embed

# =========================================================
# MOD LOG
# =========================================================

async def send_mod_log(guild, title, description, color=0x5865F2, image_url=None):

    cursor.execute(
        "SELECT channel_id FROM mod_log WHERE guild_id=?",
        (guild.id,)
    )

    data = cursor.fetchone()

    if not data:
        return

    channel = guild.get_channel(data[0])

    if not channel:
        return

    embed = discord.Embed(
        title=title,
        description=description,
        color=color,
        timestamp=discord.utils.utcnow()
    )

    if image_url:
        embed.set_image(url=image_url)

    embed.set_footer(text=f"{guild.name} Moderasyon Sistemi")

    await channel.send(embed=embed)

# =========================================================
# READY
# =========================================================

@bot.event
async def on_ready():

    try:
        await bot.tree.sync()
    except Exception as error:
        print(error)

    print(f"{bot.user} aktif!")

# =========================================================
# AFK + XP + KÜFÜR SİSTEMİ
# =========================================================

@bot.event
async def on_message(message):

    if message.author.bot or not message.guild:
        return

    # =====================================================
    # AFK ÇIKIŞ
    # =====================================================

    cursor.execute(
        "SELECT reason FROM afk_users WHERE user_id=?",
        (message.author.id,)
    )

    afk_data = cursor.fetchone()

    if afk_data:

        cursor.execute(
            "DELETE FROM afk_users WHERE user_id=?",
            (message.author.id,)
        )

        db.commit()

        try:
            await message.author.edit(
                nick=message.author.display_name.replace(" [AFK]", "")
            )
        except:
            pass

        await message.channel.send(
            embed=create_embed(
                "AFK Modundan Çıkıldı",
                f"{message.author.mention} artık AFK değil.",
                0x2ecc71
            ),
            delete_after=5
        )

    # =====================================================
    # AFK ETİKET
    # =====================================================

    for mention in message.mentions:

        if mention.bot:
            continue

        cursor.execute(
            "SELECT reason FROM afk_users WHERE user_id=?",
            (mention.id,)
        )

        data = cursor.fetchone()

        if data:

            await message.channel.send(
                embed=create_embed(
                    "AFK Kullanıcı",
                    f"{mention.mention} şu anda AFK.\n\nSebep: **{data[0]}**",
                    0x95a5a6
                ),
                delete_after=7
            )

    # =====================================================
    # KÜFÜR KORUMA
    # =====================================================

    cursor.execute(
        "SELECT enabled FROM profanity_system WHERE guild_id=?",
        (message.guild.id,)
    )

    profanity_data = cursor.fetchone()

    if profanity_data and profanity_data[0] == 1:

        lower_content = message.content.lower()

        if any(word in lower_content for word in BAD_WORDS):

            try:
                await message.delete()

                await message.author.timeout(
                    datetime.timedelta(minutes=1),
                    reason="Küfür Koruması"
                )

                await message.channel.send(
                    embed=create_embed(
                        "Küfür Engellendi",
                        f"{message.author.mention} otomatik olarak 1 dakika susturuldu.",
                        0xe74c3c
                    ),
                    delete_after=5
                )

                await send_mod_log(
                    message.guild,
                    "🛡️ Küfür Koruması",
                    f"""
👤 Kullanıcı: {message.author}

📄 Sebep:
Otomatik küfür koruması aktif oldu.
                    """,
                    0xe74c3c
                )

            except:
                pass

    # =====================================================
    # XP SİSTEMİ
    # =====================================================

    guild_id = message.guild.id
    user_id = message.author.id

    cursor.execute(
        "SELECT message_count, level FROM user_levels WHERE guild_id=? AND user_id=?",
        (guild_id, user_id)
    )

    data = cursor.fetchone()

    if not data:
        message_count = 0
        level = 0
    else:
        message_count, level = data

    message_count += 1

    cursor.execute(
        "SELECT required_messages FROM level_settings WHERE guild_id=? AND level=?",
        (guild_id, level + 1)
    )

    next_level_data = cursor.fetchone()

    if next_level_data:

        required_messages = next_level_data[0]

        if message_count >= required_messages:

            level += 1

            cursor.execute(
                "SELECT role_id FROM level_roles WHERE guild_id=? AND level=?",
                (guild_id, level)
            )

            role_data = cursor.fetchone()

            if role_data:

                role = message.guild.get_role(role_data[0])

                if role:
                    await message.author.add_roles(role)

            await message.channel.send(
                embed=create_embed(
                    "🎉 Seviye Atlandı",
                    f"{message.author.mention} artık **Seviye {level}** oldu!",
                    0xf1c40f
                )
            )

            message_count = 0

    cursor.execute(
        "REPLACE INTO user_levels VALUES (?,?,?,?)",
        (guild_id, user_id, message_count, level)
    )

    db.commit()

    await bot.process_commands(message)

# =========================================================
# MOD LOG AYARLA
# =========================================================

@bot.tree.command(
    name="mod_log_ayarla",
    description="Moderasyon log kanalını ayarlar."
)
async def mod_log_ayarla(
    interaction: discord.Interaction,
    kanal: discord.TextChannel
):

    cursor.execute(
        "REPLACE INTO mod_log VALUES (?,?)",
        (interaction.guild.id, kanal.id)
    )

    db.commit()

    await interaction.response.send_message(
        embed=create_embed(
            "Mod Log Ayarlandı",
            f"Log kanalı: {kanal.mention}",
            0x5865F2
        ),
        ephemeral=True
    )

# =========================================================
# BAN
# =========================================================

@bot.tree.command(
    name="ban",
    description="Kullanıcıyı sunucudan yasaklar."
)
async def ban(
    interaction: discord.Interaction,
    kullanıcı: discord.Member,
    sebep: str,
    kanıt: discord.Attachment = None
):

    try:

        dm_embed = discord.Embed(
            title="⛔ Sunucudan Yasaklandınız",
            description=f"""
🏠 Sunucu:
**{interaction.guild.name}**

📄 Sebep:
**{sebep}**
            """,
            color=0xe74c3c
        )

        await kullanıcı.send(embed=dm_embed)

    except:
        pass

    await kullanıcı.ban(reason=sebep)

    image_url = kanıt.url if kanıt else None

    await send_mod_log(
        interaction.guild,
        "🔨 Kullanıcı Banlandı",
        f"""
👤 Banlanan:
{kullanıcı} ({kullanıcı.id})

🛡️ Yetkili:
{interaction.user} ({interaction.user.id})

📄 Sebep:
{sebep}
        """,
        0xe74c3c,
        image_url
    )

    await interaction.response.send_message(
        embed=create_embed(
            "Ban İşlemi Başarılı",
            f"{kullanıcı.mention} sunucudan banlandı.",
            0xe74c3c
        )
    )

# =========================================================
# UNBAN
# =========================================================

@bot.tree.command(
    name="unban",
    description="ID ile kullanıcının banını kaldırır."
)
async def unban(
    interaction: discord.Interaction,
    kullanıcı_id: str
):

    try:

        user = await bot.fetch_user(int(kullanıcı_id))

        await interaction.guild.unban(user)

        await send_mod_log(
            interaction.guild,
            "🔓 Ban Kaldırıldı",
            f"""
👤 Kullanıcı:
{user} ({user.id})

🛡️ Yetkili:
{interaction.user}
            """,
            0x2ecc71
        )

        await interaction.response.send_message(
            embed=create_embed(
                "Ban Kaldırıldı",
                f"{user} kullanıcısının banı kaldırıldı.",
                0x2ecc71
            )
        )

    except:
        await interaction.response.send_message(
            embed=create_embed(
                "Hata",
                "Girilen kullanıcı ID'si banlı değil.",
                0xe74c3c
            ),
            ephemeral=True
        )

# =========================================================
# KICK
# =========================================================

@bot.tree.command(
    name="kick",
    description="Kullanıcıyı sunucudan atar."
)
async def kick(
    interaction: discord.Interaction,
    kullanıcı: discord.Member,
    sebep: str
):

    try:

        await kullanıcı.send(
            embed=create_embed(
                "Sunucudan Atıldınız",
                f"""
🏠 Sunucu:
**{interaction.guild.name}**

📄 Sebep:
**{sebep}**
                """,
                0xf39c12
            )
        )

    except:
        pass

    await kullanıcı.kick(reason=sebep)

    await send_mod_log(
        interaction.guild,
        "👢 Kullanıcı Atıldı",
        f"""
👤 Kullanıcı:
{kullanıcı} ({kullanıcı.id})

🛡️ Yetkili:
{interaction.user} ({interaction.user.id})

📄 Sebep:
{sebep}
        """,
        0xf39c12
    )

    await interaction.response.send_message(
        embed=create_embed(
            "Kick İşlemi Başarılı",
            f"{kullanıcı.mention} sunucudan atıldı.",
            0xf39c12
        )
    )

# =========================================================
# SUSTUR
# =========================================================

@bot.tree.command(
    name="sustur",
    description="Kullanıcıyı süreli susturur."
)
async def sustur(
    interaction: discord.Interaction,
    kullanıcı: discord.Member,
    süre_dakika: int,
    sebep: str
):

    await kullanıcı.timeout(
        datetime.timedelta(minutes=süre_dakika),
        reason=sebep
    )

    try:

        await kullanıcı.send(
            embed=create_embed(
                "Susturuldunuz",
                f"""
🏠 Sunucu:
**{interaction.guild.name}**

📄 Sebep:
**{sebep}**

⏰ Süre:
**{süre_dakika} dakika**
                """,
                0xf1c40f
            )
        )

    except:
        pass

    await send_mod_log(
        interaction.guild,
        "🔇 Kullanıcı Susturuldu",
        f"""
👤 Kullanıcı:
{kullanıcı} ({kullanıcı.id})

🛡️ Yetkili:
{interaction.user} ({interaction.user.id})

📄 Sebep:
{sebep}
        """,
        0xf1c40f
    )

    await interaction.response.send_message(
        embed=create_embed(
            "Susturma İşlemi",
            f"{kullanıcı.mention} susturuldu.",
            0xf1c40f
        )
    )

# =========================================================
# AFK
# =========================================================

@bot.tree.command(
    name="afk",
    description="AFK moduna girmenizi sağlar."
)
async def afk(
    interaction: discord.Interaction,
    sebep: str
):

    cursor.execute(
        "REPLACE INTO afk_users VALUES (?,?)",
        (interaction.user.id, sebep)
    )

    db.commit()

    try:
        await interaction.user.edit(
            nick=f"{interaction.user.display_name} [AFK]"
        )
    except:
        pass

    await interaction.response.send_message(
        embed=create_embed(
            "AFK Modu Aktif",
            f"Sebep: **{sebep}**",
            0x3498db
        ),
        ephemeral=True
    )

# =========================================================
# KÜFÜR KORUMA
# =========================================================

@bot.tree.command(
    name="küfür_koruma",
    description="Küfür koruma sistemini açar veya kapatır."
)
@app_commands.choices(
    durum=[
        app_commands.Choice(name="Aç", value="ac"),
        app_commands.Choice(name="Kapat", value="kapat")
    ]
)
async def küfür_koruma(
    interaction: discord.Interaction,
    durum: app_commands.Choice[str]
):

    value = 1 if durum.value == "ac" else 0

    cursor.execute(
        "REPLACE INTO profanity_system VALUES (?,?)",
        (interaction.guild.id, value)
    )

    db.commit()

    text = "aktif edildi" if value == 1 else "devre dışı bırakıldı"

    await interaction.response.send_message(
        embed=create_embed(
            "Küfür Koruma Sistemi",
            f"Sistem başarıyla **{text}**.",
            0x5865F2
        )
    )

# =========================================================
# LEVEL ROL AYAR
# =========================================================

@bot.tree.command(
    name="seviye_rol_ayarla",
    description="Seviyelere verilecek rolleri ayarlar."
)
async def seviye_rol_ayarla(
    interaction: discord.Interaction,
    seviye_bir: discord.Role,
    seviye_iki: discord.Role,
    seviye_uc: discord.Role,
    seviye_dort: discord.Role,
    seviye_bes: discord.Role
):

    roles = [
        seviye_bir,
        seviye_iki,
        seviye_uc,
        seviye_dort,
        seviye_bes
    ]

    for level, role in enumerate(roles, start=1):

        cursor.execute(
            "REPLACE INTO level_roles VALUES (?,?,?)",
            (interaction.guild.id, level, role.id)
        )

    db.commit()

    await interaction.response.send_message(
        embed=create_embed(
            "Seviye Rolleri Ayarlandı",
            "1-5 arası level rolleri başarıyla ayarlandı.",
            0x2ecc71
        )
    )

# =========================================================
# LEVEL XP AYAR
# =========================================================

@bot.tree.command(
    name="seviye_oyun",
    description="Her seviye için gerekli mesaj sayısını ayarlar."
)
async def seviye_oyun(
    interaction: discord.Interaction,
    seviye_bir: int,
    seviye_iki: int,
    seviye_uc: int,
    seviye_dort: int,
    seviye_bes: int
):

    values = [
        seviye_bir,
        seviye_iki,
        seviye_uc,
        seviye_dort,
        seviye_bes
    ]

    for level, value in enumerate(values, start=1):

        cursor.execute(
            "REPLACE INTO level_settings VALUES (?,?,?)",
            (interaction.guild.id, level, value)
        )

    db.commit()

    await interaction.response.send_message(
        embed=create_embed(
            "Seviye Sistemi Ayarlandı",
            "Mesaj XP sistemi başarıyla ayarlandı.",
            0x2ecc71
        )
    )

# =========================================================
# LEVEL GÖR
# =========================================================

@bot.tree.command(
    name="seviye",
    description="Kullanıcının seviyesini gösterir."
)
async def seviye(
    interaction: discord.Interaction,
    kullanıcı: discord.Member = None
):

    target = kullanıcı or interaction.user

    cursor.execute(
        "SELECT message_count, level FROM user_levels WHERE guild_id=? AND user_id=?",
        (interaction.guild.id, target.id)
    )

    data = cursor.fetchone()

    if not data:

        return await interaction.response.send_message(
            embed=create_embed(
                "Seviye Bilgisi",
                "Kullanıcının verisi bulunamadı.",
                0xe74c3c
            )
        )

    message_count, level = data

    await interaction.response.send_message(
        embed=create_embed(
            "📊 Seviye Bilgisi",
            f"""
👤 Kullanıcı:
{target.mention}

⭐ Seviye:
**{level}**

💬 Mesaj:
**{message_count}**
            """,
            0xf1c40f
        )
    )

# =========================================================
# MESAJ TEMİZLE
# =========================================================

@bot.tree.command(
    name="mesaj_temizle",
    description="1-100 arası mesaj siler."
)
async def mesaj_temizle(
    interaction: discord.Interaction,
    miktar: int
):

    if miktar < 1 or miktar > 100:

        return await interaction.response.send_message(
            embed=create_embed(
                "Hata",
                "1 ile 100 arasında sayı girin.",
                0xe74c3c
            ),
            ephemeral=True
        )

    await interaction.channel.purge(limit=miktar)

    await interaction.response.send_message(
        embed=create_embed(
            "Mesajlar Silindi",
            f"{miktar} mesaj başarıyla temizlendi.",
            0x95a5a6
        ),
        ephemeral=True
    )

# =========================================================
# RUN
# =========================================================

bot.run(TOKEN)
