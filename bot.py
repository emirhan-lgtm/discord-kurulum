import discord
from discord.ext import commands
from discord import app_commands
import sqlite3
import os
import random
import asyncio
import datetime

# ===================== SETUP =====================
TOKEN = os.getenv("TOKEN")
OWNER_ID = int(os.getenv("OWNER_ID", "0"))

intents = discord.Intents.all()
bot = commands.Bot(command_prefix="!", intents=intents)

# ===================== DATABASE =====================
db = sqlite3.connect("bot.db")
cursor = db.cursor()

cursor.execute("CREATE TABLE IF NOT EXISTS modlog (guild_id INTEGER PRIMARY KEY, channel_id INTEGER)")
cursor.execute("CREATE TABLE IF NOT EXISTS afk (user_id INTEGER PRIMARY KEY, reason TEXT)")
cursor.execute("CREATE TABLE IF NOT EXISTS uyarilar (guild_id INTEGER, user_id INTEGER, count INTEGER)")
cursor.execute("CREATE TABLE IF NOT EXISTS tickets (guild_id INTEGER PRIMARY KEY, category_id INTEGER, log_id INTEGER)")
db.commit()

# ===================== MOD LOG =====================
async def log(guild, embed):
    cursor.execute("SELECT channel_id FROM modlog WHERE guild_id=?", (guild.id,))
    row = cursor.fetchone()
    if row:
        ch = guild.get_channel(row[0])
        if ch:
            await ch.send(embed=embed)

# ===================== READY =====================
@bot.event
async def on_ready():
    await bot.tree.sync()
    print("V5 Bot aktif!")

# ===================== AFK =====================
@bot.tree.command(name="afk")
async def afk(interaction: discord.Interaction, sebep: str):

    cursor.execute("REPLACE INTO afk VALUES (?,?)", (interaction.user.id, sebep))
    db.commit()

    try:
        await interaction.user.edit(nick=f"{interaction.user.display_name} (AFK)")
    except:
        pass

    await interaction.response.send_message(f"AFK: {sebep}")

@bot.event
async def on_message(message):

    if message.author.bot:
        return

    # AFK exit
    cursor.execute("SELECT reason FROM afk WHERE user_id=?", (message.author.id,))
    if cursor.fetchone():
        cursor.execute("DELETE FROM afk WHERE user_id=?", (message.author.id,))
        db.commit()

        try:
            await message.author.edit(nick=message.author.display_name.replace(" (AFK)", ""))
        except:
            pass

        await message.channel.send("AFK kapandı", delete_after=5)

    # AFK mention
    for m in message.mentions:
        cursor.execute("SELECT reason FROM afk WHERE user_id=?", (m.id,))
        r = cursor.fetchone()
        if r:
            await message.channel.send(f"{m.display_name} AFK: {r[0]}", delete_after=5)

    await bot.process_commands(message)

# ===================== TEMİZLE =====================
@bot.tree.command(name="temizle")
async def temizle(interaction, adet: int):

    if not 1 <= adet <= 100:
        return await interaction.response.send_message("1-100 arası")

    await interaction.channel.purge(limit=adet)
    await interaction.response.send_message("Temizlendi", ephemeral=True)

# ===================== BAN =====================
@bot.tree.command(name="ban")
async def ban(interaction, kullanıcı: discord.Member, sebep: str):

    await kullanıcı.send(f"{interaction.guild.name}\nSebep: {sebep} nedeniyle banlandınız.")
    await kullanıcı.ban(reason=sebep)

    embed = discord.Embed(title="BAN", description=f"{kullanıcı}\n{sebep}")
    await log(interaction.guild, embed)

    await interaction.response.send_message("Banlandı")

# ===================== KICK =====================
@bot.tree.command(name="kick")
async def kick(interaction, kullanıcı: discord.Member, sebep: str):

    await kullanıcı.send(f"{interaction.guild.name}\nSebep: {sebep} nedeniyle atıldınız.")
    await kullanıcı.kick(reason=sebep)

    embed = discord.Embed(title="KICK", description=f"{kullanıcı}\n{sebep}")
    await log(interaction.guild, embed)

    await interaction.response.send_message("Kick atıldı")

# ===================== MUTE =====================
@bot.tree.command(name="sustur")
async def sustur(interaction, kullanıcı: discord.Member, sure: int, sebep: str):

    await kullanıcı.timeout(datetime.timedelta(minutes=sure), reason=sebep)

    embed = discord.Embed(title="MUTE", description=f"{kullanıcı}\n{sebep}")
    await log(interaction.guild, embed)

    await interaction.response.send_message("Susturuldu")

