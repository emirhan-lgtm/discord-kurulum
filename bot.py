import asyncio
import datetime
import discord
from discord.ext import commands
from discord import app_commands
import os

TOKEN = os.environ.get("TOKEN")

intents = discord.Intents.all()
bot = commands.Bot(command_prefix="!", intents=intents)

# ===================== VERİLER =====================
mod_log_kanal = {}
uyarilar = {}
uyari_ayarlar = {}  # seviye ayarları
afk_kullanicilar = {}
kufur_koruma_durumu = {}

# ===================== LOG =====================
async def mod_log(guild, embed):
    if guild.id in mod_log_kanal:
        kanal = guild.get_channel(mod_log_kanal[guild.id])
        if kanal:
            await kanal.send(embed=embed)

def base_embed(title):
    return discord.Embed(title=title, color=discord.Color.red(), timestamp=discord.utils.utcnow())

# ===================== READY =====================
@bot.event
async def on_ready():
    await bot.tree.sync()
    print("Bot hazır!")

# ===================== BAN =====================
@bot.tree.command(name="ban")
@app_commands.checks.has_permissions(ban_members=True)
async def ban(interaction: discord.Interaction, kullanıcı: discord.Member, sebep: str):

    await kullanıcı.send(f"**{interaction.guild.name}**\nSebep: {sebep} nedeniyle banlandınız.")
    await kullanıcı.ban(reason=sebep)

    embed = discord.Embed(title="🔨 Ban", color=discord.Color.red())
    embed.add_field(name="Sunucu", value=interaction.guild.name, inline=False)
    embed.add_field(name="Sebep", value=sebep, inline=False)

    await interaction.response.send_message(embed=embed)

    log = discord.Embed(title="BAN LOG", color=discord.Color.red())
    log.add_field(name="Banlanan", value=f"{kullanıcı} ({kullanıcı.id})", inline=False)
    log.add_field(name="Yetkili", value=f"{interaction.user} ({interaction.user.id})", inline=False)
    log.add_field(name="Sebep", value=sebep, inline=False)

    await mod_log(interaction.guild, log)

# ===================== UNBAN =====================
@bot.tree.command(name="unban")
@app_commands.checks.has_permissions(ban_members=True)
async def unban(interaction: discord.Interaction, kullanıcı_id: str):
    user = await bot.fetch_user(int(kullanıcı_id))
    await interaction.guild.unban(user)

    await interaction.response.send_message(f"✅ {user} banı kaldırıldı.")

# ===================== KICK =====================
@bot.tree.command(name="kick")
@app_commands.checks.has_permissions(kick_members=True)
async def kick(interaction: discord.Interaction, kullanıcı: discord.Member, sebep: str):

    await kullanıcı.send(f"**{interaction.guild.name}**\nSebep: {sebep} nedeniyle atıldınız.")
    await kullanıcı.kick(reason=sebep)

    await interaction.response.send_message("Kick atıldı.")

    log = discord.Embed(title="KICK LOG", color=discord.Color.orange())
    log.add_field(name="Kullanıcı", value=f"{kullanıcı} ({kullanıcı.id})")
    log.add_field(name="Yetkili", value=f"{interaction.user} ({interaction.user.id})")
    log.add_field(name="Sebep", value=sebep)

    await mod_log(interaction.guild, log)

# ===================== SUSTUR =====================
@bot.tree.command(name="sustur")
@app_commands.checks.has_permissions(moderate_members=True)
async def sustur(interaction: discord.Interaction, kullanıcı: discord.Member, sure: int, sebep: str):

    await kullanıcı.timeout(datetime.timedelta(minutes=sure), reason=sebep)

    await kullanıcı.send(f"**{interaction.guild.name}**\nSebep: {sebep} nedeniyle susturuldunuz.")

    await interaction.response.send_message("Susturuldu.")

    log = discord.Embed(title="MUTE LOG", color=discord.Color.yellow())
    log.add_field(name="Kullanıcı", value=f"{kullanıcı} ({kullanıcı.id})")
    log.add_field(name="Süre", value=f"{sure} dk")
    log.add_field(name="Sebep", value=sebep)

    await mod_log(interaction.guild, log)

# ===================== DUYURU =====================
@bot.tree.command(name="duyuru")
@app_commands.checks.has_permissions(manage_messages=True)
async def duyuru(interaction: discord.Interaction, kanal: discord.TextChannel, başlık: str, yazı: str, etiket: discord.Role):

    embed = discord.Embed(
        title=f"📢 {başlık}",
        description=yazı,
        color=discord.Color.blue()
    )

    await kanal.send(content=etiket.mention, embed=embed)
    await interaction.response.send_message("Duyuru gönderildi.", ephemeral=True)

# ===================== MOD LOG AYAR =====================
@bot.tree.command(name="mod_log_ayarla")
@app_commands.checks.has_permissions(administrator=True)
async def mod_log_ayarla(interaction: discord.Interaction, kanal: discord.TextChannel):
    mod_log_kanal[interaction.guild.id] = kanal.id
    await interaction.response.send_message("Mod log ayarlandı.")

