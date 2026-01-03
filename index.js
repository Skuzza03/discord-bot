const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers] });

// Rollen, die Commands benutzen dürfen
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
const inventoryFile = './inventory.json';

// Load / Save Inventory
function loadInventory() {
  if (!fs.existsSync(inventoryFile)) return {};
  return JSON.parse(fs.readFileSync(inventoryFile));
}

function saveInventory(data) {
  fs.writeFileSync(inventoryFile, JSON.stringify(data, null, 2));
}

// Build Stash Text
function buildStashText(inventory) {
  const padItem = (name, qty, value) => {
    const maxLen = 17;
    const itemName = name.padEnd(maxLen, " ");
    const qtyStr = qty === undefined ? "-" : `x${qty}`.padEnd(6, " ");
    return `  - ${itemName}${qtyStr}| Value: ${value}`;
  }

  const categories = ["Weapons", "Drugs", "Materials", "Others"];
  let text = `PINKPANTHER STASH\n────────────────────────────────────────────────────────────────────\n\n`;

  for (const cat of categories) {
    text += `${cat.toUpperCase()}\n`;
    const items = inventory[cat] || {};
    if (Object.keys(items).length === 0) {
      text += `  - (Empty)\n\n`;
      continue;
    }
    for (const [itemName, itemData] of Object.entries(items)) {
      text += padItem(itemName, itemData.qty, itemData.value) + "\n";
    }
    text += "\n";
  }

  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2,'0')}.${String(now.getMonth()+1).padStart(2,'0')}.${now.getFullYear()}`;
  text += `────────────────────────────────────────────────────────────────────\nLast Updated: ${dateStr}\n`;

  return "```" + text + "```";
}

// Update Inventory Message
async function updateInventoryMessage(channel) {
  const inventory = loadInventory();
  const stashText = buildStashText(inventory);

  try {
    const messages = await channel.messages.fetch({ limit: 50 });
    const botMsg = messages.find(m => m.author.id === client.user.id && m.content.startsWith("```PINKPANTHER STASH"));
    if (botMsg) await botMsg.edit(stashText);
    else await channel.send(stashText);
  } catch (err) {
    console.log("Error updating stash message:", err);
  }
}

// Send Log
async function sendLog(channelId, action, user, item, qty, category) {
  const channel = await client.channels.fetch(channelId).catch(()=>null);
  if (!channel) return;
  const timestamp = Math.floor(Date.now() / 1000);
  channel.send(`**${action.toUpperCase()}** | ${user.tag} | ${item} x${qty} | ${category} | <t:${timestamp}:R>`);
}

// Bot Ready
client.once('ready', async () => {
  console.log(`✅ Gang Bot online as ${client.user.tag}`);
  const stashChannel = await client.channels.fetch(stashChannelId).catch(()=>null);
  if (stashChannel) updateInventoryMessage(stashChannel);
});

// Commands
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  const match = message.content.match(/^!(deposit|withdraw)\s+(.+)/i);
  if (!match) return;

  const command = match[1].toLowerCase();
  let rest = match[2].trim();

  // Rollen Check
  const hasRole = message.member.roles.cache.some(r => allowedRoles.includes(r.name));
  if (!hasRole) {
    await message.reply("❌ You don’t have permission!").then(msg => setTimeout(()=>msg.delete().catch(()=>{}),4000));
    return message.delete().catch(()=>{});
  }

  // Kategorie optional (z.B. !deposit skuzza 1 (Weapons))
  let category = "Others";
  const categoryMatch = rest.match(/\(([^)]+)\)$/);
  if (categoryMatch) {
    category = categoryMatch[1].trim();
    rest = rest.replace(/\([^)]+\)$/, "").trim();
  }

  // Menge = letzte Zahl
  const qtyMatch = rest.match(/(\d+)$/);
  if (!qtyMatch) return message.reply("❌ Invalid command!").then(msg=>setTimeout(()=>msg.delete().catch(()=>{}),3000));
  const qty = parseInt(qtyMatch[1]);

  // Itemname = alles davor
  const itemName = rest.slice(0, rest.lastIndexOf(qtyMatch[1])).trim();
  if (!itemName || qty <= 0) return;

  // Load Inventory
  const inventory = loadInventory();
  if (!inventory[category]) inventory[category] = {};
  if (!inventory[category][itemName]) inventory[category][itemName] = { qty: 0, value: 1000 }; // default value

  if (command === "deposit") inventory[category][itemName].qty += qty;
  else {
    if (!inventory[category][itemName] || inventory[category][itemName].qty < qty) {
      return message.reply("❌ Not enough items!").then(msg=>setTimeout(()=>msg.delete().catch(()=>{}),3000));
    }
    inventory[category][itemName].qty -= qty;
    if (inventory[category][itemName].qty === 0) delete inventory[category][itemName];
  }

  saveInventory(inventory);

  // Update Stash Message
  const stashChannel = await client.channels.fetch(stashChannelId).catch(()=>null);
  if (stashChannel) updateInventoryMessage(stashChannel);

  // Send Logs
  const logChannelId = command === "deposit" ? depositLogChannelId : withdrawLogChannelId;
  sendLog(logChannelId, command, message.author, itemName, qty, category);

  // Delete command message
  message.delete().catch(()=>{});
});

// Bot Login
client.login(process.env.TOKEN);
