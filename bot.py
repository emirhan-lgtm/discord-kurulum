import discord
from discord.ext import commands
from discord import app_commands
import asyncio
import datetime
import re
import os

# ===================== AYARLAR =====================

TOKEN = os.environ.get("TOKEN")
SUNUCU_ADI = interaction.guild.name

intents = discord.Intents.all()
bot = commands.Bot(command_prefix="!", intents=intents)

# ===================== VERİ DEPOLAMA =====================
mod_log_kanal = {}          # {guild_id: channel_id}
uyari_roller = {}           # {guild_id: {seviye: {"rol": rol_id, "mute": dakika}}}
uyarilar = {}               # {guild_id: {user_id: {"seviye": int, "sure": datetime}}}
kufur_koruma_durumu = {}    # {guild_id: bool}
afk_kullanicilar = {}       # {user_id: sebep}
banli_kullanicilar = set()  # {user_id}

KUFUR_LISTESI = [
    "küfür1", "küfür2", "orospu", "bok", "sik", "amk", "oç",
    "piç", "göt", "yarrak", "am", "orospu", "ibne", "götveren",
    "bok", "orospu çocuğu", "salak", "aptal", "gerizekalı"
]

# ===================== YARDIMCI FONKSİYONLAR =====================
def log_embed(baslik, renk, alanlar):
    embed = discord.Embed(title=baslik, color=renk, timestamp=datetime.datetime.utcnow())
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
    print(f"✅ {bot.user} aktif!")
    await bot.tree.sync()

@bot.event
async def on_message(message):
    if message.author.bot:
        return

    # AFK kontrolü
    if message.author.id in afk_kullanicilar:
        del afk_kullanicilar[message.author.id]
        nick = message.author.display_name.replace(" (AFK)", "")
        try:
            await message.author.edit(nick=nick)
        except:
            pass
        await message.channel.send(f"👋 {message.author.mention}, AFK modundan çıktınız!", delete_after=5)

    # AFK olan birine mention atıldı mı?
    for mention in message.mentions:
        if mention.id in afk_kullanicilar:
            sebep = afk_kullanicilar[mention.id]
            await message.channel.send(
                f"💤 {mention.display_name} şu anda AFK! **Sebep:** {sebep}", delete_after=10
            )

    # Küfür koruması
    guild_id = message.guild.id if message.guild else None
    if guild_id and kufur_koruma_durumu.get(guild_id, False):
        icerik = message.content.lower()
        if any(kufur in icerik for kufur in KUFUR_LISTESI):
            await message.delete()
            try:
                await message.author.timeout(datetime.timedelta(minutes=1), reason="Küfür koruması")
            except:
                pass
            await message.channel.send(
                f"🚫 {message.author.mention}, küfür yasak! 1 dakika susturuldunuz.", delete_after=5
            )

    await bot.process_commands(message)

# ===================== /BAN =====================
@bot.tree.command(name="ban", description="Kullanıcıyı sunucudan banlar.")
@app_commands.describe(kullanici="Banlanacak kullanıcı", sebep="Ban sebebi")
@app_commands.checks.has_permissions(ban_members=True)
async def ban(interaction: discord.Interaction, kullanici: discord.Member, sebep: str):
    embed_dm = discord.Embed(
        title=f"🔨 {interaction.guild.name},
        description=(
            f"```\n"
            f"╔══════════════════════════╗\n"
            f"║        BANLANDINIZ        ║\n"
            f"╚══════════════════════════╝\n"
            f"```\n"
            f"**Sebep:** {sebep} nedeniyle banlandınız."
        ),
        color=discord.Color.red(),
        timestamp=datetime.datetime.utcnow()
    )
    embed_dm.set_thumbnail(url=interaction.guild.icon.url if interaction.guild.icon else None)
    embed_dm.set_footer(text=f"{SUNUCU_ADI} Moderasyon Sistemi")

    try:
        await kullanici.send(embed=embed_dm)
    except:
        pass

    await kullanici.ban(reason=sebep)
    banli_kullanicilar.add(kullanici.id)

    # Onay mesajı
    embed_onay = discord.Embed(
        title="✅ Kullanıcı Banlandı",
        color=discord.Color.red()
    )
    embed_onay.add_field(name="👤 Kullanıcı", value=f"{kullanici} ({kullanici.id})", inline=False)
    embed_onay.add_field(name="📋 Sebep", value=sebep, inline=False)
    embed_onay.add_field(name="🛡️ Yetkili", value=f"{interaction.user}", inline=False)
    await interaction.response.send_message(embed=embed_onay)

    # Mod log
    log = log_embed("🔨 Ban Logu", discord.Color.red(), [
        ("👤 Banlanan", f"{kullanici.mention}\n`{kullanici}` | ID: `{kullanici.id}`", False),
        ("🛡️ Yetkili", f"{interaction.user.mention}\n`{interaction.user}` | ID: `{interaction.user.id}`", False),
        ("📋 Sebep", sebep, False),
    ])
    await mod_log_gonder(interaction.guild, log)

