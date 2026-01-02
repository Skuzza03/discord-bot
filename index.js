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
const channelId = "1456489075941834949"; // <-- Replace with your Discord channel ID

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
  const channel = await client.channels.fetch(channelId);
  updateInventoryMessage(channel); // create initial empty inventory message
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
  const item = args.slice(0, args.length - 1).join(" ").toLowerCase(); // case-insensitive

  if (!item || amount <= 0 || isNaN(amount)) return;

  const inventory = loadInventory();
  const channel = await client.channels.fetch(channelId);

  // Prevent invalid junk items (numbers only)
  if (/^\d+$/.test(item)) return;

  if (command === "!deposit") {
    inventory[item] = (inventory[item] || 0) + amount;
    saveInventory(inventory);

    // Optional short confirmation that deletes automatically
    message.channel.send(`📥 Added ${amount} ${item} to the stash!`)
      .then(msg => setTimeout(() => msg.delete().catch(() => {}), 3000));

    updateInventoryMessage(channel);
  }

  if (command === "!withdraw") {
    if (!inventory[item] || inventory[item] < amount) {
      return message.channel.send("❌ Not enough items!")
        .then(msg => setTimeout(() => msg.delete().catch(() => {}), 3000));
    }

    inventory[item] -= amount;
    if (inventory[item] === 0) delete inventory[item]; // remove if 0
    saveInventory(inventory);

    message.channel.send(`📤 Removed ${amount} ${item} from the stash!`)
      .then(msg => setTimeout(() => msg.delete().catch(() => {}), 3000));

    updateInventoryMessage(channel);
  }
});

client.login(process.env.TOKEN);

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content;
  const guild = message.guild;

  // Deposit log
  if (content.startsWith("!deposit")) {
    const logChannel = guild.channels.cache.find((ch) => ch.name === "StashDEPOSIT");
    if (!logChannel) return;

    const parts = content.split(" ");
    const item = parts[1] || "unknown";
    const amount = parts[2] || "unknown";

    logChannel.send(`${message.author.tag} | deposit | ${item} | ${amount}`);
  }

  // Withdraw log
  if (content.startsWith("!withdraw")) {
    const logChannel = guild.channels.cache.find((ch) => ch.name === "StashWITHDRAW");
    if (!logChannel) return;

    const parts = content.split(" ");
    const item = parts[1] || "unknown";
    const amount = parts[2] || "unknown";

    logChannel.send(`${message.author.tag} | withdraw | ${item} | ${amount}`);
  }
});


