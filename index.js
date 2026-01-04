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
const allowedRoles = ["Two Bar", "One Bar", "Three Stripes Circle", "Two Stripe", "One Stripe"];
const stashChannelId = "1456489075941834949";
const depositLogChannelId = "1456726864134668359";
const withdrawLogChannelId = "1456733883021267038";
const inventoryFile = "./inventory.json";

// WorkReports & Stats
const workReportsChannelId = "1457408055833657364"; // WorkReports
const workStatsChannelId = "1457408149899317349";   // WorkStats (Leaders)
const workFile = path.join(__dirname, "workStats.json");

/* ============================================ */

// ----------------- Inventory Functions -----------------
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
    const botMsg = messages.find(m => m.author.id === client.user.id && m.content.startsWith("```PINKPANTHER STASH"));
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
            { name: "Time", value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: true }
        );
    channel.send({ embeds: [embed] });
}

// ----------------- WorkStats Functions -----------------
function loadWorkStats() {
    if (!fs.existsSync(workFile)) return {};
    return JSON.parse(fs.readFileSync(workFile, "utf8"));
}
function saveWorkStats(data) {
    fs.writeFileSync(workFile, JSON.stringify(data, null, 2));
}

// ----------------- Ready -----------------
client.once("ready", async () => {
    console.log(`✅ Bot online als ${client.user.tag}`);
    const stashChannel = await client.channels.fetch(stashChannelId).catch(()=>null);
    if(stashChannel) updateStash(stashChannel);
});