# ===================== /UNBAN =====================
@bot.tree.command(name="unban", description="ID ile kullanıcının banını kaldırır.")
@app_commands.describe(kullanici_id="Banı kaldırılacak kullanıcının ID'si")
@app_commands.checks.has_permissions(ban_members=True)
async def unban(interaction: discord.Interaction, kullanici_id: str):
    try:
        uid = int(kullanici_id)
    except ValueError:
        await interaction.response.send_message("❌ Geçersiz ID!", ephemeral=True)
        return

    bans = [entry async for entry in interaction.guild.bans()]
    hedef = next((b.user for b in bans if b.user.id == uid), None)

    if hedef is None:
        await interaction.response.send_message("❌ Bu ID'ye ait banlı kullanıcı bulunamadı.", ephemeral=True)
        return

    await interaction.guild.unban(hedef)
    banli_kullanicilar.discard(uid)

    embed = discord.Embed(title="✅ Ban Kaldırıldı", color=discord.Color.green())
    embed.add_field(name="👤 Kullanıcı", value=f"{hedef} ({hedef.id})", inline=False)
    embed.add_field(name="🛡️ Yetkili", value=str(interaction.user), inline=False)
    await interaction.response.send_message(embed=embed)

    log = log_embed("✅ Unban Logu", discord.Color.green(), [
        ("👤 Unban Yapılan", f"`{hedef}` | ID: `{hedef.id}`", False),
        ("🛡️ Yetkili", f"{interaction.user.mention} | ID: `{interaction.user.id}`", False),
    ])
    await mod_log_gonder(interaction.guild, log)

# ===================== /KICK =====================
@bot.tree.command(name="kick", description="Kullanıcıyı sunucudan atar.")
@app_commands.describe(kullanici="Atılacak kullanıcı", sebep="Atılma sebebi")
@app_commands.checks.has_permissions(kick_members=True)
async def kick(interaction: discord.Interaction, kullanici: discord.Member, sebep: str):
    embed_dm = discord.Embed(
        title=f"🔨 {interaction.guild.name}",
        description=(
            f"```\n"
            f"╔══════════════════════════╗\n"
            f"║        ATILDINIZ          ║\n"
            f"╚══════════════════════════╝\n"
            f"```\n"
            f"**Sebep:** {sebep} nedeniyle atıldınız."
        ),
        color=discord.Color.orange(),
        timestamp=datetime.datetime.utcnow()
    )
    embed_dm.set_footer(text=f"{SUNUCU_ADI} Moderasyon Sistemi")

    try:
        await kullanici.send(embed=embed_dm)
    except:
        pass

    await kullanici.kick(reason=sebep)

    embed_onay = discord.Embed(title="✅ Kullanıcı Atıldı", color=discord.Color.orange())
    embed_onay.add_field(name="👤 Kullanıcı", value=f"{kullanici} ({kullanici.id})", inline=False)
    embed_onay.add_field(name="📋 Sebep", value=sebep, inline=False)
    embed_onay.add_field(name="🛡️ Yetkili", value=str(interaction.user), inline=False)
    await interaction.response.send_message(embed=embed_onay)

    log = log_embed("👢 Kick Logu", discord.Color.orange(), [
        ("👤 Atılan", f"{kullanici.mention}\n`{kullanici}` | ID: `{kullanici.id}`", False),
        ("🛡️ Yetkili", f"{interaction.user.mention}\n`{interaction.user}` | ID: `{interaction.user.id}`", False),
        ("📋 Sebep", sebep, False),
    ])
    await mod_log_gonder(interaction.guild, log)

