const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// ================= CONFIG =================
const stashChannelId = "1456489075941834949";
const depositLogChannelId = "1456726864134668359";
const withdrawLogChannelId = "1456733883021267038";
const allowedRoles = ["Two Bar", "One Bar", "Three Stripes Circle", "Two Stripe", "One Stripe"];

// WorkReports/Stats Channels
const workReportsChannelId = "1457408055833657364";
const workStatsChannelId = "1457408149899317349";
const leaderRoles = ["Two Bar", "One Bar"];

// Inventory Datei (Stash)
const inventoryFile = "./inventory.json";

// WorkStats Datei
const workFile = path.join(__dirname, "workStats.json");

// ================= HELPER FUNCTIONS =================

// --- Inventory (Stash)
function loadInventory() {
  if (!fs.existsSync(inventoryFile)) return {};
  return JSON.parse(fs.readFileSync(inventoryFile, "utf8"));
}

function saveInventory(data) {
  fs.writeFileSync(inventoryFile, JSON.stringify(data, null, 2));
}

function buildStashText(inventory) {
  const categories = ["Weapons", "Drugs", "Materials", "Others"];
  let text = `PINKPANTHER STASH\n──────────────────────────────\n\n`;
  for (const cat of categories) {
    text += `${cat.toUpperCase()}\n`;
    const items = inventory[cat] || {};
    if (Object.keys(items).length === 0) {
      text += "  - (Empty)\n\n";
      continue;
    }
    for (const [item, qty] of Object.entries(items)) {
      text += `  - ${item} x${qty}\n`;
    }
    text += "\n";
  }
  return "```" + text + "```";
}

async function updateStash(channel) {
  const inventory = loadInventory();
  const text = buildStashText(inventory);
  const messages = await channel.messages.fetch({ limit: 20 });
  const botMsg = messages.find(
    (m) => m.author.id === client.user.id && m.content.startsWith("```PINKPANTHER STASH")
  );
  if (botMsg) await botMsg.edit(text);
  else await channel.send(text);
}

async function sendLog(channelId, type, user, item, qty, category) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;
  const embed = new EmbedBuilder()
    .setTitle(type.toUpperCase())
    .setColor(type === "deposit" ? 0x2ecc71 : 0xe74c3c)
    .addFields(
      { name: "User", value: user.tag, inline: true },
      { name: "Item", value: item, inline: true },
      { name: "Qty", value: qty.toString(), inline: true },
      { name: "Category", value: category, inline: true },
      { name: "Time", value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
    );
  channel.send({ embeds: [embed] });
}

// --- WorkStats
function loadWorkStats() {
  if (!fs.existsSync(workFile)) return {};
  return JSON.parse(fs.readFileSync(workFile, "utf8"));
}

function saveWorkStats(data) {
  fs.writeFileSync(workFile, JSON.stringify(data, null, 2));
}

function getDateTime() {
  return new Date().toLocaleString("en-US", { hour12: false });
}

// ================= BOT READY =================
client.once("ready", async () => {
  console.log(`✅ Bot online als ${client.user.tag}`);
  const stashChannel = await client.channels.fetch(stashChannelId).catch(() => null);
  if (stashChannel) updateStash(stashChannel);
});