// ----------------- Message Handler -----------------
client.on("messageCreate", async (message) => {
    if(message.author.bot) return;

    // ----------------- WorkReports -----------------
    if(message.channel.id === workReportsChannelId){
        const content = message.content.trim();
        const match = content.match(/^\+?(\d+)\s+(\S+)$/i);
        
        if(content.toLowerCase() === "!help"){
            const guide = `WorkReports & WorkStats Guide\n\nWorkReports Commands\n+<number> <item> → Add items worked (example: +1 diving)\n<number> <item> → Same as above (example: 1 diving)\n!stats <member> → Show stats for a member\n!res <member> → Reset stats for a member\n!top3 → Show top 3 workers`;
            const sent = await message.channel.send("```" + guide + "```");
            setTimeout(()=>sent.delete().catch(()=>{}),10000);
            return message.delete().catch(()=>{});
        }

        if(match){
            const qty = parseInt(match[1]);
            const item = match[2].toLowerCase();
            const stats = loadWorkStats();
            const userTag = message.author.tag;
            const timestamp = Date.now();

            if(!stats[userTag]) stats[userTag] = { tag: userTag, entries: [] };
            stats[userTag].entries.push({ item, qty, timestamp });
            saveWorkStats(stats);
        }

        return message.delete().catch(()=>{});
    }

    // ----------------- WorkStats (Leader) -----------------
    if(message.channel.id === workStatsChannelId){
        const args = message.content.trim().split(/\s+/);
        const command = args.shift().toLowerCase();

        const stats = loadWorkStats();

        if(command === "!help"){
            const guide = `WorkReports & WorkStats Guide (Leaders)\nWorkStats Commands\n!stats <member> → Show stats for a member\n!res <member> → Reset stats for a member\n!top3 → Show top 3 workers`;
            const sent = await message.channel.send("```" + guide + "```");
            setTimeout(()=>sent.delete().catch(()=>{}),10000);
            return message.delete().catch(()=>{});
        }

        // ----------------- !stats -----------------
        if(command === "!stats" && args.length){
            const searchName = args.join(" ").toLowerCase();
            const memberEntry = Object.values(stats).find(m=>{
                const usernameOnly = m.tag.split('#')[0].toLowerCase();
                return usernameOnly === searchName;
            });
            if(!memberEntry){
                const sent = await message.channel.send(`❌ Member not found.`);
                setTimeout(()=>sent.delete().catch(()=>{}),10000);
                return message.delete().catch(()=>{});
            }

            let text = "";
            memberEntry.entries.forEach(e=>{
                const date = new Date(e.timestamp);
                const dateStr = date.toLocaleDateString() + " " + date.toLocaleTimeString();
                text += `${e.item}: ${e.qty} → ${dateStr}\n`;
            });

            const embed = new EmbedBuilder()
                .setTitle(`Stats: ${memberEntry.tag}`)
                .setDescription(text)
                .setColor(0x3498db);

            const sent = await message.channel.send({ embeds: [embed] });
            setTimeout(()=>sent.delete().catch(()=>{}),10000);
            return message.delete().catch(()=>{});
        }

        // ----------------- !res -----------------
        if(command === "!res" && args.length){
            const searchName = args.join(" ").toLowerCase();
            const memberEntry = Object.keys(stats).find(k=>{
                const usernameOnly = k.split('#')[0].toLowerCase();
                return usernameOnly === searchName;
            });
            if(!memberEntry){
                const sent = await message.channel.send(`❌ Member not found.`);
                setTimeout(()=>sent.delete().catch(()=>{}),10000);
                return message.delete().catch(()=>{});
            }

            stats[memberEntry].entries = [];
            saveWorkStats(stats);

            const embed = new EmbedBuilder()
                .setTitle(`✅ Reset stats for ${stats[memberEntry].tag}`)
                .setDescription(`Date: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`)
                .setColor(0xe67e22);
            const sent = await message.channel.send({ embeds: [embed] });
            setTimeout(()=>sent.delete().catch(()=>{}),10000);
            return message.delete().catch(()=>{});
        }

        // ----------------- !top3 -----------------
        if(command === "!top3"){
            const topArr = Object.values(stats)
                .map(m=>{
                    const total = m.entries.reduce((a,b)=>a+b.qty,0);
                    const lastTime = m.entries.length? new Date(m.entries[m.entries.length-1].timestamp) : null;
                    return { tag: m.tag, total, lastTime };
                })
                .sort((a,b)=>b.total - a.total)
                .slice(0,3);

            let text = "";
            topArr.forEach(t=>{
                const dateStr = t.lastTime ? t.lastTime.toLocaleDateString() + " " + t.lastTime.toLocaleTimeString() : "N/A";
                text += `${t.tag}: ${t.total} → ${dateStr}\n`;
            });

            const embed = new EmbedBuilder()
                .setTitle("Top 3 Workers")
                .setDescription(text || "No reports yet.")
                .setColor(0x2ecc71);

            const sent = await message.channel.send({ embeds: [embed] });
            setTimeout(()=>sent.delete().catch(()=>{}),10000);
            return message.delete().catch(()=>{});
        }
    }

    // ----------------- Stash Handler -----------------
    if(message.channel.id !== stashChannelId) return;
    if(message.content.toLowerCase() === "!help"){
        const sent = await message.channel.send("```DEPOSIT: item qty W/D/M/O\nWITHDRAW: -item qty W/D/M/O```");
        return;
    }

    const hasRole = message.member.roles.cache.some(r => allowedRoles.includes(r.name));
    if(!hasRole) return;

    const match = message.content.match(/^(-?)(\S+)\s+(\d+)(?:\s+([WDMO]))?$/i);
    if(!match) return;

    const isWithdraw = match[1] === "-";
    const item = match[2];
    const qty = parseInt(match[3]);
    const catMap = { W: "Weapons", D: "Drugs", M: "Materials", O: "Others" };
    const category = catMap[(match[4] || "O").toUpperCase()];

    const inventory = loadInventory();
    if(!inventory[category]) inventory[category] = {};
    if(!inventory[category][item]) inventory[category][item] = 0;

    if(isWithdraw){
        if(inventory[category][item]<qty) return message.reply("❌ Not enough items!");
        inventory[category][item]-=qty;
        if(inventory[category][item]===0) delete inventory[category][item];
    }else{
        inventory[category]+=qty;
    }

    saveInventory(inventory);
    const stashChannel = await client.channels.fetch(stashChannelId);
    updateStash(stashChannel);
    sendLog(isWithdraw? withdrawLogChannelId:depositLogChannelId, isWithdraw?"withdraw":"deposit", message.author,item,qty,category);
    message.delete().catch(()=>{});
});

// ----------------- Login -----------------
client.login(process.env.TOKEN);
