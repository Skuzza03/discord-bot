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

// Rollen für Stash
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

const workReportChannelId = "1457408055833657364"; // WorkReports Channel
const workStatsChannelId = "1457408149899317349";     // WorkStats Channel für Leader

// Dateien
const inventoryFile = "./inventory.json";
const workFile = path.join(__dirname, "workStats.json");

/* ============================================ */

// --- INVENTORY FUNCTIONS ---
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

// --- WORK STATS FUNCTIONS ---
function loadWorkStats() {
    if (!fs.existsSync(workFile)) return {};
    return JSON.parse(fs.readFileSync(workFile, "utf8"));
}

function saveWorkStats(data) {
    fs.writeFileSync(workFile, JSON.stringify(data, null, 2));
}

// Format time
function formatTime(ts) {
    const d = new Date(ts);
    return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}

// --- READY ---
client.once("ready", async () => {
    console.log(`✅ Bot online als ${client.user.tag}`);
    const stashChannel = await client.channels.fetch(stashChannelId).catch(() => null);
    if (stashChannel) updateStash(stashChannel);
});

// --- MESSAGE HANDLER ---
client.on("messageCreate", async message => {
    if (message.author.bot) return;

    // === WORK REPORT CHANNEL ===
    if (message.channel.id === workReportChannelId) {

        // Help message
        if (message.content.toLowerCase() === "!help") {
            const embed = new EmbedBuilder()
                .setTitle("WorkReports & WorkStats Guide")
                .setDescription(
`**WorkReports Commands**
\`+<number> <item>\` → Add items worked (example: +1 diving)
\`<number> <item>\` → Same as above (example: 1 diving)
\`!stats <member>\` → Show stats for a member
\`!res <member>\` → Reset stats for a member
\`!top3\` → Show top 3 workers`
                )
                .setColor(0x1abc9c);
            message.channel.send({ embeds: [embed] });
            return;
        }

        const workMatch = message.content.match(/^\+?(\d+)\s+(\S+)$/i);
        if (!workMatch) return;

        const qty = parseInt(workMatch[1]);
        const item = workMatch[2].toLowerCase();
        const userId = message.author.id;

        let data = loadWorkStats();
        if (!data[userId]) data[userId] = [];
        data[userId].push({ item, qty, time: Date.now() });
        saveWorkStats(data);

        // Nachricht löschen
        message.delete().catch(() => {});
        return;
    }

    // === WORK STATS CHANNEL (LEADERS) ===
    if (message.channel.id === workStatsChannelId) {
        const args = message.content.trim().split(/\s+/);
        const cmd = args[0].toLowerCase();
        const data = loadWorkStats();

        // !help
        if (cmd === "!help") {
            const embed = new EmbedBuilder()
                .setTitle("WorkReports & WorkStats Guide (Leaders)")
                .setDescription(
`**WorkStats Commands**
\`!stats <member>\` → Show stats for a member
\`!res <member>\` → Reset stats for a member
\`!top3\` → Show top 3 workers`
                )
                .setColor(0x1abc9c);
            message.channel.send({ embeds: [embed] });
            return;
        }

        // --- !stats <member>
        if (cmd === "!stats" && args[1]) {
            const memberName = args[1].toLowerCase();
            const guild = message.guild;
            const member = guild.members.cache.find(m => m.user.username.toLowerCase() === memberName || m.user.tag.toLowerCase().startsWith(memberName));
            if (!member) return message.reply("❌ Member not found.").then(msg => setTimeout(()=>msg.delete(),5000));

            const entries = data[member.id] || [];
            if (!entries.length) return message.reply(`No reports for ${member.user.username} in the last 7 days.`).then(msg => setTimeout(()=>msg.delete(),5000));

            let text = "";
            const sevenDaysAgo = Date.now() - 7*24*60*60*1000;
            for (const e of entries) {
                if (e.time >= sevenDaysAgo) {
                    text += `${e.qty} ${e.item} → ${formatTime(e.time)}\n`;
                }
            }
            const embed = new EmbedBuilder()
                .setTitle(`Stats: ${member.user.username}`)
                .setDescription(text)
                .setColor(0x3498db);
            message.channel.send({ embeds: [embed] }).then(msg => setTimeout(()=>msg.delete(),15000));
            message.delete().catch(()=>{});
            return;
        }

        // --- !res <member>
        if (cmd === "!res" && args[1]) {
            const memberName = args[1].toLowerCase();
            const guild = message.guild;
            const member = guild.members.cache.find(m => m.user.username.toLowerCase() === memberName || m.user.tag.toLowerCase().startsWith(memberName));
            if (!member) return message.reply("❌ Member not found.").then(msg => setTimeout(()=>msg.delete(),5000));

            data[member.id] = [];
            saveWorkStats(data);

            const embed = new EmbedBuilder()
                .setTitle("✅ Reset stats")
                .setDescription(`Stats for ${member.user.username} have been reset.\nTime: ${formatTime(Date.now())}`)
                .setColor(0xe67e22);
            message.channel.send({ embeds: [embed] }).then(msg => setTimeout(()=>msg.delete(),10000));
            message.delete().catch(()=>{});
            return;
        }

        // --- !top3
        if (cmd === "!top3") {
            let totals = [];
            for (const [id, entries] of Object.entries(data)) {
                let sum = 0;
                for (const e of entries) sum += e.qty;
                if (sum>0) totals.push({ id, sum, lastTime: entries[entries.length-1].time });
            }
            totals.sort((a,b)=>b.sum - a.sum);
            const top = totals.slice(0,3);

            let text = "";
            for (const t of top) {
                const member = await message.guild.members.fetch(t.id).catch(()=>null);
                if (!member) continue;
                text += `${member.user.username}: ${t.sum} → ${formatTime(t.lastTime)}\n`;
            }
            const embed = new EmbedBuilder()
                .setTitle("Top 3 Workers")
                .setDescription(text || "No data")
                .setColor(0xf1c40f);
            message.channel.send({ embeds: [embed] }).then(msg => setTimeout(()=>msg.delete(),15000));
            message.delete().catch(()=>{});
            return;
        }
    }

    // === STASH CHANNEL HANDLER ===
    if (message.channel.id !== stashChannelId) return;

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
        if (inventory[category][item] < qty) return message.reply("❌ Not enough items!");
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

// --- LOGIN ---
client.login(process.env.TOKEN);
