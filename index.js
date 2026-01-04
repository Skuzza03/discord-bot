const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

/* ================== CONFIG ================== */

// Rollen für WorkReports
const allowedRolesWork = ["Two Bar", "One Bar"];

// Channels
const stashChannelId = "1456489075941834949"; // dein Stash
const depositLogChannelId = "1456726864134668359";
const withdrawLogChannelId = "1456733883021267038";

const workReportsChannelId = "1457408055833657364";
const workStatsChannelId = "1457408149899317349";

// Inventory Datei
const inventoryFile = "./inventory.json";

// WorkStats Datei
const workFile = path.join(__dirname, "workStats.json");

/* ============================================ */

// ------------------- STASH -------------------
function loadInventory() {
    if (!fs.existsSync(inventoryFile)) return {};
    return JSON.parse(fs.readFileSync(inventoryFile, "utf8"));
}

function saveInventory(data) {
    fs.writeFileSync(inventoryFile, JSON.stringify(data, null, 2));
}

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

// ------------------- WORKSTATS -------------------

function loadWorkStats() {
    if (!fs.existsSync(workFile)) return {};
    return JSON.parse(fs.readFileSync(workFile, "utf8"));
}

function saveWorkStats(data) {
    fs.writeFileSync(workFile, JSON.stringify(data, null, 2));
}

// ------------------- READY -------------------
client.once("ready", async () => {
    console.log(`✅ Bot online als ${client.user.tag}`);

    // Stash initial updaten
    const stashChannel = await client.channels.fetch(stashChannelId).catch(() => null);
    if (stashChannel) updateStash(stashChannel);
});

// ------------------- MESSAGE HANDLER -------------------
client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    // ----------------- STASH -----------------
    if (message.channel.id === stashChannelId) {
        // Help Command
        if (message.content.toLowerCase() === "!help") {
            return message.channel.send(
                "```DEPOSIT: item qty W/D/M/O\nWITHDRAW: -item qty W/D/M/O```"
            );
        }

        // Rollen Check
        const allowedRoles = [
            "Two Bar",
            "One Bar",
            "Three Stripes Circle",
            "Two Stripe",
            "One Stripe"
        ];
        const hasRole = message.member.roles.cache.some(r => allowedRoles.includes(r.name));
        if (!hasRole) return;

        // Erlaubtes Format
        const match = message.content.match(/^(-?)(\S+)\s+(\d+)(?:\s+([WDMO]))?$/i);
        if (!match) return;

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
        return;
    }

    // ----------------- WORKREPORTS -----------------
    if (message.channel.id === workReportsChannelId) {
        const memberRoles = message.member.roles.cache.map(r => r.name);
        if (!memberRoles.some(r => allowedRolesWork.includes(r))) return;

        // Help Command
        if (message.content.toLowerCase() === "!help") {
            return message.channel.send(
                `**WorkReports Guide**\n` +
                `+<number> <item> → Add items worked (example: +1 diving)\n` +
                `<number> <item> → Same as above (example: 1 diving)\n` +
                `Leaders can use:\n!stats <member> → Show stats for a member\n!res <member> → Reset stats for a member\n!top3 → Show top 3 workers`
            );
        }

        // Work Report Eintrag matchen
        const reportMatch = message.content.match(/^\+?(\d+)\s+(\S+)$/i);
        if (!reportMatch) return;

        const qty = parseInt(reportMatch[1]);
        const item = reportMatch[2];
        const timestamp = new Date().toISOString();

        const stats = loadWorkStats();
        const memberId = message.author.id;

        if (!stats[memberId]) stats[memberId] = { tag: message.author.tag, entries: [] };
        stats[memberId].entries.push({ item, qty, timestamp });
        saveWorkStats(stats);

        message.delete().catch(() => {});
        return;
    }

    // ----------------- WORKSTATS COMMANDS -----------------
    if (message.channel.id === workStatsChannelId) {
        const args = message.content.trim().split(/\s+/);
        const command = args.shift().toLowerCase();

        // !help
        if (command === "!help") {
            return message.channel.send(
                `**WorkStats Guide (Leaders)**\n` +
                `!stats <member> → Show stats for a member\n` +
                `!res <member> → Reset stats for a member\n` +
                `!top3 → Show top 3 workers`
            );
        }

        const stats = loadWorkStats();

        // !stats <member>
        if (command === "!stats" && args.length) {
            const searchName = args.join(" ").toLowerCase();
            const memberEntry = Object.values(stats).find(m => m.tag.toLowerCase().includes(searchName));
            if (!memberEntry) {
                return message.channel.send(`❌ Member not found.`);
            }

            let text = `Work stats for ${memberEntry.tag}:\n`;
            memberEntry.entries.forEach(e => {
                const date = new Date(e.timestamp);
                const dateStr = date.toLocaleDateString() + " " + date.toLocaleTimeString();
                text += `${e.item}: ${e.qty} → ${dateStr}\n`;
            });

            const embed = new EmbedBuilder()
                .setTitle(`Stats: ${memberEntry.tag}`)
                .setDescription(text)
                .setColor(0x3498db);

            const sent = await message.channel.send({ embeds: [embed] });
            setTimeout(() => sent.delete().catch(() => {}), 10000); // nach 10 Sekunden löschen
            message.delete().catch(() => {});
            return;
        }

        // !res <member>
        if (command === "!res" && args.length) {
            const searchName = args.join(" ").toLowerCase();
            const memberKey = Object.keys(stats).find(id => stats[id].tag.toLowerCase().includes(searchName));
            if (!memberKey) return message.channel.send(`❌ Member not found.`);

            stats[memberKey].entries = [];
            saveWorkStats(stats);

            const embed = new EmbedBuilder()
                .setTitle(`Reset Stats`)
                .setDescription(`✅ Reset stats for ${stats[memberKey].tag}\n${new Date().toLocaleString()}`)
                .setColor(0xe67e22);

            const sent = await message.channel.send({ embeds: [embed] });
            setTimeout(() => sent.delete().catch(() => {}), 10000);
            message.delete().catch(() => {});
            return;
        }

        // !top3
        if (command === "!top3") {
            const members = Object.values(stats)
                .map(m => ({
                    tag: m.tag,
                    total: m.entries.reduce((a, e) => a + e.qty, 0),
                    last: m.entries[m.entries.length - 1]?.timestamp || null
                }))
                .sort((a, b) => b.total - a.total)
                .slice(0, 3);

            let text = "";
            members.forEach(m => {
                const dateStr = m.last ? new Date(m.last).toLocaleDateString() + " " + new Date(m.last).toLocaleTimeString() : "N/A";
                text += `${m.tag}: ${m.total} → ${dateStr}\n`;
            });

            const embed = new EmbedBuilder()
                .setTitle("Top 3 Workers")
                .setDescription(text || "No data")
                .setColor(0x2ecc71);

            const sent = await message.channel.send({ embeds: [embed] });
            setTimeout(() => sent.delete().catch(() => {}), 10000);
            message.delete().catch(() => {});
            return;
        }
    }
});

// ------------------- LOGIN -------------------
client.login(process.env.TOKEN);