# ===================== /DUYURU =====================
@bot.tree.command(name="duyuru", description="Belirlenen kanala duyuru gönderir.")
@app_commands.describe(
    kanal="Duyurunun gönderileceği kanal",
    baslik="Duyuru başlığı (örn: 📢 # Başlık)",
    yazi="Duyuru içeriği",
    etiket="Etiketlenecek rol"
)
@app_commands.checks.has_permissions(manage_messages=True)
async def duyuru(
    interaction: discord.Interaction,
    kanal: discord.TextChannel,
    baslik: str,
    yazi: str,
    etiket: discord.Role = None
):
    embed = discord.Embed(
        title=baslik,
        description=yazi,
        color=discord.Color.blurple(),
        timestamp=datetime.datetime.utcnow()
    )
    embed.set_footer(text=f"{SUNUCU_ADI} • Duyuru", icon_url=interaction.guild.icon.url if interaction.guild.icon else None)
    embed.set_author(name=interaction.guild.name, icon_url=interaction.guild.icon.url if interaction.guild.icon else None)

    mention_str = etiket.mention if etiket else ""
    await kanal.send(content=mention_str, embed=embed)
    await interaction.response.send_message(f"✅ Duyuru {kanal.mention} kanalına gönderildi!", ephemeral=True)

    log = log_embed("📢 Duyuru Logu", discord.Color.blurple(), [
        ("📌 Kanal", kanal.mention, True),
        ("🛡️ Yetkili", str(interaction.user), True),
        ("📋 Başlık", baslik, False),
    ])
    await mod_log_gonder(interaction.guild, log)

# ===================== /MOD_LOG_AYARLA =====================
@bot.tree.command(name="mod_log_ayarla", description="Mod log kanalını ayarlar.")
@app_commands.describe(kanal="Mod logların gönderileceği kanal")
@app_commands.checks.has_permissions(administrator=True)
async def mod_log_ayarla(interaction: discord.Interaction, kanal: discord.TextChannel):
    mod_log_kanal[interaction.guild.id] = kanal.id
    embed = discord.Embed(
        title="✅ Mod Log Ayarlandı",
        description=f"Mod loglar artık {kanal.mention} kanalına gönderilecek.",
        color=discord.Color.green()
    )
    await interaction.response.send_message(embed=embed)

# ===================== /SUSTUR =====================
@bot.tree.command(name="sustur", description="Kullanıcıyı susturur.")
@app_commands.describe(kullanici="Susturulacak kullanıcı", sebep="Susturma sebebi", sure="Süre (dakika, varsayılan: 10)")
@app_commands.checks.has_permissions(moderate_members=True)
async def sustur(interaction: discord.Interaction, kullanici: discord.Member, sebep: str, sure: int = 10):
    embed_dm = discord.Embed(
        title=f"🔨 {interaction.guild.name}",
        description=(
            f"```\n"
            f"╔══════════════════════════╗\n"
            f"║      SUSTURULDUNUZ        ║\n"
            f"╚══════════════════════════╝\n"
            f"```\n"
            f"**Sebep:** {sebep} nedeniyle susturuldunuz.\n"
            f"**Süre:** {sure} dakika"
        ),
        color=discord.Color.dark_grey(),
        timestamp=datetime.datetime.utcnow()
    )
    embed_dm.set_footer(text=f"{SUNUCU_ADI} Moderasyon Sistemi")

    try:
        await kullanici.send(embed=embed_dm)
    except:
        pass

    await kullanici.timeout(datetime.timedelta(minutes=sure), reason=sebep)

    embed_onay = discord.Embed(title="🔇 Kullanıcı Susturuldu", color=discord.Color.dark_grey())
    embed_onay.add_field(name="👤 Kullanıcı", value=f"{kullanici} ({kullanici.id})", inline=False)
    embed_onay.add_field(name="📋 Sebep", value=sebep, inline=False)
    embed_onay.add_field(name="⏱️ Süre", value=f"{sure} dakika", inline=False)
    embed_onay.add_field(name="🛡️ Yetkili", value=str(interaction.user), inline=False)
    await interaction.response.send_message(embed=embed_onay)

    log = log_embed("🔇 Susturma Logu", discord.Color.dark_grey(), [
        ("👤 Susturulan", f"{kullanici.mention}\n`{kullanici}` | ID: `{kullanici.id}`", False),
        ("🛡️ Yetkili", f"{interaction.user.mention} | ID: `{interaction.user.id}`", False),
        ("📋 Sebep", sebep, True),
        ("⏱️ Süre", f"{sure} dakika", True),
    ])
    await mod_log_gonder(interaction.guild, log)

