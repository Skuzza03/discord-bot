const { Client, GatewayIntentBits } = require("discord.js");
const fs = require("fs");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const inventoryFile = "./inventory.json";
let inventoryMessageId = null;

// === HIER DEINE CHANNEL-IDs EINTRAGEN ===
const stashChannelId = "1456489075941834949";       // Gang Stash Inventory
const depositLogChannelId = "1456726864134668359"; // Deposit Logs
const withdrawLogChannelId = "1456733883021267038"; // Withdraw Logs

// Load inventory
function loadInventory() {
  if (!fs.existsSync(inventoryFile)) return {};
  return JSON.parse(fs.readFileSync(inventoryFile));
}

// Save inventory
function saveInventory(data) {
  fs.writeFileSync(inventoryFile, JSON.stringify(data, null, 2));
}

// Format inventory message
function formatInventory(inventory) {
  let text = "📦 **Gang Stash Inventory**\n";
  text += "-------------------------\n";

  const keys = Object.keys(inventory);
  if (keys.length === 0) {
    text += "Inventory is empty!\n";
  } else {
    for (const [item, amount] of Object.entries(inventory)) {
      text += `• ${item} x${amount}\n`;
    }
  }

  text += "-------------------------";
  return text;
}

// Update inventory message in the channel
async function updateInventoryMessage(channel) {
  const inventory = loadInventory();
  const text = formatInventory(inventory);

  try {
    if (inventoryMessageId) {
      const msg = await channel.messages.fetch(inventoryMessageId).catch(() => null);
      if (msg) await msg.edit("```" + text + "```");
      else {
        const newMsg = await channel.send("```" + text + "```");
        inventoryMessageId = newMsg.id;
      }
    } else {
      const msg = await channel.send("```" + text + "```");
      inventoryMessageId = msg.id;
    }
  } catch (err) {
    console.log("Error updating inventory message:", err);
  }
}

// Bot ready
client.once("ready", async () => {
  console.log("✅ Bot is online!");
  const channel = await client.channels.fetch(stashChannelId).catch(() => null);
  if (channel) updateInventoryMessage(channel); // create initial inventory message
});

// Commands
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const args = message.content.trim().split(" ");
  const command = args.shift().toLowerCase();

  if (!["!deposit", "!withdraw"].includes(command)) return;

  // Delete command message to keep channel clean
  message.delete().catch(() => {});

  if (args.length < 2) return;

  const amount = parseInt(args[args.length - 1]);
  const item = args.slice(0, args.length - 1).join(" ").toLowerCase();

  if (!item || amount <= 0 || isNaN(amount)) return;

  const inventory = loadInventory();
  const stashChannel = await client.channels.fetch(stashChannelId).catch(() => null);

  // --- LOGS FÜR DEPOSIT UND WITHDRAW (CRASH-SICHER) ---
  try {
    if (command === "!deposit") {
      const logChannel = await client.channels.fetch(depositLogChannelId).catch(() => null);
      if (logChannel) logChannel.send(`✅ ${message.author.tag} | deposit | ${item} | ${amount}`).catch(() => {});
    }

    if (command === "!withdraw") {
      const logChannel = await client.channels.fetch(withdrawLogChannelId).catch(() => null);
      if (logChannel) logChannel.send(`✅ ${message.author.tag} | withdraw | ${item} | ${amount}`).catch(() => {});
    }
  } catch (err) {
    console.error("Fehler beim Loggen:", err);
  }

  // --- INVENTORY UPDATE ---
  if (command === "!deposit") {
    inventory[item] = (inventory[item] || 0) + amount;
    saveInventory(inventory);

    message.channel.send(`📥 Added ${amount} ${item} to the stash!`)
      .then(msg => setTimeout(() => msg.delete().catch(() => {}), 3000));

    if (stashChannel) updateInventoryMessage(stashChannel);
  }

  if (command === "!withdraw") {
    if (!inve
