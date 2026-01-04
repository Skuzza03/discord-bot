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

/* ================== CONFIG ================== */

// Rollen die den Stash benutzen dürfen
const allowedRoles = [
    "Two Bar",
    "One Bar",
    "Three Stripes Circle",
    "Two Stripe",
    "One Stripe"
];

// Channels
const stashChannelId = "1456489075941834949";
const depositLogChannelId = "1456726864134668359";
const withdrawLogChannelId = "1456733883021267038";

// Inventory Datei
const inventoryFile = "./inventory.json";

/* ============================================ */

// Inventory laden
function loadInventory() {
    if (!fs.existsSync(inventoryFile)) return {};
    return JSON.parse(fs.readFileSync(inventoryFile, "utf8"));
}

// Inventory speichern
function saveInventory(data) {
    fs.writeFileSync(inventoryFile, JSON.stringify(data, null, 2));
}

// Stash Anzeige
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

// Stash Message updaten
async function updateStash(channel) {
    const inventory = loadInventory();
    const text = buildStashText(inventory);

    const messages = await channel.messages.fetch({ limit: 20 });
    const botMsg = messages.find(
        m => m.author.id === client.user.id && m.content.startsWith("```PINKPANTHER STASH")
    );

    if (botMsg) await botMsg.edit(text);
    else await channel.send(text);
}

// Logs
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

// Ready
client.once("ready", async () => {
    console.log(`✅ Bot online als ${client.user.tag}`);
    const channel = await client.channels.fetch(stashChannelId).catch(() => null);
    if (channel) updateStash(channel);
});

// ================== MESSAGE HANDLER ==================
client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    // ❗ NORMALER CHAT → NICHT löschen
    if (message.channel.id !== stashChannelId) return;

    // Help Command
    if (message.content.toLowerCase() === "!help") {
        return message.channel.send(
            "```DEPOSIT: item qty W/D/M/O\nWITHDRAW: -item qty W/D/M/O```"
        );
    }

    // Rollen Check
    const hasRole = message.member.roles.cache.some(r => allowedRoles.includes(r.name));
    if (!hasRole) return;

    // Erlaubtes Format
    const match = message.content.match(/^(-?)(\S+)\s+(\d+)(?:\s+([WDMO]))?$/i);
    if (!match) return; // ❗ Falsche Nachrichten bleiben stehen

    const isWithdraw = match[1] === "-";
    const item = match[2];
    const qty = parseInt(match[3]);
    const catMap = { W: "Weapons", D: "Drugs", M: "Materials", O: "Others" };
    const category = catMap[(match[4] || "O").toUpperCase()];

    const inventory = loadInventory();
    if (!inventory[category]) inventory[category] = {};
    if (!inventory[category][item]) inventory[category][item] = 0;

    if (isWithdraw) {
        if (inventory[category][item] < qty) {
            return message.reply("❌ Not enough items!");
        }
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

    message.delete().catch(() => {});
});

// Login
client.login(process.env.TOKEN);