# ===================== UNBAN =====================
@bot.tree.command(name="unban")
async def unban(interaction, kullanıcı_id: str):

    user = await bot.fetch_user(int(kullanıcı_id))
    await interaction.guild.unban(user)

    await interaction.response.send_message("Unban")

# ===================== MOD LOG =====================
@bot.tree.command(name="mod_log_ayarla")
async def modlog(interaction, kanal: discord.TextChannel):

    cursor.execute("REPLACE INTO modlog VALUES (?,?)", (interaction.guild.id, kanal.id))
    db.commit()

    await interaction.response.send_message("Mod log ayarlandı")

# ===================== UYARI =====================
@bot.tree.command(name="uyarı_ver")
async def uyari(interaction, kullanıcı: discord.Member):

    cursor.execute("SELECT count FROM uyarilar WHERE guild_id=? AND user_id=?",
                   (interaction.guild.id, kullanıcı.id))
    row = cursor.fetchone()

    count = row[0] + 1 if row else 1

    cursor.execute("REPLACE INTO uyarilar VALUES (?,?,?)",
                   (interaction.guild.id, kullanıcı.id, count))
    db.commit()

    await interaction.response.send_message(f"Uyarı: {count}")

@bot.tree.command(name="uyarı_al")
async def uyari_al(interaction, kullanıcı: discord.Member):

    cursor.execute("SELECT count FROM uyarilar WHERE guild_id=? AND user_id=?",
                   (interaction.guild.id, kullanıcı.id))
    row = cursor.fetchone()

    if not row:
        return await interaction.response.send_message("Uyarı yok")

    new = max(0, row[0] - 1)

    cursor.execute("REPLACE INTO uyarilar VALUES (?,?,?)",
                   (interaction.guild.id, kullanıcı.id, new))
    db.commit()

    await interaction.response.send_message(f"Uyarı düştü: {new}")

# ===================== KANAL KİLİT =====================
@bot.tree.command(name="kanal_kilit_aç")
async def kilit_ac(interaction, kanal: discord.TextChannel):

    overwrite = kanal.overwrites_for(interaction.guild.default_role)
    overwrite.send_messages = False
    await kanal.set_permissions(interaction.guild.default_role, overwrite=overwrite)

    await interaction.response.send_message("Kilit açıldı")

@bot.tree.command(name="kanal_kilit_kapa")
async def kilit_kapat(interaction, kanal: discord.TextChannel):

    overwrite = kanal.overwrites_for(interaction.guild.default_role)
    overwrite.send_messages = True
    await kanal.set_permissions(interaction.guild.default_role, overwrite=overwrite)

    await interaction.response.send_message("Kanal açıldı")

# ===================== ADMIN =====================
@bot.tree.command(name="admin_komut")
async def admin(interaction):

    if interaction.user.id != OWNER_ID:
        return await interaction.response.send_message("Yetki yok")

    await bot.tree.sync()
    await interaction.response.send_message("Optimize edildi")

# ===================== TICKET =====================
class TicketView(discord.ui.View):

    @discord.ui.button(label="Ticket Aç", style=discord.ButtonStyle.green)
    async def open(self, interaction, button):

        category = discord.utils.get(interaction.guild.categories, name="Tickets")
        if not category:
            category = await interaction.guild.create_category("Tickets")

        ch = await interaction.guild.create_text_channel(
            name=f"ticket-{interaction.user.name}",
            category=category
        )

        await ch.send(f"{interaction.user.mention} ticket açtı")

        await interaction.response.send_message("Ticket açıldı", ephemeral=True)

@bot.tree.command(name="ticket_panel")
async def ticket(interaction):
    await interaction.channel.send("Ticket sistemi", view=TicketView())

# ===================== GIVEAWAY =====================
class GiveawayView(discord.ui.View):

    def __init__(self):
        super().__init__()
        self.users = []

    @discord.ui.button(label="Katıl", style=discord.ButtonStyle.blurple)
    async def join(self, interaction, button):

        if interaction.user.id not in self.users:
            self.users.append(interaction.user.id)
            await interaction.response.send_message("Katıldın", ephemeral=True)

@bot.tree.command(name="çekiliş_başlat")
async def gw(interaction, ödül: str, süre: int):

    view = GiveawayView()
    await interaction.channel.send(f"🎉 {ödül}", view=view)

    await asyncio.sleep(süre)

    if view.users:
        winner = random.choice(view.users)
        user = await bot.fetch_user(winner)
        await interaction.channel.send(f"🏆 Kazanan: {user.mention}")

# ===================== RUN =====================
bot.run(TOKEN)
