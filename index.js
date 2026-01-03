const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const fs = require("fs");

// === Rollen die Commands benutzen dürfen ===
const allowedRoles = [
  "Two Bar",
  "One Bar",
  "Three Stripes Circle",
  "Two Stripe",
  "One Stripe"
];

// === Channel IDs ===
const stashChannelId = "1456489075941834949";
const depositLogChannelId = "1456726864134668359";
const withdrawLogChannelId = "1456733883021267038";

// === Inventory Datei ===
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

// --- Modern Logs ---
function sendStashLog({ channel, action, user, item, amount, category }) {
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle("Gang Stash Log")
    .setColor(action === "DEPOSIT" ? 0x2ecc71 : 0xe74c3c)
    .addFields(
      { name: "User", value: user.tag, inline: true },
      { name: "Action", value: action, inline: true },
      { name: "Item", value: item, inline: true },
      { name: "Amount", value: amount.toString(), inline: true },
      { name: "Category", value: category, inline: true },
      { name: "Time", value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
    )
    .setFooter({ text: "Gang Control System" });

  channel.send({ embeds: [embed] }).catch(() => {});
}

// --- Modern Gang Stash Inventory Embed (NEUES DESIGN) ---
function buildInventoryEmbed(inventory) {
  const embed = new EmbedBuilder()
    .setTitle("💎 GANG STASH INVENTORY 💎")
    .setColor(0x0f0f0f)
    .setFooter({ text: "Gang Inventory System" })
    .setTimestamp();

  // Farben pro Kategorie
  const categories = [
    { name: "Weapons", color: 0xe74c3c },  // rot
    { name: "Drugs", color: 0x2ecc71 },    // grün
    { name: "Materials", color: 0x3498db },// blau
    { name: "Other", color: 0x95a5a6 }     // grau
  ];

  for (const cat of categories) {
    const items = inventory[cat.name];
    let value = "";

    if (!items || Object.keys(items).length === 0) {
      value = "—";
    } else {
      const sorted = Object.entries(items).sort((a, b) => b[1] - a[1]);
      for (const [item, amount] of sorted) {
        value += `\`${item}\` × ${amount}\n`;
      }
    }

    embed.addFields({ name: cat.name, value: value, inline: true });
  }

  return embed;
}

// --- Update Inventory Message ---
async function updateInventoryMessage(channel) {
  const inventory = loadInventory();
  const embed = buildInventoryEmbed(inventory);

  try {
    if (inventoryMessageId) {
      const msg = await channel.messages.fetch(inventoryMessageId).catch(() => null);
      if (msg) await msg.edit({ embeds: [embed] });
      else {
        const newMsg = await channel.send({ embeds: [embed] });
        inventoryMessageId = newMsg.id;
      }
    } else {
      const newMsg = await channel.send({ embeds: [embed] });
      inventoryMessageId = newMsg.id;
    }
  } catch (err) {
    console.log("Inventory update error:", err);
  }
}

// --- Client Setup ---
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

  // --- Rollen Check ---
  const hasRole = message.member.roles.cache.some(role => allowedRoles.includes(role.name));
  if (!hasRole) {
    await message.reply("❌ You don’t have permission!").then(msg =>
      setTimeout(() => msg.delete().catch(() => {}), 4000)
    );
    return message.delete().catch(() => {});
  }

  // --- Kategorie optional ---
  let category = "Other";
  const categoryMatch = rest.match(/\(([^)]+)\)$/);
  if (categoryMatch) {
    category = categoryMatch[1].trim();
    rest = rest.replace(/\([^)]+\)$/, "").trim();
  } else {
    const parts = rest.split(" ");
    const lastWord = parts[parts.length - 1].toLowerCase();
    const validCategories = ["weapons", "drugs", "materials"];
    if (validCategories.includes(lastWord)) {
      category = lastWord[0].toUpperCase() + lastWord.slice(1);
      parts.pop();
      rest = parts.join(" ");
    }
  }

  // --- Amount = letzte Zahl ---
  const amountMatch = rest.match(/(\d+)$/);
  if (!amountMatch) return message.reply("❌ Invalid command!").then(msg =>
    setTimeout(() => msg.delete().catch(() => {}), 4000)
  );
  const amount = parseInt(amountMatch[1]);

  // --- Item = alles davor ---
  const item = rest.slice(0, rest.lastIndexOf(amountMatch[1])).trim().toLowerCase();
  if (!item || amount <= 0) return;

  // --- Load Inventory ---
  const inventory = loadInventory();
  if (!inventory[category]) inventory[category] = {};
  if (!inventory[category][item]) inventory[category][item] = 0;

  // --- Deposit / Withdraw ---
  if (command === "deposit") inventory[category][item] += amount;
  else {
    if (!inventory[category][item] || inventory[category][item] < amount) {
      return message.reply("❌ Not enough items!").then(msg =>
        setTimeout(() => msg.delete().catch(() => {}), 3000)
      );
    }
    inventory[category][item] -= amount;
    if (inventory[category][item] === 0) delete inventory[category][item];
  }

  saveInventory(inventory);

  // --- Update Inventory Embed ---
  const stashChannel = await client.channels.fetch(stashChannelId).catch(() => null);
  if (stashChannel) updateInventoryMessage(stashChannel);

  // --- Logs ---
  const logChannelId = command === "deposit" ? depositLogChannelId : withdrawLogChannelId;
  const logChannel = await client.channels.fetch(logChannelId).catch(() => null);
  sendStashLog({ channel: logChannel, action: command.toUpperCase(), user: message.author, item, amount, category });

  // --- Command Nachricht löschen ---
  message.delete().catch(() => {});
});

// --- Login ---
client.login(process.env.TOKEN);
