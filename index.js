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
// --------------------
// Work-Reports Feature
// --------------------

const workInputChannelId = "CHANNEL_ID_INPUT";   // Channel wo Mitglieder ihre Reports posten
const workStatsChannelId = "CHANNEL_ID_STATS";   // Channel für Leader Stats

const leaderRoles = ["Two Bar", "One Bar"];     // Rollen die Stats abfragen dürfen

const workFile = "./workStats.json";  // JSON File für Reports

// JSON laden/speichern
function loadWorkData() {
    if (!fs.existsSync(workFile)) return {};
    return JSON.parse(fs.readFileSync(workFile, "utf8"));
}

function saveWorkData(data) {
    fs.writeFileSync(workFile, JSON.stringify(data, null, 2));
}

// Summiere Items der letzten 7 Tage
function getWeeklyStats(memberId) {
    const data = loadWorkData();
    if (!data[memberId]) return {};
    const oneWeekAgo = Date.now() - 7*24*60*60*1000;
    const stats = {};
    data[memberId].forEach(report => {
        const reportTime = new Date(report.date).getTime();
        if (reportTime >= oneWeekAgo) {
            for (const [item, qty] of Object.entries(report.items)) {
                stats[item] = (stats[item] || 0) + qty;
            }
        }
    });
    return stats;
}

// Message handler für Work Input & Stats Command
client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    // --- Work Input Channel ---
    if (message.channel.id === workInputChannelId) {
        await message.delete().catch(() => {});
        const lines = message.content.split("\n");
        const reportItems = {};
        for (const line of lines) {
            const match = line.match(/^\+?(\d+)\s+(.+)$/);
            if (match) {
                const qty = parseInt(match[1]);
                const item = match[2].trim();
                reportItems[item] = (reportItems[item] || 0) + qty;
            }
        }
        if (Object.keys(reportItems).length === 0) return;

        const data = loadWorkData();
        if (!data[message.author.id]) data[message.author.id] = [];
        data[message.author.id].push({ date: new Date().toISOString(), items: reportItems });
        saveWorkData(data);

        const embed = new EmbedBuilder()
            .setTitle(`WORK REPORT – ${message.author.username}`)
            .setDescription(Object.entries(reportItems).map(([item, qty]) => `${item}: ${qty}`).join("\n"))
            .setTimestamp();

        const sentMsg = await message.channel.send({ embeds: [embed] });
        setTimeout(() => sentMsg.delete().catch(() => {}), 30000);
        return;
    }

    // --- Stats Command ---
    if (message.content.toLowerCase().startsWith("!stats")) {
        const hasRole = message.member.roles.cache.some(r => leaderRoles.includes(r.name));
        if (!hasRole) return message.reply("❌ You do not have permission to use this command.");
        const args = message.content.split(" ");
        if (args.length < 2) return message.reply("Usage: !stats <Member>");
        const memberName = args[1];
        const guild = message.guild;
        const member = guild.members.cache.find(m => m.user.username.toLowerCase() === memberName.toLowerCase());
        if (!member) return message.reply("❌ Member not found.");

        const stats = getWeeklyStats(member.id);
        if (Object.keys(stats).length === 0) return message.reply(`No reports for ${member.user.username} in the last 7 days.`);

        const embed = new EmbedBuilder()
            .setTitle(`WEEKLY STATISTICS – ${member.user.username}`)
            .setDescription(Object.entries(stats).map(([item, qty]) => `${item}: ${qty}`).join("\n"))
            .setTimestamp();

        const statsChannel = await client.channels.fetch(workStatsChannelId);
        statsChannel.send({ embeds: [embed] });
        return;
    }
});

// --------------------
// Ende Work-Reports Feature
// --------------------

// Login
client.login(process.env.TOKEN);
