import discord
from discord.ext import commands
from discord import app_commands
import asyncio
import datetime
import os

# ===================== AYARLAR =====================
TOKEN = os.environ.get("TOKEN")

intents = discord.Intents.all()
bot = commands.Bot(command_prefix="!", intents=intents)

# ===================== VERİLER =====================
mod_log_kanal = {}
uyari_roller = {}
uyarilar = {}
kufur_koruma_durumu = {}
afk_kullanicilar = {}
banli_kullanicilar = set()

KUFUR_LISTESI = [
    "küfür1", "küfür2", "orospu", "bok", "sik", "amk", "oç",
    "piç", "göt", "yarrak", "am", "ibne", "götveren",
    "orospu çocuğu", "salak", "aptal", "gerizekalı"
]

# ===================== YARDIMCI FONKSİYONLAR =====================
def log_embed(baslik, renk, alanlar):
    embed = discord.Embed(
        title=baslik,
        color=renk,
        timestamp=datetime.datetime.utcnow()
    )

    for isim, deger, inline in alanlar:
        embed.add_field(name=isim, value=deger, inline=inline)

    return embed


async def mod_log_gonder(guild, embed):
    if guild.id in mod_log_kanal:
        kanal = guild.get_channel(mod_log_kanal[guild.id])
        if kanal:
            await kanal.send(embed=embed)


async def uyari_temizle(guild_id, user_id, delay):
    await asyncio.sleep(delay)

    if guild_id in uyarilar and user_id in uyarilar[guild_id]:
        if uyarilar[guild_id][user_id]["seviye"] > 0:
            uyarilar[guild_id][user_id]["seviye"] -= 1


# ===================== EVENTS =====================
@bot.event
async def on_ready():
    try:
        synced = await bot.tree.sync()
        print(f"✅ {len(synced)} slash komut senklendi.")
    except Exception as e:
        print(f"❌ Sync hatası: {e}")

    print(f"🤖 {bot.user} aktif!")


@bot.event
async def on_message(message):
    if message.author.bot:
        return

    if not message.guild:
        return

    # AFK çıkışı
    if message.author.id in afk_kullanicilar:
        del afk_kullanicilar[message.author.id]

        nick = message.author.display_name.replace(" (AFK)", "")

        try:
            await message.author.edit(nick=nick)
        except:
            pass

        await message.channel.send(
            f"👋 {message.author.mention}, AFK modundan çıktınız!",
            delete_after=5
        )

    # AFK mention kontrolü
    for mention in message.mentions:
        if mention.id in afk_kullanicilar:
            sebep = afk_kullanicilar[mention.id]

            await message.channel.send(
                f"💤 {mention.display_name} şu anda AFK! Sebep: {sebep}",
                delete_after=10
            )

    # Küfür koruması
    guild_id = message.guild.id

    if kufur_koruma_durumu.get(guild_id, False):
        icerik = message.content.lower()

        if any(kufur in icerik for kufur in KUFUR_LISTESI):
            try:
                await message.delete()
            except:
                pass

            try:
                await message.author.timeout(
                    datetime.timedelta(minutes=1),
                    reason="Küfür koruması"
                )
            except:
                pass

            await message.channel.send(
                f"🚫 {message.author.mention}, küfür yasak!",
                delete_after=5
            )

    await bot.process_commands(message)


# ===================== BAN =====================
@bot.tree.command(name="ban", description="Kullanıcıyı banlar")
@app_commands.checks.has_permissions(ban_members=True)
async def ban(interaction: discord.Interaction, kullanici: discord.Member, sebep: str):

    embed_dm = discord.Embed(
        title=f"🔨 {interaction.guild.name}",
        description=f"Sebep: {sebep} nedeniyle banlandınız.",
        color=discord.Color.red(),
        timestamp=datetime.datetime.utcnow()
    )

    embed_dm.set_footer(
        text=f"{interaction.guild.name} Moderasyon Sistemi"
    )

    try:
        await kullanici.send(embed=embed_dm)
    except:
        pass

    await kullanici.ban(reason=sebep)
    banli_kullanicilar.add(kullanici.id)

    embed = discord.Embed(
        title="✅ Kullanıcı Banlandı",
        color=discord.Color.red()
    )

    embed.add_field(
        name="👤 Kullanıcı",
        value=f"{kullanici} ({kullanici.id})",
        inline=False
    )

    embed.add_field(
        name="📋 Sebep",
        value=sebep,
        inline=False
    )

    await interaction.response.send_message(embed=embed)


# ===================== UNBAN =====================
@bot.tree.command(name="unban", description="Ban kaldırır")
@app_commands.checks.has_permissions(ban_members=True)
async def unban(interaction: discord.Interaction, kullanici_id: str):

    try:
        uid = int(kullanici_id)
    except:
        await interaction.response.send_message(
            "❌ Geçersiz ID",
            ephemeral=True
        )
        return

    bans = [entry async for entry in interaction.guild.bans()]

    hedef = next((b.user for b in bans if b.user.id == uid), None)

    if hedef is None:
        await interaction.response.send_message(
            "❌ Kullanıcı bulunamadı",
            ephemeral=True
        )
        return

    await interaction.guild.unban(hedef)

    embed = discord.Embed(
        title="✅ Ban kaldırıldı",
        color=discord.Color.green()
    )

    embed.add_field(name="👤 Kullanıcı", value=str(hedef), inline=False)

    await interaction.response.send_message(embed=embed)


