const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

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

// --- Load / Save Inventory ---
function loadInventory() {
    if (!fs.existsSync(inventoryFile)) return {};
    return JSON.parse(fs.readFileSync(inventoryFile));
}

function saveInventory(data) {
    fs.writeFileSync(inventoryFile, JSON.stringify(data, null, 2));
}

// --- Build Stash Text ---
function buildStashText(inventory) {
    const padItem = (name, qty) => {
        const maxLen = 17;
        const itemName = name.padEnd(maxLen, " ");
        const qtyStr = `x${qty}`.padEnd(6, " ");
        return `  - ${itemName}${qtyStr}`;
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
        for (const [itemName, qty] of Object.entries(items)) {
            text += padItem(itemName, qty) + "\n";
        }
        text += "\n";
    }

    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2,'0')}.${String(now.getMonth()+1).padStart(2,'0')}.${now.getFullYear()}`;
    text += `────────────────────────────────────────────────────────────────────\nLast Updated: ${dateStr}\n`;

    return "```" + text + "```";
}

// --- Update Inventory Message ---
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

// --- Send Modern Log ---
async function sendLog(channelId, action, user, item, qty, category) {
    const channel = await client.channels.fetch(channelId).catch(()=>null);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setTitle(action.toUpperCase())
        .setColor(action === "deposit" ? 0x2ECC71 : 0xE74C3C)
        .addFields(
            { name: "User", value: user.tag, inline: true },
            { name: "Item", value: item, inline: true },
            { name: "Quantity", value: qty.toString(), inline: true },
            { name: "Category", value: category, inline: true },
            { name: "Time", value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: true }
        );

    channel.send({ embeds: [embed] });
}

// --- Bot Ready ---
client.once('ready', async () => {
    console.log(`✅ Gang Bot online as ${client.user.tag}`);
    const stashChannel = await client.channels.fetch(stashChannelId).catch(()=>null);
    if (stashChannel) updateInventoryMessage(stashChannel);
});

// --- Commands ---
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

    // Kategorie aus Klammern
    let category = "Others";
    const categoryMatch = rest.match(/\(([^)]+)\)$/);
    if (categoryMatch) {
        const catInput = categoryMatch[1].trim().toLowerCase();
        const validCategories = ["weapons","drugs","materials","others"];
        if (!validCategories.includes(catInput)) {
            return message.reply("❌ Invalid category! Use Weapons, Drugs, Materials, Others")
                          .then(msg => setTimeout(()=>msg.delete().catch(()=>{}), 3000));
        }
        category = catInput.charAt(0).toUpperCase() + catInput.slice(1);
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
    if (!inventory[category][itemName]) inventory[category][itemName] = 0;

    if (command === "deposit") {
        inventory[category][itemName] += qty;
    } else if (command === "withdraw") {
        if (!inventory[category][itemName] || inventory[category][itemName] < qty) {
            return message.reply("❌ Not enough items!").then(msg=>setTimeout(()=>msg.delete().catch(()=>{}),3000));
        }
        inventory[category][itemName] -= qty;
        if (inventory[category][itemName] === 0) delete inventory[category][itemName];
    }

    saveInventory(inventory);

    // Update Stash Board
    const stashChannel = await client.channels.fetch(stashChannelId).catch(()=>null);
    if (stashChannel) updateInventoryMessage(stashChannel);

    // Send Log
    const logChannelId = command === "deposit" ? depositLogChannelId : withdrawLogChannelId;
    sendLog(logChannelId, command, message.author, itemName, qty, category);

    // Delete command message
    message.delete().catch(()=>{});
});

// --- Login ---
client.login(process.env.TOKEN);