# ===================== /UYARI_ROL_AYARLA =====================
@bot.tree.command(name="uyari_rol_ayarla", description="Uyarı seviyelerine göre rolleri ve mute sürelerini ayarlar.")
@app_commands.describe(
    rol1="1. seviye uyarı rolü", mute1="1. seviye mute süresi (dakika)",
    rol2="2. seviye uyarı rolü", mute2="2. seviye mute süresi (dakika)",
    rol3="3. seviye uyarı rolü", mute3="3. seviye mute süresi (dakika)"
)
@app_commands.checks.has_permissions(administrator=True)
async def uyari_rol_ayarla(
    interaction: discord.Interaction,
    rol1: discord.Role, mute1: int,
    rol2: discord.Role, mute2: int,
    rol3: discord.Role, mute3: int
):
    uyari_roller[interaction.guild.id] = {
        1: {"rol": rol1.id, "mute": mute1},
        2: {"rol": rol2.id, "mute": mute2},
        3: {"rol": rol3.id, "mute": mute3},
    }
    embed = discord.Embed(title="✅ Uyarı Rolleri Ayarlandı", color=discord.Color.gold())
    embed.add_field(name="1. Seviye", value=f"{rol1.mention} | {mute1} dk mute", inline=False)
    embed.add_field(name="2. Seviye", value=f"{rol2.mention} | {mute2} dk mute", inline=False)
    embed.add_field(name="3. Seviye", value=f"{rol3.mention} | {mute3} dk mute", inline=False)
    await interaction.response.send_message(embed=embed)

# ===================== /UYARI_VER =====================
@bot.tree.command(name="uyari_ver", description="Kullanıcıya uyarı verir.")
@app_commands.describe(kullanici="Uyarı verilecek kullanıcı", sebep="Uyarı sebebi", kanit="Kanıt görseli (isteğe bağlı)")
@app_commands.checks.has_permissions(moderate_members=True)
async def uyari_ver(
    interaction: discord.Interaction,
    kullanici: discord.Member,
    sebep: str,
    kanit: discord.Attachment = None
):
    gid = interaction.guild.id
    uid = kullanici.id

    if gid not in uyarilar:
        uyarilar[gid] = {}
    if uid not in uyarilar[gid]:
        uyarilar[gid][uid] = {"seviye": 0}

    uyarilar[gid][uid]["seviye"] = min(uyarilar[gid][uid]["seviye"] + 1, 3)
    seviye = uyarilar[gid][uid]["seviye"]

    # Rol ve mute uygula
    if gid in uyari_roller and seviye in uyari_roller[gid]:
        ayar = uyari_roller[gid][seviye]
        rol = interaction.guild.get_role(ayar["rol"])
        if rol:
            await kullanici.add_roles(rol)
        mute_sure = ayar["mute"]
        await kullanici.timeout(datetime.timedelta(minutes=mute_sure), reason=f"Uyarı seviye {seviye}: {sebep}")

    # 3 gün sonra uyarıyı düşür
    asyncio.create_task(uyari_temizle(gid, uid, 259200))

    embed = discord.Embed(title=f"⚠️ Uyarı Verildi — Seviye {seviye}/3", color=discord.Color.gold())
    embed.add_field(name="👤 Kullanıcı", value=f"{kullanici.mention}", inline=True)
    embed.add_field(name="⚠️ Seviye", value=f"{seviye}/3", inline=True)
    embed.add_field(name="📋 Sebep", value=sebep, inline=False)
    embed.add_field(name="🛡️ Yetkili", value=str(interaction.user), inline=False)
    if kanit:
        embed.set_image(url=kanit.url)
    await interaction.response.send_message(embed=embed)

    log = log_embed(f"⚠️ Uyarı Logu — Seviye {seviye}", discord.Color.gold(), [
        ("👤 Uyarılan", f"{kullanici.mention}\n`{kullanici}` | ID: `{kullanici.id}`", False),
        ("🛡️ Yetkili", f"{interaction.user.mention} | ID: `{interaction.user.id}`", False),
        ("📋 Sebep", sebep, True),
        ("⚠️ Seviye", f"{seviye}/3", True),
    ])
    if kanit:
        log.set_image(url=kanit.url)
    await mod_log_gonder(interaction.guild, log)

