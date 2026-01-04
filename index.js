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
// Stash Rollen
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

const workReportsChannelId = "1457408055833657364";
const workStatsChannelId = "1457408149899317349";

// Dateien
const inventoryFile = "./inventory.json";
const workFile = path.join(__dirname, "workStats.json");

/* ============================================ */

// Inventory Funktionen
function loadInventory() {
    if (!fs.existsSync(inventoryFile)) return {};
    return JSON.parse(fs.readFileSync(inventoryFile, "utf8"));
}
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
    const botMsg = messages.find(m => m.author.id === client.user.id && m.content.startsWith("```PINKPANTHER STASH"));
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

/* ================== WorkStats ================== */
function loadWorkStats() {
    if (!fs.existsSync(workFile)) return {};
    return JSON.parse(fs.readFileSync(workFile, "utf8"));
}
function saveWorkStats(data) {
    fs.writeFileSync(workFile, JSON.stringify(data, null, 2));
}

/* ================== Ready ================== */
client.once("ready", async () => {
    console.log(`✅ Bot online als ${client.user.tag}`);
    const channel = await client.channels.fetch(stashChannelId).catch(() => null);
    if (channel) updateStash(channel);
});

/* ================== Message Handler ================== */
client.on("messageCreate", async (message) => {
    if(message.author.bot) return;

    // ----------------- Stash Bot -----------------
    if(message.channel.id === stashChannelId){
        if(message.content.toLowerCase() === "!help"){
            return message.channel.send("```DEPOSIT: item qty W/D/M/O\nWITHDRAW: -item qty W/D/M/O```");
        }
        const hasRole = message.member.roles.cache.some(r => allowedRoles.includes(r.name));
        if(!hasRole) return;

        const match = message.content.match(/^(-?)(\S+)\s+(\d+)(?:\s+([WDMO]))?$/i);
        if(!match) return;

        const isWithdraw = match[1]==="-";
        const item = match[2];
        const qty = parseInt(match[3]);
        const catMap = { W: "Weapons", D: "Drugs", M: "Materials", O: "Others" };
        const category = catMap[(match[4]||"O").toUpperCase()];

        const inventory = loadInventory();
        if(!inventory[category]) inventory[category] = {};
        if(!inventory[category][item]) inventory[category][item] = 0;

        if(isWithdraw){
            if(inventory[category][item]<qty) return message.reply("❌ Not enough items!");
            inventory[category][item]-=qty;
            if(inventory[category][item]===0) delete inventory[category][item];
        } else {
            inventory[category][item]+=qty;
        }

        saveInventory(inventory);
        const stashChannel = await client.channels.fetch(stashChannelId);
        updateStash(stashChannel);
        sendLog(isWithdraw?withdrawLogChannelId:depositLogChannelId, isWithdraw?"withdraw":"deposit", message.author, item, qty, category);
        message.delete().catch(()=>{});
        return;
    }

    // ----------------- WorkReports -----------------
    if(message.channel.id === workReportsChannelId){
        const content = message.content.trim();

        // Guide anzeigen
        if(content.toLowerCase() === "!help"){
            const guide = `WorkReports Guide\n\nCommands for members:\n+<number> <item> → Add items worked (example: +1 diving)\n<number> <item> → Same as above`;
            return message.channel.send("```"+guide+"```"); // NICHT löschen
        }

        const match = content.match(/^\+?(\d+)\s+(\S+)$/i);
        if(match){
            const qty = parseInt(match[1]);
            const item = match[2].toLowerCase();
            const stats = loadWorkStats();
            const userName = message.author.username; // NUR Username
            const timestamp = Date.now();

            if(!stats[userName]) stats[userName] = {};
            if(!stats[userName][item]) stats[userName][item] = { total:0, lastUpdated:0 };

            stats[userName][item].total += qty;
            stats[userName][item].lastUpdated = timestamp;

            saveWorkStats(stats);
            message.delete().catch(()=>{}); // Nachricht löschen
        }
        return;
    }

    // ----------------- WorkStats Commands (Leaders) -----------------
    if(message.channel.id === workStatsChannelId){
        const content = message.content.trim();
        const stats = loadWorkStats();

        // Guide für Leader
        if(content.toLowerCase() === "!help"){
            const guide = `WorkStats Guide (Leaders)\n\nCommands:\n!stats <member> → Show stats for a member\n!res <member> → Reset stats for a member\n!top3 → Show top 3 workers`;
            return message.channel.send("```"+guide+"```"); // NICHT löschen
        }

        // Stats
        if(content.toLowerCase().startsWith("!stats ")){
            const name = content.slice(7).trim();
            if(!stats[name]) return message.channel.send(`❌ No reports for ${name} in the last 7 days.`);

            let text = `Stats: ${name}\nWork stats for ${name}:\n`;
            for(const [item,data] of Object.entries(stats[name])){
                text += `${item}: ${data.total}\n`;
            }
            const lastTime = new Date(Math.max(...Object.values(stats[name]).map(d=>d.lastUpdated)));
            text += `Last update: ${lastTime.toLocaleString()}`;

            const msg = await message.channel.send("```"+text+"```");
            setTimeout(()=>msg.delete().catch(()=>{}),10000);
            message.delete().catch(()=>{});
            return;
        }

        // Reset
        if(content.toLowerCase().startsWith("!res ")){
            const name = content.slice(5).trim();
            if(!stats[name]) return message.channel.send(`❌ No reports for ${name}.`);

            delete stats[name];
            saveWorkStats(stats);

            const msg = await message.channel.send(`✅ Reset stats for ${name} at ${new Date().toLocaleString()}`);
            setTimeout(()=>msg.delete().catch(()=>{}),10000);
            message.delete().catch(()=>{});
            return;
        }

        // Top3
        if(content.toLowerCase() === "!top3"){
            const top = Object.entries(stats)
                .map(([user,items])=>[user,Object.values(items).reduce((a,b)=>a+b.total,0), Math.max(...Object.values(items).map(d=>d.lastUpdated))])
                .sort((a,b)=>b[1]-a[1])
                .slice(0,3);
            if(top.length===0) return message.channel.send("No data.");

            let text = "Top 3 Workers\n";
            for(const [user,total,last] of top){
                text += `${user}: ${total} → ${new Date(last).toLocaleString()}\n`;
            }
            const msg = await message.channel.send("```"+text+"```");
            setTimeout(()=>msg.delete().catch(()=>{}),10000);
            message.delete().catch(()=>{});
            return;
        }
    }

});

// ----------------- Login -----------------
client.login(process.env.TOKEN);

