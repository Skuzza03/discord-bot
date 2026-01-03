const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const fs = require("fs");

// Roles allowed for deposit & withdraw
const allowedRoles = [
  "Two Bar",
  "One Bar",
  "Three Stripes Circle",
  "Two Stripe",
  "One Stripe"
];

// Channel IDs
const stashChannelId = "1456489075941834949";       // Inventory display
const depositLogChannelId = "1456726864134668359";
const withdrawLogChannelId = "1456733883021267038";

// Inventory file
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

// --- Modern Deposit / Withdraw Log ---
function sendStashLog({ channel, action, user, item, amount }) {
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle("Gang Stash Log")
    .setColor(action === "DEPOSIT" ? 0x2ecc71 : 0xe74c3c)
    .addFields(
      { name: "User", value: user.tag, inline: true },
      { name: "Action", value: action, inline: true },
      { name: "Item", value: item, inline: true },
      { name: "Amount", value: amount.toString(), inline: true },
      { name: "Time", value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
    )
    .setFooter({ text: "Gang Control System" });

  channel.send({ embeds: [embed] }).catch(() => {});
}

// --- Modern Dashboard Inventory Embed ---
function buildInventoryEmbed(inventory) {
  const embed = new EmbedBuilder()
    .setTitle("💼 Gang Stash Inventory")
    .setColor(0x1f1f1f) // Dark theme
    .setFooter({ text: "Gang Inventory System" })
    .setTimestamp();

  // Fixed category order
  const categoryOrder = ["Weapons", "Drugs", "Materials", "Other"];

  for (const category of categoryOrder) {
    if (!inventory[category]) continue;

    const items = inventory[category];
    let value = "";

    // Sort by amount descending
    const sortedItems = Object.entries(items).sort((a, b) => b[1] - a[1]);

    for (const [item, amount] of sortedItems) {
      value += `\`${item}\` × ${amount}\n`;
    }

    if (value === "") value = "—";

    embed.addFields({
      name: category,
      value: value,
      inline: true
    });
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

  const args = message.content.trim().split(" ");
  const command = args.shift().toLowerCase();

  if (!["!deposit", "!withdraw"].includes(command)) return;

  message.delete().catch(() => {});

  if (args.length < 2) return;

  // Amount
  let amount = parseInt(args[args.length - 1]);
  if (isNaN(amount) || amount <= 0) return;

  // Check for category in parentheses
  let itemRaw = args.slice(0, args.length - 1).join(" ");
  let category = "Other"; // Default category

  const match = itemRaw.match(/\(([^)]+)\)$/);
  if (match) {
    category = match[1].trim();
    itemRaw = itemRaw.replace(/\([^)]+\)$/, "").trim();
  }

  const item = itemRaw.toLowerCase();

  // Role check
  const hasRole = message.member.roles.cache.some(role => allowedRoles.includes(role.name));
  if (!hasRole) {
    return message.reply("❌ You don’t have permission!").then(msg => setTimeout(() => msg.delete().catch(() => {}), 4000));
  }

  // Load inventory
  const inventory = loadInventory();
  if (!inventory[category]) inventory[category] = {};
  if (!inventory[category][item]) inventory[category][item] = 0;

  // Deposit or Withdraw
  if (command === "!deposit") {
    inventory[category][item] += amount;
  } else if (command === "!withdraw") {
    if (!inventory[category][item] || inventory[category][item] < amount) {
      return message.reply("❌ Not enough items!").then(msg => setTimeout(() => msg.delete().catch(() => {}), 3000));
    }
    inventory[category][item] -= amount;
    if (inventory[category][item] === 0) delete inventory[category][item];
  }

  saveInventory(inventory);

  // Update Inventory Embed
  const stashChannel = await client.channels.fetch(stashChannelId).catch(() => null);
  if (stashChannel) updateInventoryMessage(stashChannel);

  // Send Log
  const logChannelId = command === "!deposit" ? depositLogChannelId : withdrawLogChannelId;
  const logChannel = await client.channels.fetch(logChannelId).catch(() => null);
  sendStashLog({ channel: logChannel, action: command.toUpperCase(), user: message.author, item, amount });
});

// --- Login ---
client.login(process.env.TOKEN);