# ===================== /UYARI_AL =====================
@bot.tree.command(name="uyari_al", description="Kullanıcının uyarısını 1 kademe düşürür.")
@app_commands.describe(kullanici="Uyarısı düşürülecek kullanıcı")
@app_commands.checks.has_permissions(moderate_members=True)
async def uyari_al(interaction: discord.Interaction, kullanici: discord.Member):
    gid = interaction.guild.id
    uid = kullanici.id

    if gid not in uyarilar or uid not in uyarilar[gid] or uyarilar[gid][uid]["seviye"] == 0:
        await interaction.response.send_message("❌ Bu kullanıcının uyarısı bulunmuyor.", ephemeral=True)
        return

    uyarilar[gid][uid]["seviye"] -= 1
    seviye = uyarilar[gid][uid]["seviye"]

    embed = discord.Embed(title="✅ Uyarı Düşürüldü", color=discord.Color.green())
    embed.add_field(name="👤 Kullanıcı", value=kullanici.mention, inline=True)
    embed.add_field(name="⚠️ Yeni Seviye", value=f"{seviye}/3", inline=True)
    await interaction.response.send_message(embed=embed)

    log = log_embed("✅ Uyarı Düşürme Logu", discord.Color.green(), [
        ("👤 Kullanıcı", f"{kullanici.mention} | ID: `{kullanici.id}`", False),
        ("🛡️ Yetkili", f"{interaction.user.mention}", False),
        ("⚠️ Yeni Seviye", f"{seviye}/3", False),
    ])
    await mod_log_gonder(interaction.guild, log)

# ===================== /UYARILAR =====================
@bot.tree.command(name="uyarilar", description="Uyarısı olan tüm kullanıcıları listeler.")
@app_commands.checks.has_permissions(moderate_members=True)
async def uyarilar_listesi(interaction: discord.Interaction):
    gid = interaction.guild.id
    if gid not in uyarilar or not uyarilar[gid]:
        await interaction.response.send_message("✅ Hiç uyarılı kullanıcı yok.", ephemeral=True)
        return

    embed = discord.Embed(title="⚠️ Uyarılı Kullanıcılar", color=discord.Color.gold())
    for uid, veri in uyarilar[gid].items():
        if veri["seviye"] > 0:
            member = interaction.guild.get_member(uid)
            isim = str(member) if member else f"ID: {uid}"
            embed.add_field(name=isim, value=f"Seviye: {'⚠️' * veri['seviye']} ({veri['seviye']}/3)", inline=False)

    if not embed.fields:
        await interaction.response.send_message("✅ Hiç uyarılı kullanıcı yok.", ephemeral=True)
        return

    await interaction.response.send_message(embed=embed)

# ===================== /KUFUR_KORUMA =====================
@bot.tree.command(name="kufur_koruma", description="Küfür korumasını açar veya kapar.")
@app_commands.describe(durum="Küfür koruması durumu")
@app_commands.choices(durum=[
    app_commands.Choice(name="Aç", value="ac"),
    app_commands.Choice(name="Kapa", value="kapa"),
])
@app_commands.checks.has_permissions(administrator=True)
async def kufur_koruma(interaction: discord.Interaction, durum: str):
    aktif = durum == "ac"
    kufur_koruma_durumu[interaction.guild.id] = aktif
    durum_str = "✅ Açıldı" if aktif else "❌ Kapatıldı"
    embed = discord.Embed(
        title=f"🛡️ Küfür Koruması {durum_str}",
        description="Küfür yazıldığında kullanıcı 1 dakika susturulacak." if aktif else "Küfür koruması devre dışı.",
        color=discord.Color.green() if aktif else discord.Color.red()
    )
    await interaction.response.send_message(embed=embed)

    log = log_embed("🛡️ Küfür Koruma Logu", discord.Color.green() if aktif else discord.Color.red(), [
        ("Durum", durum_str, True),
        ("🛡️ Yetkili", str(interaction.user), True),
    ])
    await mod_log_gonder(interaction.guild, log)

