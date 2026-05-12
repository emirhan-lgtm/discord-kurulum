try:
    import audioop
except ImportError:
    try:
        import audioop_lpm as audioop
        import sys
        sys.modules["audioop"] = audioop
    except ImportError:
        pass

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
        timestamp=discord.utils.utcnow()
    )

    for isim, deger, inline in alanlar:
        embed.add_field(name=isim, value=deger, inline=inline)

    return embed


async def mod_log_gonder(guild, embed):
    if guild.id in mod_log_kanal:
        kanal = guild.get_channel(mod_log_kanal[guild.id])
        if kanal:
            await kanal.send(embed=embed)


# ===================== EVENTS =====================
@bot.event
async def on_ready():
    try:
        synced = await bot.tree.sync()
        print(f"✅ {len(synced)} slash komut senkronize edildi.")
    except Exception as e:
        print(f"❌ Sync hatası: {e}")

    print(f"🤖 {bot.user} aktif ve göreve hazır!")


@bot.event
async def on_message(message):
    if message.author.bot or not message.guild:
        return

    # AFK çıkışı
    if message.author.id in afk_kullanicilar:
        del afk_kullanicilar[message.author.id]
        
        try:
            yeni_nick = message.author.display_name.replace(" (AFK)", "")
            await message.author.edit(nick=yeni_nick)
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
                await message.author.timeout(
                    datetime.timedelta(minutes=1),
                    reason="Otomatik Küfür Koruması"
                )
                await message.channel.send(
                    f"🚫 {message.author.mention}, küfür yasak! 1 dakika susturuldunuz.",
                    delete_after=5
                )
            except:
                pass

    await bot.process_commands(message)


# ===================== MODERASYON KOMUTLARI =====================

@bot.tree.command(name="ban", description="Kullanıcıyı sunucudan banlar")
@app_commands.checks.has_permissions(ban_members=True)
async def ban(interaction: discord.Interaction, kullanici: discord.Member, sebep: str):
    embed_dm = discord.Embed(
        title=f"🔨 {interaction.guild.name}",
        description=f"Sebep: {sebep} nedeniyle banlandınız.",
        color=discord.Color.red(),
        timestamp=discord.utils.utcnow()
    )
    
    try:
        await kullanici.send(embed=embed_dm)
    except:
        pass

    await kullanici.ban(reason=sebep)
    
    embed = discord.Embed(title="✅ İşlem Başarılı", color=discord.Color.red())
    embed.add_field(name="👤 Banlanan", value=f"{kullanici} ({kullanici.id})")
    embed.add_field(name="📋 Sebep", value=sebep)
    
    await interaction.response.send_message(embed=embed)


@bot.tree.command(name="unban", description="Kullanıcının banını kaldırır")
@app_commands.checks.has_permissions(ban_members=True)
async def unban(interaction: discord.Interaction, kullanici_id: str):
    try:
        uid = int(kullanici_id)
        user = await bot.fetch_user(uid)
        await interaction.guild.unban(user)
        await interaction.response.send_message(f"✅ {user.name} kullanıcısının banı kaldırıldı.")
    except Exception as e:
        await interaction.response.send_message(f"❌ Hata: {e}", ephemeral=True)


@bot.tree.command(name="kick", description="Kullanıcıyı sunucudan atar")
@app_commands.checks.has_permissions(kick_members=True)
async def kick(interaction: discord.Interaction, kullanici: discord.Member, sebep: str):
    try:
        await kullanici.send(f"⚠️ {interaction.guild.name} sunucusundan atıldınız. Sebep: {sebep}")
    except: pass

    await kullanici.kick(reason=sebep)
    await interaction.response.send_message(f"✅ {kullanici} sunucudan atıldı.")


@bot.tree.command(name="sustur", description="Kullanıcıya timeout atar")
@app_commands.checks.has_permissions(moderate_members=True)
async def sustur(interaction: discord.Interaction, kullanici: discord.Member, sure: int, sebep: str):
    await kullanici.timeout(datetime.timedelta(minutes=sure), reason=sebep)
    await interaction.response.send_message(f"🔇 {kullanici}, {sure} dakika boyunca susturuldu. Sebep: {sebep}")


# ===================== SİSTEM KOMUTLARI =====================

@bot.tree.command(name="afk", description="AFK moduna girmenizi sağlar")
async def afk(interaction: discord.Interaction, sebep: str = "Belirtilmedi"):
    afk_kullanicilar[interaction.user.id] = sebep
    try:
        await interaction.user.edit(nick=f"{interaction.user.display_name} (AFK)")
    except: pass
    
    await interaction.response.send_message(f"💤 Artık AFK modundasınız: {sebep}")


@bot.tree.command(name="kufur_koruma", description="Küfür korumasını yönetir")
@app_commands.checks.has_permissions(administrator=True)
async def kufur_koruma(interaction: discord.Interaction, durum: bool):
    kufur_koruma_durumu[interaction.guild.id] = durum
    metin = "aktif edildi" if durum else "devre dışı bırakıldı"
    await interaction.response.send_message(f"🛡️ Küfür koruması {metin}.")


@bot.tree.command(name="anket", description="Anket başlatır")
async def anket(interaction: discord.Interaction, soru: str, secenek1: str, secenek2: str):
    embed = discord.Embed(title="📊 Anket", description=f"**{soru}**\n\n1️⃣ {secenek1}\n2️⃣ {secenek2}", color=0x7289da)
    await interaction.response.send_message(embed=embed)
    mesaj = await interaction.original_response()
    await mesaj.add_reaction("1️⃣")
    await mesaj.add_reaction("2️⃣")


# ===================== BAŞLATICI =====================
if __name__ == "__main__":
    if not TOKEN:
        print("❌ HATA: Discord Token bulunamadı! Environment Variables kısmını kontrol edin.")
    else:
        bot.run(TOKEN)
