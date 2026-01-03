const { Client, GatewayIntentBits } = require("discord.js");
const fs = require("fs");

// Rollen die Commands benutzen dürfen
const allowedRoles = [
  "Two Bar",
  "One Bar",
  "Three Stripes Circle",
  "Two Stripe",
  "One Stripe"
];

// Channel IDs
const stashChannelId = "1456489075941834949";
const depositLogChannelId = "1456726864134668359";
const withdrawLogChannelId = "1456733883021267038";

// Inventory Datei
const inventoryFile = "./inventory.json";
let inventoryMessageId = null;

// --- Load / Save Inventory ---
function loadInventory() {
  if (!fs.existsSync(inventoryFile)) return {};
  return JSON.parse(fs.readFileSync(inventoryFile));
}

function saveInventory(data) {
  fs.writeFileSync(inventoryFile, JSON.stringify(data, null, 2));
}

// --- ASCII MDT Gang Stash Builder ---
function buildAsciiInventory(inventory) {
  const padRight = (text, length) => text.padEnd(length, " ");
  const padLeft = (text, length) => text.padStart(length, " ");
  const lineLength = 70;
  let lines = [];

  lines.push("PINKPANTHER STASH");
  lines.push("─".repeat(lineLength));
  const categories = ["Weapons", "Drugs", "Materials", "Others"];

  for (const cat of categories) {
    const items = inventory[cat] || {};
    const itemKeys = Object.keys(items);
    if (itemKeys.length === 0) continue;

    lines.push(cat.toUpperCase());
    for (const item of itemKeys) {
      const amount = items[item].amount;
      const value = items[item].value;
      const amountStr = amount === "-" ? "-" : `x${amount}`;
      // Dynamische Punkte
      let dotsCount = 18 - item.length;
      if(dotsCount < 1) dotsCount = 1;
      const dots = ".".repeat(dotsCount);
      const line = `  - ${padRight(item, 16)} ${dots} ${padRight(amountStr,5)} | Value: ${value.toLocaleString()}`;
      lines.push(line);
    }
    lines.push(""); // Leerzeile nach Kategorie
  }

  lines.push("─".repeat(lineLength));
  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2,"0")}.${String(now.getMonth()+1).padStart(2,"0")}.${now.getFullYear()}`;
  lines.push(`Last Updated: ${dateStr}`);

  return "```" + lines.join("\n") + "```";
}

// --- Update Inventory Message ---
async function updateInventoryMessage(channel) {
  const inventory = loadInventory();
  const ascii = buildAsciiInventory(inventory);

  try {
    if (inventoryMessageId) {
      const msg = await channel.messages.fetch(inventoryMessageId).catch(() => null);
      if (msg) await msg.edit(ascii);
      else {
        const newMsg = await channel.send(ascii);
        inventoryMessageId = newMsg.id;
      }
    } else {
      const newMsg = await channel.send(ascii);
      inventoryMessageId = newMsg.id;
    }
  } catch (err) {
    console.log("Inventory update error:", err);
  }
}

// --- Send Logs ---
async function sendLog(channelId, action, user, item, amount, category) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;
  const timestamp = Math.floor(Date.now() / 1000);
  channel.send(`**${action.toUpperCase()}** | ${user.tag} | ${item} x${amount} | ${category} | <t:${timestamp}:R>`);
}

// --- Client ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// --- Ready ---
client.once("ready", async () => {
  console.log("✅ Gang Bot is online!");
  const stashChannel = await client.channels.fetch(stashChannelId).catch(() => null);
  if (stashChannel) updateInventoryMessage(stashChannel);
});

// --- Commands & Auto-Delete Messages ---
client.on("messageCreate", async message => {
  if (message.author.bot) return;

  // --- Delete all messages in stash channel ---
  if (message.channel.id === stashChannelId) {
    message.delete().catch(()=>{});
  }

  const commandRegex = /^!(deposit|withdraw)\s+(.+)$/i;
  const matchCommand = message.content.match(commandRegex);
  if (!matchCommand) return;

  const command = matchCommand[1].toLowerCase();
  let rest = matchCommand[2].trim();

  // Rollen Check
  const hasRole = message.member.roles.cache.some(r => allowedRoles.includes(r.name));
  if (!hasRole) {
    await message.reply("❌ You don’t have permission!").then(msg => setTimeout(() => msg.delete().catch(()=>{}), 4000));
    return message.delete().catch(()=>{});
  }

  // Kategorie optional
  let category = "Others";
  const categoryMatch = rest.match(/\(([^)]+)\)$/);
  if (categoryMatch) {
    category = categoryMatch[1].trim();
    rest = rest.replace(/\([^)]+\)$/, "").trim();
  }

  // Amount = letzte Zahl
  const amountMatch = rest.match(/(\d+)$/);
  if (!amountMatch) return message.reply("❌ Invalid command!").then(msg => setTimeout(() => msg.delete().catch(()=>{}), 3000));
  const amount = parseInt(amountMatch[1]);

  // Item = alles davor
  const item = rest.slice(0, rest.lastIndexOf(amountMatch[1])).trim();
  if (!item || amount <= 0) return;

  // Load Inventory
  const inventory = loadInventory();
  if (!inventory[category]) inventory[category] = {};
  if (!inventory[category][item]) inventory[category][item] = {amount:0,value:0};

  if (command === "deposit") inventory[category][item].amount += amount;
  else {
    if (!inventory[category][item] || inventory[category][item].amount < amount) {
      return message.reply("❌ Not enough items!").then(msg => setTimeout(() => msg.delete().catch(()=>{}), 3000));
    }
    inventory[category][item].amount -= amount;
    if (inventory[category][item].amount === 0) delete inventory[category][item];
  }

  saveInventory(inventory);

  // Update Inventory Board
  const stashChannel = await client.channels.fetch(stashChannelId).catch(()=>null);
  if (stashChannel) updateInventoryMessage(stashChannel);

  // Send Logs
  const logChannelId = command === "deposit" ? depositLogChannelId : withdrawLogChannelId;
  sendLog(logChannelId, command, message.author, item, amount, category);

  // Delete command message
  message.delete().catch(()=>{});
});

// --- Login ---
client.login(process.env.TOKEN);
