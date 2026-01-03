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

// --- ASCII MDT Gang Stash Board ---
function buildAsciiInventory(inventory) {
  const pad = (text, length) => text.padEnd(length, " ");
  const dash = (length) => "═".repeat(length);

  const widthCategory = 20;
  const widthItems = 55;
  const totalWidth = widthCategory + widthItems + 3;

  let lines = [];

  // Header
  lines.push(`╔${dash(totalWidth)}╗`);
  lines.push(`║${pad("GANG STASH", totalWidth)}║`);
  lines.push(`║${pad("Inventory Dashboard", totalWidth)}║`);
  lines.push(`╠${dash(widthCategory)}╦${dash(widthItems)}╣`);
  lines.push(`║ CATEGORY${pad("", widthCategory - 8)}║ ITEMS${pad("", widthItems - 5)}║`);
  lines.push(`╠${dash(widthCategory)}╬${dash(widthItems)}╣`);

  const categories = ["Weapons", "Drugs", "Materials", "Other"];
  for (const category of categories) {
    const items = inventory[category] || {};
    const itemKeys = Object.keys(items);
    if (itemKeys.length === 0) {
      lines.push(`║ ${pad(category.toUpperCase(), widthCategory - 1)}║ ${pad("-", widthItems - 1)}║`);
      lines.push(`╠${dash(widthCategory)}╬${dash(widthItems)}╣`);
      continue;
    }

    let firstLine = true;
    for (const item of itemKeys) {
      const amount = items[item];

      // Punkte dynamisch berechnen
      const dotsCount = widthItems - item.length - 4; // 4 = 1 space + x + max 2 digits
      const dots = ".".repeat(dotsCount > 0 ? dotsCount : 0);
      const itemLine = `${item}${dots} x${amount}`;

      if (firstLine) {
        lines.push(`║ ${pad(category.toUpperCase(), widthCategory - 1)}║ ${pad(itemLine, widthItems - 1)}║`);
        firstLine = false;
      } else {
        lines.push(`║ ${pad("", widthCategory - 1)}║ ${pad(itemLine, widthItems - 1)}║`);
      }
    }
    lines.push(`╠${dash(widthCategory)}╬${dash(widthItems)}╣`);
  }

  // Footer
  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2,"0")}.${String(now.getMonth()+1).padStart(2,"0")}.${now.getFullYear()}`;
  lines.push(`║ Last Updated: ${pad(dateStr, totalWidth - 15)}║`);
  lines.push(`╚${dash(totalWidth)}╝`);

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

client.once("ready", async () => {
  console.log("✅ Gang Bot is online!");
  const stashChannel = await client.channels.fetch(stashChannelId).catch(() => null);
  if (stashChannel) updateInventoryMessage(stashChannel);
});

// --- Commands ---
client.on("messageCreate", async message => {
  if (message.author.bot) return;

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
  let category = "Other";
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
  const item = rest.slice(0, rest.lastIndexOf(amountMatch[1])).trim().toLowerCase();
  if (!item || amount <= 0) return;

  // Load Inventory
  const inventory = loadInventory();
  if (!inventory[category]) inventory[category] = {};
  if (!inventory[category][item]) inventory[category][item] = 0;

  if (command === "deposit") inventory[category][item] += amount;
  else {
    if (!inventory[category][item] || inventory[category][item] < amount) {
      return message.reply("❌ Not enough items!").then(msg => setTimeout(() => msg.delete().catch(()=>{}), 3000));
    }
    inventory[category][item] -= amount;
    if (inventory[category][item] === 0) delete inventory[category][item];
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
