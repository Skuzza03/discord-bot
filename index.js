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

const workReportChannelId = "1457408055833657364"; // echte ID einfügen
const workStatsChannelId = "1457408149899317349"; // echte ID einfügen

// Dateien
const inventoryFile = "./inventory.json";
const workFile = path.join(__dirname, "workStats.json");

/* ============================================ */

// --- Inventory ---
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

// --- WorkStats ---
function loadWorkStats() {
    if (!fs.existsSync(workFile)) return {};
    return JSON.parse(fs.readFileSync(workFile, "utf8"));
}

function saveWorkStats(data) {
    fs.writeFileSync(workFile, JSON.stringify(data, null, 2));
}

function findMember(guild, name) {
    name = name.toLowerCase();
    return guild.members.cache.find(
        m => m.user.username.toLowerCase().includes(name) || m.displayName.toLowerCase().includes(name)
    );
}

// --- READY ---
client.once("ready", async () => {
    console.log(`✅ Bot online als ${client.user.tag}`);
    const stashChannel = await client.channels.fetch(stashChannelId).catch(() => null);
    if (stashChannel) updateStash(stashChannel);
});

// --- MESSAGE HANDLER ---
client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    // ================= STASH =================
    if (message.channel.id === stashChannelId) {
        if (message.content.toLowerCase() === "!help") {
            return message.channel.send(
                "```DEPOSIT: item qty W/D/M/O\nWITHDRAW: -item qty W/D/M/O```"
            );
        }

        const hasRole = message.member.roles.cache.some(r => allowedRoles.includes(r.name));
        if (!hasRole) return;

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

    // ================= WORKREPORTS =================
    if (message.channel.id === workReportChannelId) {
        if (message.content.toLowerCase() === "!help") {
            const embed = new EmbedBuilder()
                .setTitle("WorkReports Guide")
                .setDescription(`
**WorkReports Commands**
- \`+<number> <item>\` → Add items worked (example: +1 diving)
- \`<number> <item>\` → Same as above (example: 1 diving)
                `)
                .setColor(0x00ff99)
                .setTimestamp();
            message.channel.send({ embeds: [embed] }).then(() => message.delete().catch(() => {}));
            return;
        }

        const match = message.content.match(/^([+-]?\d+)\s*(\w+)/i);
        if (!match) return;

        const qty = parseInt(match[1].replace("+", ""));
        const item = match[2].toLowerCase();

        const stats = loadWorkStats();
        if (!stats[message.author.id]) stats[message.author.id] = {};
        if (!stats[message.author.id][item]) stats[message.author.id][item] = 0;

        stats[message.author.id][item] += qty;
        saveWorkStats(stats);

        message.delete().catch(() => {});
        return;
    }

    // ================= WORKSTATS =================
    if (message.channel.id === workStatsChannelId) {

        if (message.content.toLowerCase() === "!help") {
            const embed = new EmbedBuilder()
                .setTitle("WorkStats Guide (Leaders Only)")
                .setDescription(`
**WorkStats Commands**
- \`!stats <member>\` → Show stats for a member
- \`!res <member>\` → Reset stats for a member
- \`!top3\` → Show top 3 workers
                `)
                .setColor(0xff9900)
                .setTimestamp();
            message.channel.send({ embeds: [embed] }).then(() => message.delete().catch(() => {}));
            return;
        }

        const args = message.content.split(" ").slice(1);

        // --- !stats ---
        if (message.content.toLowerCase().startsWith("!stats")) {
            if (!args.length) return message.reply("❌ Please provide a member name.");
            const memberName = args.join(" ");
            const member = findMember(message.guild, memberName);
            if (!member) return message.reply("❌ Member not found.");

            const stats = loadWorkStats();
            const data = stats[member.id];
            if (!data) return message.reply(`No reports for ${member.displayName} in the last 7 days.`);

            let text = `Work stats for ${member.displayName}:\n`;
            for (const [item, qty] of Object.entries(data)) {
                text += `- ${item}: ${qty}\n`;
            }

            const embed = new EmbedBuilder()
                .setTitle(`Stats: ${member.displayName}`)
                .setDescription(text)
                .setColor(0x00ff99)
                .setTimestamp();

            message.channel.send({ embeds: [embed] }).then(() => message.delete().catch(() => {}));
            return;
        }

        // --- !res ---
        if (message.content.toLowerCase().startsWith("!res")) {
            if (!args.length) return message.reply("❌ Provide a member name.");
            const memberName = args.join(" ");
            const member = findMember(message.guild, memberName);
            if (!member) return message.reply("❌ Member not found.");

            const stats = loadWorkStats();
            stats[member.id] = {};
            saveWorkStats(stats);

            message.channel.send(`✅ Reset stats for ${member.displayName}`)
                .then(msg => setTimeout(() => msg.delete().catch(() => {}), 3000));
            message.delete().catch(() => {});
            return;
        }

        // --- !top3 ---
        if (message.content.toLowerCase().startsWith("!top3")) {
            const stats = loadWorkStats();
            const ranking = Object.entries(stats)
                .map(([id, items]) => {
                    const total = Object.values(items).reduce((a, b) => a + b, 0);
                    const member = message.guild.members.cache.get(id);
                    return { member, total };
                })
                .filter(r => r.member)
                .sort((a, b) => b.total - a.total)
                .slice(0, 3);

            let text = "";
            ranking.forEach((r, i) => {
                text += `${i + 1}. ${r.member.displayName}: ${r.total}\n`;
            });

            const embed = new EmbedBuilder()
                .setTitle("Top 3 Workers")
                .setDescription(text || "No stats yet.")
                .setColor(0xffaa00)
                .setTimestamp(); // zeigt automatisch "Today at ..." in Discord

            message.channel.send({ embeds: [embed] }).then(() => message.delete().catch(() => {}));
            return;
        }
    }
});

// ================= LOGIN =================
client.login(process.env.TOKEN);