# ===================== /AFK =====================
@bot.tree.command(name="afk", description="AFK moduna girer.")
@app_commands.describe(sebep="AFK sebebi")
async def afk(interaction: discord.Interaction, sebep: str = "Sebep belirtilmedi"):
    afk_kullanicilar[interaction.user.id] = sebep
    try:
        yeni_nick = f"{interaction.user.display_name} (AFK)"
        await interaction.user.edit(nick=yeni_nick)
    except:
        pass
    embed = discord.Embed(
        title="💤 AFK Modu Aktif",
        description=f"{interaction.user.mention} AFK moduna girdi.\n**Sebep:** {sebep}",
        color=discord.Color.light_grey()
    )
    await interaction.response.send_message(embed=embed)

# ===================== /KANAL_KİLİT_KAPA =====================
@bot.tree.command(name="kanal_kilit_kapa", description="Kanalı kilitler, sadece yetkili kişiler yazabilir.")
@app_commands.describe(kanal="Kilitlenecek kanal")
@app_commands.checks.has_permissions(manage_channels=True)
async def kanal_kilit_kapa(interaction: discord.Interaction, kanal: discord.TextChannel):
    await kanal.set_permissions(interaction.guild.default_role, send_messages=False)
    embed = discord.Embed(
        title="🔒 Kanal Kilitlendi",
        description=f"{kanal.mention} kanalı kilitlendi.",
        color=discord.Color.red()
    )
    await interaction.response.send_message(embed=embed)

    log = log_embed("🔒 Kanal Kilit Logu", discord.Color.red(), [
        ("📌 Kanal", kanal.mention, True),
        ("🛡️ Yetkili", str(interaction.user), True),
    ])
    await mod_log_gonder(interaction.guild, log)

# ===================== /KANAL_KİLİT_AÇ =====================
@bot.tree.command(name="kanal_kilit_ac", description="Kanalın kilidini açar, herkes yazabilir.")
@app_commands.describe(kanal="Kilidi açılacak kanal")
@app_commands.checks.has_permissions(manage_channels=True)
async def kanal_kilit_ac(interaction: discord.Interaction, kanal: discord.TextChannel):
    await kanal.set_permissions(interaction.guild.default_role, send_messages=True)
    embed = discord.Embed(
        title="🔓 Kanal Kilidi Açıldı",
        description=f"{kanal.mention} kanalı artık herkese açık.",
        color=discord.Color.green()
    )
    await interaction.response.send_message(embed=embed)

    log = log_embed("🔓 Kanal Kilit Açma Logu", discord.Color.green(), [
        ("📌 Kanal", kanal.mention, True),
        ("🛡️ Yetkili", str(interaction.user), True),
    ])
    await mod_log_gonder(interaction.guild, log)

# ===================== /ANKET =====================
@bot.tree.command(name="anket", description="Anket oluşturur.")
@app_commands.describe(
    soru="Anket sorusu",
    cevap1="1. cevap seçeneği",
    cevap2="2. cevap seçeneği",
    cevap3="3. cevap seçeneği (isteğe bağlı)"
)
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

    aciklama = "\n".join([f"{emojiler[i]} {c}" for i, c in enumerate(cevaplar)])

    embed = discord.Embed(
        title=f"📊 {soru}",
        description=aciklama,
        color=discord.Color.blurple(),
        timestamp=datetime.datetime.utcnow()
    )
    embed.set_footer(text=f"{SUNUCU_ADI} • Anket | Oy vermek için reaksiyon ekle!")

    await interaction.response.send_message(embed=embed)
    mesaj = await interaction.original_response()

    for i in range(len(cevaplar)):
        await mesaj.add_reaction(emojiler[i])

# ===================== HATA YÖNETİMİ =====================
@ban.error
@kick.error
@sustur.error
@uyari_ver.error
@duyuru.error
async def yetkisiz_hata(interaction: discord.Interaction, error):
    if isinstance(error, app_commands.MissingPermissions):
        await interaction.response.send_message("❌ Bu komutu kullanmak için yetkiniz yok!", ephemeral=True)
    else:
        await interaction.response.send_message(f"❌ Hata: {str(error)}", ephemeral=True)

# ===================== BAŞLAT =====================
bot.run(TOKEN)