# ===================== KICK =====================
@bot.tree.command(name="kick", description="Kullanıcıyı atar")
@app_commands.checks.has_permissions(kick_members=True)
async def kick(interaction: discord.Interaction, kullanici: discord.Member, sebep: str):

    try:
        await kullanici.send(
            f"{interaction.guild.name} sunucusundan atıldınız. Sebep: {sebep}"
        )
    except:
        pass

    await kullanici.kick(reason=sebep)

    embed = discord.Embed(
        title="✅ Kullanıcı atıldı",
        color=discord.Color.orange()
    )

    embed.add_field(name="👤 Kullanıcı", value=str(kullanici), inline=False)
    embed.add_field(name="📋 Sebep", value=sebep, inline=False)

    await interaction.response.send_message(embed=embed)


# ===================== SUSTUR =====================
@bot.tree.command(name="sustur", description="Kullanıcıyı susturur")
@app_commands.checks.has_permissions(moderate_members=True)
async def sustur(
    interaction: discord.Interaction,
    kullanici: discord.Member,
    sebep: str,
    sure: int = 10
):

    await kullanici.timeout(
        datetime.timedelta(minutes=sure),
        reason=sebep
    )

    embed = discord.Embed(
        title="🔇 Kullanıcı susturuldu",
        color=discord.Color.dark_grey()
    )

    embed.add_field(name="👤 Kullanıcı", value=str(kullanici), inline=False)
    embed.add_field(name="⏱️ Süre", value=f"{sure} dakika", inline=False)
    embed.add_field(name="📋 Sebep", value=sebep, inline=False)

    await interaction.response.send_message(embed=embed)


# ===================== AFK =====================
@bot.tree.command(name="afk", description="AFK moduna gir")
async def afk(interaction: discord.Interaction, sebep: str = "Sebep belirtilmedi"):

    afk_kullanicilar[interaction.user.id] = sebep

    try:
        if "(AFK)" not in interaction.user.display_name:
            yeni_nick = f"{interaction.user.display_name} (AFK)"
            await interaction.user.edit(nick=yeni_nick)
    except:
        pass

    embed = discord.Embed(
        title="💤 AFK Modu",
        description=f"Sebep: {sebep}",
        color=discord.Color.light_grey()
    )

    await interaction.response.send_message(embed=embed)


# ===================== KÜFÜR KORUMA =====================
@bot.tree.command(name="kufur_koruma", description="Küfür korumasını açar/kapatır")
@app_commands.checks.has_permissions(administrator=True)
async def kufur_koruma(interaction: discord.Interaction, durum: str):

    aktif = durum.lower() == "ac"

    kufur_koruma_durumu[interaction.guild.id] = aktif

    durum_yazi = "Açıldı" if aktif else "Kapatıldı"

    embed = discord.Embed(
        title=f"🛡️ Küfür Koruması {durum_yazi}",
        color=discord.Color.green() if aktif else discord.Color.red()
    )

    await interaction.response.send_message(embed=embed)


# ===================== MOD LOG =====================
@bot.tree.command(name="mod_log_ayarla", description="Mod log kanalını ayarlar")
@app_commands.checks.has_permissions(administrator=True)
async def mod_log_ayarla(interaction: discord.Interaction, kanal: discord.TextChannel):

    mod_log_kanal[interaction.guild.id] = kanal.id

    await interaction.response.send_message(
        f"✅ Mod log kanalı {kanal.mention} olarak ayarlandı"
    )


# ===================== ANKET =====================
@bot.tree.command(name="anket", description="Anket oluşturur")
async def anket(
    interaction: discord.Interaction,
    soru: str,
    cevap1: str,
    cevap2: str,
    cevap3: str = None
):

    emojiler = ["1️⃣", "2️⃣", "3️⃣"]
    cevaplar = [cevap1, cevap2]

    if cevap3:
        cevaplar.append(cevap3)

    aciklama = "\n".join([
        f"{emojiler[i]} {cevaplar[i]}"
        for i in range(len(cevaplar))
    ])

    embed = discord.Embed(
        title=f"📊 {soru}",
        description=aciklama,
        color=discord.Color.blurple()
    )

    await interaction.response.send_message(embed=embed)

    mesaj = await interaction.original_response()

    for i in range(len(cevaplar)):
        await mesaj.add_reaction(emojiler[i])


# ===================== HATA YÖNETİMİ =====================
@ban.error
@kick.error
@sustur.error
async def hata(interaction: discord.Interaction, error):

    if isinstance(error, app_commands.MissingPermissions):
        await interaction.response.send_message(
            "❌ Yetkiniz yok!",
            ephemeral=True
        )
    else:
        await interaction.response.send_message(
            f"❌ Hata: {error}",
            ephemeral=True
        )


# ===================== BOT BAŞLAT =====================
if TOKEN is None:
    print("❌ TOKEN bulunamadı!")
else:
    bot.run(TOKEN)