# ===================== KÜFÜR KORUMA =====================
@bot.tree.command(name="kufur_koruma")
@app_commands.checks.has_permissions(administrator=True)
async def kufur_koruma(interaction: discord.Interaction, durum: bool):
    kufur_koruma_durumu[interaction.guild.id] = durum
    await interaction.response.send_message("Küfür koruma güncellendi.")

# ===================== AFK =====================
@bot.tree.command(name="afk")
async def afk(interaction: discord.Interaction, sebep: str):
    afk_kullanicilar[interaction.user.id] = sebep
    try:
        await interaction.user.edit(nick=f"{interaction.user.display_name} (AFK)")
    except:
        pass

    await interaction.response.send_message("AFK oldunuz.")

# ===================== KANAL KİLİT =====================
@bot.tree.command(name="kanal_kilit_aç")
@app_commands.checks.has_permissions(manage_channels=True)
async def kilit_ac(interaction: discord.Interaction, kanal: discord.TextChannel):
    overwrite = kanal.overwrites_for(interaction.guild.default_role)
    overwrite.send_messages = False
    await kanal.set_permissions(interaction.guild.default_role, overwrite=overwrite)

    await interaction.response.send_message("Kanal kilitlendi.")

@bot.tree.command(name="kanal_kilit_kapa")
@app_commands.checks.has_permissions(manage_channels=True)
async def kilit_kapat(interaction: discord.Interaction, kanal: discord.TextChannel):
    overwrite = kanal.overwrites_for(interaction.guild.default_role)
    overwrite.send_messages = True
    await kanal.set_permissions(interaction.guild.default_role, overwrite=overwrite)

    await interaction.response.send_message("Kanal açıldı.")

# ===================== UYARI SİSTEMİ =====================
@bot.tree.command(name="uyarı_ver")
@app_commands.checks.has_permissions(moderate_members=True)
async def uyari_ver(interaction: discord.Interaction, kullanıcı: discord.Member, sebep: str):

    uid = kullanıcı.id
    uyarilar.setdefault(uid, 0)
    uyarilar[uid] += 1

    seviye = uyarilar[uid]

    ayar = uyari_ayarlar.get(interaction.guild.id, {}).get(seviye)

    if ayar:
        rol, dakika = ayar
        await kullanıcı.add_roles(rol)
        await kullanıcı.timeout(datetime.timedelta(minutes=dakika), reason="Uyarı sistemi")

    await interaction.response.send_message(f"Uyarı verildi. Seviye: {seviye}")

# ===================== UYARI AL =====================
@bot.tree.command(name="uyarı_al")
@app_commands.checks.has_permissions(moderate_members=True)
async def uyari_al(interaction: discord.Interaction, kullanıcı: discord.Member):

    uid = kullanıcı.id
    if uid in uyarilar and uyarilar[uid] > 0:
        uyarilar[uid] -= 1

    await interaction.response.send_message("Uyarı düşürüldü.")

# ===================== UYARILAR =====================
@bot.tree.command(name="uyarılar")
async def uyari_liste(interaction: discord.Interaction, kullanıcı: discord.Member):
    await interaction.response.send_message(f"{kullanıcı} uyarı: {uyarilar.get(kullanıcı.id, 0)}")

# ===================== UYARI AYAR =====================
@bot.tree.command(name="uyarı_rol_ayarla")
@app_commands.checks.has_permissions(administrator=True)
async def uyari_ayar(interaction: discord.Interaction,
                     s1: discord.Role, m1: int,
                     s2: discord.Role, m2: int,
                     s3: discord.Role, m3: int):

    uyari_ayarlar[interaction.guild.id] = {
        1: (s1, m1),
        2: (s2, m2),
        3: (s3, m3),
    }

    await interaction.response.send_message("Uyarı sistemi ayarlandı.")

# ===================== ANKET =====================
@bot.tree.command(name="anket")
async def anket(interaction: discord.Interaction, soru: str, c1: str, c2: str, c3: str = None):

    embed = discord.Embed(title="📊 Anket", description=soru)

    embed.add_field(name="1️⃣", value=c1, inline=False)
    embed.add_field(name="2️⃣", value=c2, inline=False)

    if c3:
        embed.add_field(name="3️⃣", value=c3, inline=False)

    msg = await interaction.channel.send(embed=embed)

    await msg.add_reaction("1️⃣")
    await msg.add_reaction("2️⃣")
    if c3:
        await msg.add_reaction("3️⃣")

    await interaction.response.send_message("Anket oluşturuldu.", ephemeral=True)

# ===================== RUN =====================
  
        if name == "main":
if not TOKEN:
print("❌ HATA: Discord Token bulunamadı! Environment Variables kısmını kontrol edin.")
else:
bot.run(os.environ.get("TOKEN"))