// ================= MESSAGE HANDLER =================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim();
  const isLeader = message.member.roles.cache.some((r) => leaderRoles.includes(r.name));

  // --- STASH HANDLER ---
  if (message.channel.id === stashChannelId) {
    const hasRole = message.member.roles.cache.some((r) => allowedRoles.includes(r.name));
    if (!hasRole) return;

    if (content.toLowerCase() === "!help") {
      return message.channel.send(
        "```DEPOSIT: item qty W/D/M/O\nWITHDRAW: -item qty W/D/M/O```"
      );
    }

    const match = content.match(/^(-?)(\S+)\s+(\d+)(?:\s+([WDMO]))?$/i);
    if (!match) return;
    const isWithdraw = match[1] === "-";
    const item = match[2];
    const qty = parseInt(match[3]);
    const catMap = { W: "Weapons", D: "Drugs", M: "Materials", O: "Others" };
    const category = catMap[(match[4] || "O").toUpperCase()];

    const inventory = loadInventory();
    if (!inventory[category]) inventory[category] = {};
    if (!inventory[category][item]) inventory[category][item] = 0;

    if (isWithdraw) {
      if (inventory[category][item] < qty) return message.reply("❌ Not enough items!");
      inventory[category][item] -= qty;
      if (inventory[category][item] === 0) delete inventory[category][item];
    } else {
      inventory[category][item] += qty;
    }

    saveInventory(inventory);
    const stashChannel = await client.channels.fetch(stashChannelId);
    updateStash(stashChannel);
    sendLog(
      isWithdraw ? withdrawLogChannelId : depositLogChannelId,
      isWithdraw ? "withdraw" : "deposit",
      message.author,
      item,
      qty,
      category
    );

    return message.delete().catch(() => {});
  }

  // --- WORKREPORTS HANDLER ---
  if (message.channel.id === workReportsChannelId) {
    const match = content.match(/^\+?(\d+)\s+(\S+)$/i);
    if (!match) return;

    const qty = parseInt(match[1]);
    const item = match[2].toLowerCase();

    const stats = loadWorkStats();
    const username = message.author.username.toLowerCase();

    if (!stats[username]) stats[username] = {};
    if (!stats[username][item]) stats[username][item] = 0;

    stats[username][item] += qty;
    stats[username]._last = getDateTime(); // letzte Aktivität
    saveWorkStats(stats);

    return message.delete().catch(() => {});
  }

  // --- WORKSTATS HANDLER ---
  if (message.channel.id === workStatsChannelId) {

    const stats = loadWorkStats();

    // --- !members Command (permanent)
    if (content.toLowerCase() === "!members") {
      const gangMembers = [
        { name: "Fati", username: "thebicaj" },
        { name: "Skuzza", username: "sku7zz7a" },
        { name: "Ubi", username: "ubi07" },
        { name: "M3D", username: "medii2558" },
        { name: "-CIMA-", username: "cima12" },
        { name: "Hashim Thaqi", username: "zezakibardh" },
        { name: "HOXHA", username: "ghosty7126" },
        { name: "rizzi95", username: "bucorulzz" },
        { name: "Tropojan1", username: "kristi7157" },
        { name: "PSIKOPATI", username: "psikopatii_" }
      ];

      let text = "**Gang Members:**\n";
      gangMembers.forEach(m => text += `${m.name} → ${m.username}\n`);
      return message.channel.send(text); // bleibt permanent
    }

    // --- !help (Leaders Guide)
    if (content.toLowerCase() === "!help" && isLeader) {
      const guide = new EmbedBuilder()
        .setTitle("WorkReports & WorkStats Guide (Leaders)")
        .setColor(0x3498db)
        .setDescription(
`**Gang Members:**
Fati → thebicaj
Skuzza → sku7zz7a
Ubi → ubi07
M3D → medii2558
-CIMA- → cima12
Hashim Thaqi → zezakibardh
HOXHA → ghosty7126
rizzi95 → bucorulzz
Tropojan1 → kristi7157
PSIKOPATI → psikopatii_

**Commands:**
!stats <member> → Show stats for a member
!res <member> → Reset stats for a member
!top3 → Show top 3 workers`
        );
      return message.channel.send({ embeds: [guide] }).then(msg => {
        setTimeout(() => msg.delete().catch(() => {}), 15000);
      });
    }

    // --- !stats <member>
    if (content.toLowerCase().startsWith("!stats ") && isLeader) {
      const memberName = content.slice(7).trim().toLowerCase();
      if (!stats[memberName]) {
        await message.reply(`❌ No reports for ${memberName}.`).then(msg => {
          setTimeout(() => msg.delete().catch(() => {}), 15000);
        });
        return message.delete().catch(() => {});
      }

      const memberStats = stats[memberName];
      const embed = new EmbedBuilder()
        .setTitle(`📊 Work Stats for ${memberName}`)
        .setColor(0x3498db)
        .setFooter({ text: `Last update: ${memberStats._last}` });

      for (const [item, qty] of Object.entries(memberStats)) {
        if (item === "_last") continue;
        embed.addFields({ name: item, value: qty.toString(), inline: true });
      }

      await message.channel.send({ embeds: [embed] }).then(msg => {
        setTimeout(() => msg.delete().catch(() => {}), 15000);
      });
      return message.delete().catch(() => {});
    }

    // --- !res <member>
    if (content.toLowerCase().startsWith("!res ") && isLeader) {
      const memberName = content.slice(5).trim().toLowerCase();
      if (!stats[memberName]) {
        await message.reply(`❌ No reports for ${memberName}.`).then(msg => {
          setTimeout(() => msg.delete().catch(() => {}), 15000);
        });
        return message.delete().catch(() => {});
      }
      delete stats[memberName];
      saveWorkStats(stats);
      await message.reply(`✅ Reset stats for ${memberName} at ${getDateTime()}`).then(msg => {
        setTimeout(() => msg.delete().catch(() => {}), 15000);
      });
      return message.delete().catch(() => {});
    }

    // --- !top3
    if (content.toLowerCase() === "!top3" && isLeader) {
      const arr = Object.entries(stats)
        .map(([name, items]) => {
          const sum = Object.entries(items)
            .filter(([k]) => k !== "_last")
            .reduce((a, [,v]) => a + v, 0);
          return { name, sum, last: items._last };
        })
        .sort((a,b) => b.sum - a.sum)
        .slice(0,3);

      let text = "🏆 Top 3 Workers:\n";
      arr.forEach(a => text += `${a.name}: ${a.sum} → ${a.last}\n`);

      await message.channel.send(text).then(msg => {
        setTimeout(() => msg.delete().catch(() => {}), 15000);
      });
      return message.delete().catch(() => {});
    }
  }
});

// ================= LOGIN =================
client.login(process.env.TOKEN);
